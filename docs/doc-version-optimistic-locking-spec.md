# `doc_version` Optimistic Locking — End-to-End Contract (as-built)

**Status:** Implemented & verified (frontend on `main` via PR #6; backend reads + guards on `main` of `carmen-turborepo-backend-v2`; e2e conflict test green).
**Repos:** `carmen-platform` (frontend) · `carmen-turborepo-backend-v2` (backend) · `carmen-platform-e2e` (Playwright).
**Design doc:** `docs/superpowers/specs/2026-06-26-doc-version-optimistic-locking-design.md`.

## Problem

Two admins editing the same record would silently overwrite each other — last write wins, no warning. Optimistic locking makes the *second* (stale) save fail loudly instead.

## The token

Every versioned table has a numeric `doc_version` column (default `0`). It is **not** user-editable. The client reads it on load and echoes it back on update; the server bumps it on every successful write.

## Lifecycle (happy path + conflict)

```
GET  /entity/:id        → { ..., doc_version: N }          (read MUST expose it)
PUT  /entity/:id        body includes doc_version: N
  server: UPDATE ... WHERE id = :id AND doc_version = N
          → match:    SET doc_version = N+1   → 200 { id, doc_version: N+1 }
          → no match: row exists but version moved → 409 conflict
```

Concurrent case: A and B both load `N`. A saves → server sets `N+1`. B saves with stale `N` → `WHERE doc_version = N` matches nothing → **409**.

## Backend contract

### Optimistic-lock hook (the engine)
`packages/prisma-shared-schema-platform/src/index.ts` (mirrored in the tenant schema) wraps the system PrismaClient with a `$extends` `update` hook:
- **Opt-in per call:** engages only when `where.doc_version` is a number; otherwise a normal pass-through update.
- **Auto-increments:** if `data.doc_version` is `undefined`, sets `{ increment: 1 }` on success — so services must *not* write `doc_version` into `data`.
- **Conflict:** on Prisma `P2025` (no row) where the row still exists, throws `OptimisticLockError` (`code: 'DOC_VERSION_CONFLICT'`).

### Update services — require + guard
The established pattern (e.g. `departments.service.ts`, and the platform entities) in each `update`:
```ts
if (!record) return Result.errorFromCatalog(ERROR_CATALOG.<X>_NOT_FOUND);
if (typeof data.doc_version !== 'number')
  return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);   // → HTTP 400
await prisma.tb_x.update({
  where: { id, doc_version: data.doc_version },                                 // engages the hook
  data:  { ...fields },                                                         // no doc_version key → auto-increment
});
```

### Reads — MUST expose `doc_version` (the easy thing to miss)
Read services use explicit Prisma `select` clauses and often **map** rows into DTOs. Both layers drop unselected/unmapped fields, so `doc_version` must be added in **both** places:
- Add `doc_version: true` to the **top-level** entity `select` (not nested relation selects).
- If the result is mapped/serialized (`rows.map(r => ({ id: r.id, ... }))`) **or** parsed through a Zod response schema that strips unknown keys, re-inject `doc_version: r.doc_version` into the mapped object after the strip.

If the read does not expose `doc_version`, the client has nothing to echo back and every guarded update returns **400 `doc_version: Required`**. **Deployment ordering matters: reads must expose `doc_version` before (or with) updates requiring it.**

### Gateway DTOs strip unknown keys
The gateway runs a global `ZodValidationPipe`. For `@Body()` typed as a `createZodDto` class, unknown keys are stripped → `doc_version` must be added to the Zod update schema. For plain swagger-class or `Record<string, unknown>` bodies, it passes through (add to the swagger DTO for docs only).

### HTTP error shape (how the frontend detects a conflict)
`OptimisticLockError` → `TryCatch` maps it to `ErrorCode.ALREADY_EXISTS` → **HTTP 409**, body `{ message: "Record was modified by another request (model=…, expected doc_version=…)", … }`. The catalog-localization path is skipped (no catalog `code`), so the **English message is preserved**. Note the response has **no top-level `data.code`** (the catalog code, when present, lives under `data.error.code` and is `ALREADY_EXISTS` here — same as a name-collision 409). **Therefore conflict detection is message-based**, and the message string is load-bearing.

## Frontend contract (`carmen-platform`)

### Helper — `src/utils/docVersion.ts`
- `getDocVersion(record): number | undefined`
- `isVersionConflict(err): boolean` — `status === 409` **and** (`code === 'DOC_VERSION_CONFLICT'` **or** message matches `/modified by another request|doc_version/i`). The message branch is the real discriminator (see above).
- `notifyVersionConflict(): void` — the single conflict toast (`"This record was changed by someone else"`).

### Per Edit page (reference: `ClusterEdit.tsx`)
1. `const [docVersion, setDocVersion] = useState<number>()` — **never** in `formData`.
2. On load: `setDocVersion(getDocVersion(record))` inside `fetchX`.
3. On update: `service.update(id, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) })`. Create paths never send it.
4. After save: existing `fetchX()` refreshes `docVersion`.
5. On conflict: `if (isVersionConflict(err)) { notifyVersionConflict(); await fetchX(); } else { <existing error handling> }`. Stays in edit mode; in-flight edits discarded, reloaded to latest.

**Defensive principle:** send the token only when the GET returned one → un-wired entities are a runtime no-op.

Services with **custom write payloads** forward it explicitly: `applicationService.toWritePayload`, `roleService.update`, `newsService.buildNewsFormData` (multipart appends `doc_version` as a **string**; the backend `news-body.parser.ts` coerces it to a number). `doc_version?: number` is added (optional) to each entity type.

## Entity coverage

| Edit page | Frontend route | Backend update service | Read exposes? | Locked? |
|---|---|---|---|---|
| Cluster | `/api-system/clusters` | `micro-cluster cluster.service` | yes | ✅ |
| BusinessUnit | `/api-system/business-units` | `micro-cluster business-unit.service` | yes | ✅ |
| ReportTemplate | `/api-system/report-templates` | `micro-cluster report-template.service` | yes | ✅ |
| News | `/api/news` | `micro-cluster news.service` | yes | ✅ |
| Application | `/api-system/applications` | `micro-cluster application.service` | yes | ✅ |
| User | `/api-system/user` | `micro-cluster user.service` | yes | ✅ |
| Role | `/api-system/platform/roles` | `micro-business **platform_role**.service` | yes | ✅ |
| PrintTemplateMapping | `/api-system/print-template-mapping` | (read not exposed) | no | no-op until wired |

**Gotcha — two role systems:** the admin "Role" page edits **platform roles** (`/api-system/platform/roles` → `platform_role` service, returns `permission_count`/`audit`), **not** application-roles (`/api-system/roles` → `role.service`/`ApplicationRoleService`). Guard/read changes for the admin role page go in `platform_role.service`. (application-roles also has the guard, as a consistent bonus.)

## E2E (`carmen-platform-e2e`)

`tests/clusters/cluster-optimistic-lock.spec.ts` (branch `test/cluster-optimistic-lock`): two browser contexts (shared `.auth/user.json`) edit the same cluster; A saves first (200, version bumps), B's stale save → **409** → asserts the "changed by someone else" toast and that the form auto-reloads to A's value. **Verified green** end-to-end against the running stack (`1 passed`).

Note: the standard update specs (`cluster-edit`, `application-edit`, `user-edit`, `role-crud`) are UI-driven and need **no** change — the frontend (the SUT) sends `doc_version` automatically. They only pass once the corresponding backend read exposes the token.

## Verification done
- Live API: all platform reads return `doc_version`.
- Backend services typecheck clean; service unit specs green (application 19/19, application-role 7/7, user 8/8).
- Frontend `tsc --noEmit` clean; `CI=true bun run build` clean.
- E2E conflict test green end-to-end.
