# Tenant Migration — Streaming Deploy Progress

**Date:** 2026-06-30
**Status:** Approved (design)
**Repos:** `carmen-turborepo-backend-v2` (micro-business + backend-gateway) and `carmen-platform` (frontend)

## Problem

Applying tenant-schema migrations is a single request/response: the frontend
`TenantMigrationCard` calls `POST /api-system/tenant/migrations/:bu_id/deploy`,
the gateway forwards it to micro-business over TCP, and micro-business shells out
to `prisma migrate deploy` via a **buffered** `execFileAsync` that only returns
when every migration has been applied. A tenant 50+ migrations behind shows a
spinner for a long time with no feedback. We want **live progress** — a progress
bar plus a log of each migration as it is applied.

## Decisions (locked during brainstorming)

- **Scope:** stream both single-BU `deploy` and batch `deployAll` in the backend.
  The frontend wires only the existing single-BU `TenantMigrationCard` (there is no
  batch UI today; a migrate-all page is a separate add-on, out of scope).
- **Transport (Approach A):** true end-to-end streaming. micro-business returns an
  `Observable<ProgressEvent>` from a `@MessagePattern` handler (NestJS TCP transport
  streams each emission); the gateway subscribes and writes **NDJSON** (one JSON
  object per line) to the Express response; the frontend reads it with
  `fetch` + `ReadableStream`.
- **NDJSON, not SSE framing** — the client consumes via `fetch` (needed to send the
  `Authorization` + `x-app-id` headers; `EventSource` cannot set headers), so SSE's
  `data:`/`event:` framing buys nothing.
- **New endpoint, keep the old one:** add `POST :bu_id/deploy/stream`; the existing
  buffered `:bu_id/deploy` stays so CI/CD (x-deploy-token) is unaffected.
- **Client disconnect does NOT abort the migration** — aborting `migrate deploy`
  mid-run is dangerous. On disconnect the gateway stops writing; the prisma
  subprocess runs to completion and releases its lock.

## Event Schema — `ProgressEvent` (NDJSON)

One JSON object per line. Discriminated union shared by single and batch:

```ts
type ProgressEvent =
  | { type: 'start';       bu_id: string; bu_code: string; total: number }
  | { type: 'applying';    bu_id: string; bu_code: string; name: string; index: number; total: number }
  | { type: 'bu-complete'; bu_id: string; bu_code: string; success: boolean; applied: string[]; already_up_to_date: boolean; error?: string }
  | { type: 'log';         message: string }
  | { type: 'done';        success: boolean; summary: DeploySummary }
  | { type: 'error';       message: string }
```

- **single-BU:** `start → applying* → done`
- **batch (all):** `(start → applying* → bu-complete)×N → done` where `done.summary`
  carries `{ total, succeeded, failed, results }` (same shape `deployAll` returns today).
- `total` = pending count, obtained from a cheap pre-deploy `migrate status` so the
  progress bar has a determinate denominator. `index` increments per applied migration.
- `applying` events drive both the progress bar (`index/total`) and the live log.
- `log` events (sanitized raw lines) are optional/diagnostic; the live log can be
  built from `applying` names alone.

## Backend — micro-business (`apps/micro-business/src/authen/tenant_migration/`)

`tenant_migration.service.ts`:

- New `spawnPrisma(args: string[], databaseUrl: string): Observable<string>` — uses
  `child_process.spawn` (not buffered `execFileAsync`), reads stdout+stderr
  line-by-line (`readline`), emits each **sanitized** line, enforces the timeout
  (`SIGKILL` after `TENANT_MIGRATION_TIMEOUT_MS`), completes with the exit code (an
  error if non-zero/timed-out). Reuses the existing `sanitize`, `buildChildEnv`,
  `parseMigrationNames`, `prismaBin`, `schemaPath`.
- New `deployStream(bu_id): Observable<ProgressEvent>`:
  1. `resolveConnection(bu_id)` — on failure the Observable **errors** (RxJS error
     carrying the `ErrorCode`/message), emitting NO `start`, so the gateway maps it to
     a pre-stream HTTP error (see Error Handling).
  2. Acquire the per-BU lock (`runningBuIds`); a busy lock likewise **errors** the
     Observable (ALREADY_EXISTS → 409) before any `start`. Release via RxJS
     `finalize()`.
  3. Run `migrate status` once → `total` pending → emit `start`.
  4. `spawnPrisma(['migrate','deploy', …])`; on each `Applying migration \`X\`` line
     emit `applying{ name, index, total }`; optionally emit `log`.
  5. On success emit `done{ success: true, summary }`; on non-zero/timeout emit
     `done{ success: false }` (single-BU summary mirrors `TenantMigrationDeployResult`).
- New `deployAllStream(): Observable<ProgressEvent>` — guards `isBatchRunning`
  (release via `finalize`), `listActiveConnections()`, then concatenates each BU's
  per-BU stream (start → applying* → bu-complete), continuing on per-BU failure,
  ending with one `done{ summary: { total, succeeded, failed, results } }`.
- The existing buffered `deploy`/`deployResolved`/`deployAll` stay unchanged.

`tenant_migration.controller.ts`:

- New `@MessagePattern({ cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' })`
  handler that returns the Observable directly (NestJS streams each emission over
  TCP). `bu_id === 'all'` → `deployAllStream()`, else `deployStream(bu_id)`. Wrap in
  the existing `runWithAuditContext`. Emits raw `ProgressEvent`s (bypasses
  `handleResult`, which is for single-envelope replies).

## Backend — gateway (`apps/backend-gateway/src/platform/tenant-migrations/`)

`tenant-migrations.service.ts`:

- New `runDeployStream(bu_id): Observable<ProgressEvent>` =
  `this.client.send({ cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' }, { bu_id, ...getGatewayRequestContext() })`.
  Returns the Observable as-is (NO `firstValueFrom`). `catchError` → emit a terminal
  `{ type: 'error', message }`.

`tenant-migrations.controller.ts`:

- New `@Post(':bu_id/deploy/stream')` under the existing `TenantMigrationGuard`.
  Signature `(@Req() req, @Res() res, @Param('bu_id') id)`.
  - Write headers **lazily on the first emitted event**: `Content-Type:
    application/x-ndjson`, `Cache-Control: no-cache, no-transform`,
    `X-Accel-Buffering: no`, `Connection: keep-alive`; `res.flushHeaders()`. Ensure no
    gzip/compression buffers this route.
  - Subscribe to `runDeployStream(id)`: each event → (write headers if not yet sent) →
    `res.write(JSON.stringify(ev) + '\n')`; `complete` → `res.end()`.
  - **`error` before any event** (headers not sent) → respond with the mapped HTTP
    error (e.g. 409/422/500) like the buffered endpoint. **`error` after headers sent**
    → write one `{type:'error'}` NDJSON line then `res.end()`.
  - `req.on('close')` → `unsubscribe()` (stops writing; does not cancel the
    subprocess — see Decisions).
  - Audit log: one entry at start and one at the terminal event (`done`/`error`).
- The buffered `@Post(':bu_id/deploy')` stays.
- Swagger: document the new endpoint produces `application/x-ndjson` (a streamed
  sequence of `ProgressEvent`); no `ApiStdResponse` envelope.

## Frontend (`carmen-platform`)

`src/types/index.ts`: add the `ProgressEvent` union and `DeploySummary`.

`src/services/tenantMigrationService.ts`: add
`deployStream(buId: string, onEvent: (e: ProgressEvent) => void): Promise<DeploySummary>`:

- `fetch(\`${api.defaults.baseURL ?? ''}/api-system/tenant/migrations/${buId}/deploy/stream\`, { method: 'POST', headers: { Authorization: \`Bearer ${localStorage.getItem('token')}\`, 'x-app-id': import.meta.env.REACT_APP_API_APP_ID } })`.
- If `!res.ok` (pre-stream auth/403/409) → throw a parseable error (read JSON body).
- Read `res.body!.getReader()`, decode with `TextDecoder`, split on `\n`, buffer the
  partial trailing line, `JSON.parse` each complete line, call `onEvent(ev)`.
- Resolve with the `done` event's `summary`; reject on a terminal `error` event or a
  stream read error. Keep the existing `deploy(buId)` method (still maps to the
  buffered endpoint) for parity.

`src/components/TenantMigrationCard.tsx`: on confirm, call `deployStream` instead of
`deploy`. New local state: `progress: { applied: number; total: number; current: string | null }`
and `logLines: string[]`. While streaming render a progress bar (`applied/total`) +
the live log inside the existing `max-h-48 overflow-auto` scroll box. On `done` →
success/info toast + `fetchStatus()`; on error → `handleMigrationError`. Disable the
controls while `deploying`.

## Infra note

Production nginx in front of the gateway must not buffer this route: it honors the
`X-Accel-Buffering: no` response header, or set `proxy_buffering off` for the
`…/deploy/stream` location. The Vite dev proxy streams chunked responses already.

## Error Handling

The dividing line is whether the first event (`start`) has been emitted, i.e. whether
NDJSON headers were sent:

- **Pre-stream** (403 guard, resolveConnection failure, 409 lock): the micro Observable
  errors before emitting `start`, so the gateway responds with a normal HTTP error and
  no NDJSON body. The frontend `fetch` sees `!res.ok` and surfaces it like today.
- **Mid-stream** (a migration fails, timeout): `start` was already emitted and HTTP
  status is 200, so the failure is an in-band terminal `{ type: 'error' }` (or
  `done{ success:false }`) event. The frontend's stream reader distinguishes the two
  paths (HTTP error vs terminal event).

## Tests

- **micro-business:** `deployStream` emits `start → applying* → done` in order for a
  mocked spawn; the per-BU lock is released on `finalize` (success and error); lines
  are sanitized; `deployAllStream` emits per-BU `bu-complete` and a final `done`
  summary, continuing past a failing BU.
- **gateway:** the `/deploy/stream` handler writes one NDJSON line per event, sets the
  anti-buffering headers, ends the response on complete, and unsubscribes on client
  `close` (mock the service Observable + a fake `res`).
- **frontend:** `deployStream` parses a chunked NDJSON `ReadableStream` (including a
  line split across chunks) and invokes `onEvent` for every event, resolving with the
  `done` summary (mock `fetch`); `TenantMigrationCard` renders the progress bar and
  live log from streamed events and finalizes on `done` (mock the service).

## Files Touched

| Repo | File | Change |
|------|------|--------|
| backend | `micro-business/.../tenant_migration.service.ts` | `spawnPrisma`, `deployStream`, `deployAllStream` |
| backend | `micro-business/.../tenant_migration.controller.ts` | `deploy-stream` message pattern (returns Observable) |
| backend | `backend-gateway/.../tenant-migrations.service.ts` | `runDeployStream` (no `firstValueFrom`) |
| backend | `backend-gateway/.../tenant-migrations.controller.ts` | `POST :bu_id/deploy/stream` (NDJSON + headers) |
| backend | `backend-gateway/.../swagger/response.ts` | document the stream endpoint |
| frontend | `src/types/index.ts` | `ProgressEvent`, `DeploySummary` |
| frontend | `src/services/tenantMigrationService.ts` | `deployStream` (fetch + ReadableStream) |
| frontend | `src/components/TenantMigrationCard.tsx` | progress bar + live log from the stream |
| both | co-located tests | per the Tests section |

## Out of Scope / Non-goals

- No batch (migrate-all) frontend page — backend streams `'all'`, but no new UI.
- The buffered `:bu_id/deploy` endpoint is unchanged (CI/CD parity).
- Client disconnect does not cancel an in-flight migration.
- No new storage/infra (no Redis/DB progress store — that was rejected Approach B).
