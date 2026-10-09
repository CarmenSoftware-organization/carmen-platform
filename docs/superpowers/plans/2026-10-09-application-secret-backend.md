# Application Secret — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `tb_application` an optional secret (`cas_` + 40 base62) that clients send as `x-app-secret`, stored AES-256-GCM-encrypted so admins can reveal it again, rotatable with a 24 h grace window for the previous secret, and enforced per app by the gateway's `AppIdGuard` only when the app's `require_secret` switch is on.

**Architecture:** An expand-only migration adds seven columns to `tb_application` plus two CHECK constraints. **Encryption lives only in micro-cluster and reuses the existing `@repo/secret-crypto` package** (`encryptSecret`/`decryptSecret`, key `SECRET_ENCRYPTION_KEY`, stored format `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`): micro-cluster generates, encrypts, decrypts (reveal) and — once per allowlist snapshot — turns each app's current and unexpired previous secret into SHA-256 digests that ride the existing `allowlistSnapshotV2` RPC. The gateway never sees the key, ciphertext or plaintext of stored secrets and needs no new env var; its store holds digests, and `AppIdGuard` compares `sha256(x-app-secret)` with `timingSafeEqual` right after the "401 unknown app" step. Three new admin routes (rotate / reveal / enforcement) proxy to three new micro-cluster handlers. Changes reach every gateway on the next allowlist refresh (`APP_ALLOWLIST_TTL_MS`, default 60 s) — the same way status changes do today: **there is no push refresh** for either.

**Why reuse `@repo/secret-crypto` (user decision) and keep decryption in micro-cluster:** micro-cluster already depends on the package (`apps/micro-cluster/package.json:39`, used by `database-pool.service.ts:3` and `email-sender-profile.service.ts:3`) and already refuses to boot without `SECRET_ENCRYPTION_KEY` (`apps/micro-cluster/src/libs/config.env.ts:52`, `z.string().min(1)`), so there is **no new key to provision, no env-schema/.env.example/external-secrets change, and no deploy step for a key**. The guard needs only digests, which micro-cluster computes once per snapshot — the gateway gets neither the key nor a new env var. Package behaviour this plan relies on (`packages/secret-crypto/src/crypto.util.ts`):
- `encryptSecret(plaintext)` (`:57-70`) returns `enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>` with a fresh 12-byte IV; it returns an empty input unchanged (never the case here — secrets are 44 chars); it throws only when the key is unusable.
- `decryptSecret(value)` (`:75-97`) **throws** on a value without the `enc:v1:` prefix (`:76-80`), a malformed value (`:84-87`), an unusable key, and a GCM auth failure (wrong key or tampered ciphertext, from `decipher.final()`).
- `getKey()` (`:24-48`) reads `SECRET_ENCRYPTION_KEY` (64-char hex or base64, must be 32 bytes) and **caches it for the process lifetime** (`cachedKey`, `:22`/`:47`) — a key change needs a restart. The boot check only enforces *non-empty*, so a wrong-length key passes boot and throws on first use.
- The same key is shared with micro-business and micro-notification (`:12-15`). **Consequence:** rotating `SECRET_ENCRYPTION_KEY` (for SMTP passwords / DB pools) also invalidates every stored app secret — enforced apps would then fail closed until each app is rotated. Anyone rotating that key must rotate app secrets too.

**Tech Stack:** NestJS 11 (gateway + micro-cluster), Prisma (platform schema), `@repo/secret-crypto` (AES-256-GCM, `enc:v1`), Node `node:crypto` (`randomBytes`, SHA-256, `timingSafeEqual`), `@repo/rpc-contract` (generated), `@repo/error-catalog`, `@repo/log-events-library` (audit), zod v4 / nestjs-zod, Bun, Jest.

**Spec:** `carmen-platform/docs/superpowers/specs/2026-10-09-application-secret-design.md` (Backend, Rollout, Verification)

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` — every path below is relative to it.

## Global Constraints

- Branch: `feature/application-secret`, created from an up-to-date `main` (`git fetch origin && git switch -c feature/application-secret origin/main`). Never commit to `main`.
- **No new test files.** Do not create `*.spec.ts` / `*.test.ts`, and do not run tests "to see them fail". Existing specs must still pass; where an existing spec breaks only because a mock/provider lacks a new dependency or method, update that mock/provider — nothing else.
- Static checks per task: `bun run check-types` inside each touched app/package, `bunx eslint <changed files>` (no `--fix`), `npx prettier --write <changed files>` (the `gates` script runs `prettier --check` over the repo). **Never run `bun run lint`** — every app declares it as `eslint … --fix` over the whole tree.
- Jest: run per path from inside the app with `bunx jest <path> --runInBand --forceExit` (LokiTransport keeps Jest alive otherwise).
- Secret format, exactly: `cas_` + 40 chars from `[0-9A-Za-z]`, drawn from `crypto.randomBytes` with rejection sampling (≈238 bits).
- Ciphertext format, exactly: whatever `encryptSecret` from `@repo/secret-crypto` returns — `enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`, AES-256-GCM under `SECRET_ENCRYPTION_KEY`. Never hand-roll crypto; never add an `APP_SECRET_ENC_KEY`.
- `APP_SECRET_KEY_UNAVAILABLE` (503) now means **"micro-cluster could not decrypt (or, for rotate, encrypt) with `SECRET_ENCRYPTION_KEY`"** — key changed since the secret was written, corrupt ciphertext, or a wrong-length key. The name is kept because the platform FE plan already handles it.
- Grace window: 24 h (`APP_SECRET_GRACE_MS = 86_400_000`).
- Error codes, exactly: `APP_SECRET_INVALID` (401, guard), `APP_SECRET_MISSING` (400), `APP_SECRET_SELF_LOCK` (409), `APP_SECRET_KEY_UNAVAILABLE` (503), `APP_SECRET_NOT_FOUND` (404, reveal when the app has no secret).
- Permission keys, exactly: `application.secret.manage` (rotate, enforcement), `application.secret.reveal` (reveal). Stored as `resource: 'application'`, `action: 'secret.manage' | 'secret.reveal'` — keys are composed as `` `${resource}.${action}` `` everywhere (micro-business `platform_permission.service.ts:54`, `check.api-system-permission-coverage.ts:617`), and the platform FE splits on the **first** dot (`RoleEdit.tsx:329`), so a dotted action is safe. Platform Admin gets both through its existing `application.*` grant (`seed.platform-role-permission.data.ts:17`, expanded per resource by `expandPatterns`, `:127-146`); no other role gets them.
- App-id api_names, exactly: `application.secretRotate`, `application.secretReveal`, `application.secretEnforcement` (catalog convention is `<module>.<camelCaseVerb>`, e.g. `ap-invoice.createFromGrn`). **Trap:** a new api_name that an app's allowlist lacks answers 401, which the platform FE turns into refresh-then-logout. `platform-web-management` is seeded `allow_all: true` (`prisma/seed.application-api.data.ts:258-262`) and is `allow_all = TRUE` on DEV — the deploy task still verifies every env before the FE ships.
- Ciphertext **never** leaves micro-cluster: not in `findAll`/`findOne`, not in the snapshot (digests only), not in logs, redacted in `tb_activity` (Task 4 adds both ciphertext columns to `sensitiveFields` — the redactor matches whole key names only, so the existing `'secret'` entry does **not** cover `secret_ciphertext`).
- Plaintext appears in exactly two responses: rotate and reveal. Both set `Cache-Control: no-store`. Never log a secret (no `debug` of results, no secret in audit metadata).
- Migration is **expand-only** (ADD COLUMN with defaults, CHECKs that hold for every existing row). Pushing a branch that contains a migration applies it to DEV within ~2 minutes even unmerged.
- Every new `/api-system` route carries `AppIdGuard('<api_name>')`, `PlatformPermissionGuard` and `@RequirePlatformPermission(...)` with a key present in `PLATFORM_PERMISSION_SEED` (`audit:api-system-permission`).
- Bilingual JSDoc (English line + Thai line, `@param`/`@returns`) on every new exported symbol and method — enforced by `carmen/jsdoc-bilingual` / `carmen/jsdoc-zod-schema`.
- Naming: snake_case only for DB/wire keys; locals camelCase (`@typescript-eslint/naming-convention`).

## Review Focus

1. **Stored secret does not decrypt** (`SECRET_ENCRYPTION_KEY` changed since it was written, or corrupt ciphertext) — expected: reveal → 503 `APP_SECRET_KEY_UNAVAILABLE`; enabling enforcement → 503 (would lock the app out); the snapshot build **skips that app's digests and logs an error, never throws** — every other app's snapshot entry is unaffected; an app already `require_secret=true` then fails **closed** (every request 401 `APP_SECRET_INVALID`) until it is rotated (rotate needs no decrypt and repairs it). No missing-key case exists: micro-cluster does not boot without `SECRET_ENCRYPTION_KEY`. Owned by Tasks 4 and 6; manual check in Task 9 Step 5 (local DB, one app's ciphertext deliberately corrupted).
2. **Snapshot lag after rotate/enforce** — there is **no push refresh**: each gateway's `AppAllowlistRefresher` polls `allowlistSnapshotV2` every `APP_ALLOWLIST_TTL_MS` (default 60 s, `app-allowlist.refresher.ts:34-40`) and skips a tick while a refresh is in flight, exactly as for status changes. Expected: a change takes effect at each gateway within ~60–90 s. On an enforced app, the *new* secret is rejected until the next refresh while the previous one keeps working (grace); right after the *first* generate, the self-lock check can return 409 for ≤ 60 s because the gateway has no digest yet. Owned by Tasks 6–8; curl in Task 9 waits 65 s between change and probe.
3. **Ciphertext/plaintext leakage** — expected: `jq '.data | keys'` on findOne/list shows no `secret_ciphertext`/`secret_previous_ciphertext`; snapshot carries only hex digests; `tb_activity` rows for this app show `[REDACTED]` for both ciphertext columns; rotate/reveal responses carry `Cache-Control: no-store`. Owned by Tasks 4–6, 8; verified in Task 9 Step 4.
4. **Concurrent rotations** — expected: the second one gets 409 (rotate locks on the `doc_version` it just read), never a silent loss where a caller holds a secret that is neither current nor previous. Owned by Task 6; manual check in Task 9 Step 4.
5. **Guard order** — the secret check sits right after "401 unknown app", so it runs before `statusProbe` and before the `disabled` 403: a disabled app with `require_secret` and a wrong secret answers 401 `APP_SECRET_INVALID`, not 403. `GET /api/app-status` also requires the secret for enforced apps. Owned by Task 7; curl row in Task 9.
6. **Self-lock** — expected: `PATCH …/:id/secret/enforcement {require_secret:true}` where `:id` is the caller's own `x-app-id` and the request lacks that app's valid secret → 409 `APP_SECRET_SELF_LOCK`, row unchanged; disabling is never blocked. Owned by Task 8; curl in Task 9.
7. **Every reveal audited** — expected: one `tb_activity` row (`action='view'`, `meta_data.event_type='application.secret.revealed'`) per GET, and one `update` row with `event_type='application.secret.rotated'` per rotate. Owned by Task 6; checked in Task 9 Step 4.

---

## API contract (consumed by the platform FE plan)

Envelope is the gateway's `StdResponse` (`packages/nest-result/src/std-response.ts:154-180`). Success:

```json
{ "data": { … }, "status": 200, "success": true, "message": "Success", "timestamp": "2026-10-09T08:00:00.000Z" }
```

Errors carry the catalog code at `error.code` in **both** error paths — micro-cluster errors returned through `respond()` (`base-http-controller.ts:114-134`) and `HttpException`s thrown in the gateway (`exception.fillter.ts:237-247`). The top-level `message` is the catalog text localized by `Accept-Language`. Match on `error.code`, never on `message`:

```json
{ "data": null, "status": 400, "success": false, "message": "Generate a secret before requiring it", "timestamp": "…", "error": { "code": "APP_SECRET_MISSING", "id": 8080007 } }
```

(`id` is `makeId(MODULE.APPLICATION, n)`; shown for shape only — do not depend on its value.)

### `POST /api-system/applications/:application_id/secret/rotate`

- Headers: `Authorization`, `x-app-id` (needs `application.secretRotate` or `allow_all`). No body.
- Permission: `application.secret.manage`. Response header `Cache-Control: no-store`.
- First call generates; later calls rotate (current → previous, valid 24 h). Bumps `doc_version`.

```json
{
  "data": {
    "id": "0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90",
    "secret": "cas_7Hq2LmZ0pX4vR9sT1uW3yA5bC8dE6fG2hJ4ka91f",
    "last4": "a91f",
    "rotated_at": "2026-10-09T08:00:00.000Z",
    "previous_expires_at": "2026-10-10T08:00:00.000Z",
    "doc_version": 7
  },
  "status": 200, "success": true, "message": "Success", "timestamp": "2026-10-09T08:00:00.000Z"
}
```

`previous_expires_at` is `null` on the first generate. Errors: 403 (permission), 404 `APPLICATION_NOT_FOUND`, 409 (concurrent rotate — stale `doc_version`, same response as a stale `PUT /api-system/applications/:id`), 503 `APP_SECRET_KEY_UNAVAILABLE` (only if `encryptSecret` throws — a wrong-length `SECRET_ENCRYPTION_KEY`; rotate never decrypts, so it is also the way to repair an app whose stored secret no longer decrypts).

### `GET /api-system/applications/:application_id/secret`

- Headers: `Authorization`, `x-app-id` (needs `application.secretReveal` or `allow_all`).
- Permission: `application.secret.reveal`. Response headers `Cache-Control: no-store`, `Pragma: no-cache`. Every call writes an audit row.

```json
{
  "data": { "id": "0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90", "secret": "cas_7Hq2LmZ0pX4vR9sT1uW3yA5bC8dE6fG2hJ4ka91f", "last4": "a91f" },
  "status": 200, "success": true, "message": "Success", "timestamp": "…"
}
```

Errors: 403, 404 `APPLICATION_NOT_FOUND`, 404 `APP_SECRET_NOT_FOUND` (app has no secret yet), 503 `APP_SECRET_KEY_UNAVAILABLE` (the stored secret does not decrypt — `SECRET_ENCRYPTION_KEY` changed since it was written, or corrupt ciphertext; fix by rotating).

### `PATCH /api-system/applications/:application_id/secret/enforcement`

- Headers: `Authorization`, `x-app-id` (needs `application.secretEnforcement` or `allow_all`); `x-app-secret` when `:application_id` is the caller's own app and you are enabling.
- Permission: `application.secret.manage`.
- Body: `{ "require_secret": true, "doc_version": 6 }` — `doc_version` optional (send it when the GET returned one).

```json
{
  "data": { "id": "0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90", "require_secret": true, "doc_version": 8 },
  "status": 200, "success": true, "message": "Success", "timestamp": "…"
}
```

Errors: 400 (body not `{require_secret: boolean}`), 400 `APP_SECRET_MISSING` (enabling with no secret), 403, 404 `APPLICATION_NOT_FOUND`, 409 `APP_SECRET_SELF_LOCK` (enabling the caller's own app without presenting its valid secret), 409 stale `doc_version`, 503 `APP_SECRET_KEY_UNAVAILABLE` (enabling while the stored secret does not decrypt — the gateway would get no digest and the app would be locked out; rotate first). Disabling never decrypts and never returns 503.

### `GET /api-system/applications/:application_id` and `GET /api-system/applications` (each row) — additions

```json
{
  "require_secret": false,
  "has_secret": true,
  "secret_last4": "a91f",
  "secret_rotated_at": "2026-10-09T08:00:00.000Z",
  "secret_rotated_by_name": "Somchai",
  "secret_previous_expires_at": "2026-10-10T08:00:00.000Z"
}
```

`has_secret=false` ⇒ `secret_last4`, `secret_rotated_at`, `secret_rotated_by_name` are `null`. `secret_previous_expires_at` is `null` once the grace window has passed (never a past timestamp). Ciphertext columns are never present.

### Meaning of `APP_SECRET_KEY_UNAVAILABLE` (503)

micro-cluster could not use `SECRET_ENCRYPTION_KEY` on this app's secret: on **reveal** and **enable-enforcement** the stored `enc:v1:…` value failed to decrypt (key changed since it was written, or corrupt ciphertext); on **rotate** only if encryption itself throws (wrong-length key). The FE should say "the stored secret can't be read — rotate it". The same decrypt failure during the **allowlist snapshot** is not an HTTP error: micro-cluster logs it, leaves that app's `secret_digests` empty and carries on building the snapshot for every other app; if that app has `require_secret=true`, its clients get 401 `APP_SECRET_INVALID` until someone rotates.

### Propagation

Rotate and enforcement changes reach each gateway on its next allowlist poll (`APP_ALLOWLIST_TTL_MS`, default 60 s) — up to ~60–90 s. There is no push refresh (status changes behave the same). After a rotate on an enforced app, keep sending the **previous** secret until that window has passed; it stays valid for 24 h.

### Guard rejection (any `AppIdGuard` route, incl. `GET /api/app-status`)

Only for apps with `require_secret=true`, when `x-app-secret` is missing or matches neither the current nor an unexpired previous secret:

```json
{ "success": false, "status": 401, "message": "Application secret is missing or invalid", "timestamp": "…", "path": "/api/…", "error": { "code": "APP_SECRET_INVALID", "id": 8080006, "message": "This application requires a valid x-app-secret header" } }
```

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | 7 columns + rotated-by relation on `tb_application`, back-relation on `tb_user` |
| `packages/prisma-shared-schema-platform/prisma/migrations/20261009120000_application_secret/migration.sql` | expand migration + 2 CHECKs + FK |
| `packages/error-catalog/src/catalog.ts` | 5 catalog entries (status + message source for both error paths) |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | `application.secret.manage` / `application.secret.reveal` |
| `apps/micro-cluster/src/app.module.ts` | redact both ciphertext columns in `tb_activity` |
| `apps/micro-cluster/src/cluster/application/application.secret.ts` (new) | generation, safe decrypt wrapper over `@repo/secret-crypto`, digest, read model |
| `apps/micro-cluster/src/cluster/application/application.service.ts` | read model, `rotateSecret`, `revealSecret`, `setSecretEnforcement`, snapshot digests |
| `apps/micro-cluster/src/cluster/application/application.controller.ts` | 3 handlers |
| `apps/micro-cluster/src/cluster/application/application.service.spec.ts` | provider for `LogEventsService` only |
| `apps/micro-cluster/src/common/activity/platform-activity-registry.ts` | activity entry for enforcement |
| `packages/rpc-contract/src/contracts/applications.ts` | regenerated (never hand-edited) |
| `apps/backend-gateway/src/common/guard/app-allowlist.store.ts` | `require_secret`, digests, `matchesSecret` |
| `apps/backend-gateway/src/common/guard/app-id.guard.ts` | secret step after "401 unknown app" |
| `apps/backend-gateway/src/platform/applications/applications.controller.ts` | 3 routes, self-lock |
| `apps/backend-gateway/src/platform/applications/applications.service.ts` | 3 RPC wrappers |
| `apps/backend-gateway/src/platform/applications/swagger/request.ts` / `response.ts` | DTOs |
| `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` | regenerated (3 api_names) |

No env schema, `.env.example` or `scripts/audit-env-drift/external-secrets.ts` change: `SECRET_ENCRYPTION_KEY` is already required by micro-cluster and already listed for it (`external-secrets.ts:53-57`).

`app-allowlist.refresher.ts` needs **no** change: it already passes the V2 payload straight to `replaceV2` (`app-allowlist.refresher.ts:103-106`), and the V1 fallback goes through `replace`, which Task 7 defaults to "no secret required".

---

### Task 1: Schema + expand migration

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:77` (after `status_changed_by_id`), `:93` (after the status-changed-by relation), `:526` (`tb_user` back-relations)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20261009120000_application_secret/migration.sql`

**Interfaces:**
- Produces Prisma fields on `tb_application`: `require_secret: boolean`, `secret_ciphertext: string | null`, `secret_last4: string | null`, `secret_rotated_at: Date | null`, `secret_rotated_by_id: string | null`, `secret_previous_ciphertext: string | null`, `secret_previous_expires_at: Date | null`; relation `tb_user_tb_application_secret_rotated_by_idTotb_user: tb_user | null` (relation name `"tb_application_secret_rotated_by_idTotb_user"`).

- [ ] **Step 1: Branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git fetch origin && git switch -c feature/application-secret origin/main
ls packages/prisma-shared-schema-platform/prisma/migrations | tail -3
```

Expected: the newest folder is `20261009100000_application_status_modes`. If anything newer exists on `origin/main`, pick a timestamp later than it and use that folder name everywhere below.

- [ ] **Step 2: Columns** — insert after `status_changed_by_id String?   @db.Uuid` (line 77):

```prisma
  /// Per-app x-app-secret enforcement switch — CHECK (require_secret = false OR secret_ciphertext IS NOT NULL) lives in the migration
  require_secret             Boolean   @default(false) @db.Boolean
  /// @repo/secret-crypto encryptSecret output: enc:v1:<iv_b64>:<tag_b64>:<ct_b64> (AES-256-GCM, SECRET_ENCRYPTION_KEY) — micro-cluster only
  secret_ciphertext          String?
  /// Last 4 chars of the plaintext, shown masked without decrypting — set together with secret_ciphertext (CHECK)
  secret_last4               String?   @db.VarChar(4)
  secret_rotated_at          DateTime? @db.Timestamptz(6)
  secret_rotated_by_id       String?   @db.Uuid
  /// The secret that was current before the last rotation (same enc:v1 format) — accepted until secret_previous_expires_at
  secret_previous_ciphertext String?
  secret_previous_expires_at DateTime? @db.Timestamptz(6)
```

- [ ] **Step 3: Relation** — insert after the `tb_user_tb_application_status_changed_by_idTotb_user …` line (line 93):

```prisma
  tb_user_tb_application_secret_rotated_by_idTotb_user tb_user? @relation("tb_application_secret_rotated_by_idTotb_user", fields: [secret_rotated_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
```

- [ ] **Step 4: Back-relation on `tb_user`** — insert after `tb_application_tb_application_status_changed_by_idTotb_user …` (line 526; lines shift by +11 after Steps 2–3, so search for the text):

```prisma
  tb_application_tb_application_secret_rotated_by_idTotb_user                               tb_application[]                    @relation("tb_application_secret_rotated_by_idTotb_user")
```

- [ ] **Step 5: Migration** — `packages/prisma-shared-schema-platform/prisma/migrations/20261009120000_application_secret/migration.sql`:

```sql
-- 20261009120000_application_secret
-- expand เท่านั้น: secret ต่อแอป (x-app-secret) เก็บเป็น enc:v1:… ของ @repo/secret-crypto (AES-256-GCM, SECRET_ENCRYPTION_KEY) + สวิตช์บังคับใช้รายแอป
-- ทุกแถวเดิมได้ require_secret = false และไม่มี secret → CHECK ทั้งสองตัวผ่านทันที ไม่มี backfill
ALTER TABLE "tb_application"
  ADD COLUMN IF NOT EXISTS "require_secret"             BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "secret_ciphertext"          TEXT,
  ADD COLUMN IF NOT EXISTS "secret_last4"               VARCHAR(4),
  ADD COLUMN IF NOT EXISTS "secret_rotated_at"          TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "secret_rotated_by_id"       UUID,
  ADD COLUMN IF NOT EXISTS "secret_previous_ciphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "secret_previous_expires_at" TIMESTAMPTZ(6);

-- บังคับใช้ได้เฉพาะแอปที่มี secret แล้ว — ตาข่ายสุดท้าย service ตรวจก่อนเสมอ (APP_SECRET_MISSING)
ALTER TABLE "tb_application" DROP CONSTRAINT IF EXISTS "application_require_secret_chk";
ALTER TABLE "tb_application"
  ADD CONSTRAINT "application_require_secret_chk"
  CHECK ("require_secret" = false OR "secret_ciphertext" IS NOT NULL);

-- last4 มาคู่กับ ciphertext เสมอ — has_secret ของ read model อ่านจาก last4 โดยไม่ต้องโหลด ciphertext
ALTER TABLE "tb_application" DROP CONSTRAINT IF EXISTS "application_secret_last4_pair_chk";
ALTER TABLE "tb_application"
  ADD CONSTRAINT "application_secret_last4_pair_chk"
  CHECK (("secret_ciphertext" IS NULL) = ("secret_last4" IS NULL));

ALTER TABLE "tb_application" DROP CONSTRAINT IF EXISTS "tb_application_secret_rotated_by_id_fkey";
ALTER TABLE "tb_application"
  ADD CONSTRAINT "tb_application_secret_rotated_by_id_fkey"
  FOREIGN KEY ("secret_rotated_by_id") REFERENCES "tb_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
```

- [ ] **Step 6: Generate client, build the package, type-check**

```bash
cd packages/prisma-shared-schema-platform
bun run db:generate && bun run build && bun run check-types
npx prettier --write prisma/schema.prisma 2>/dev/null || true
cd -
```

Expected: all succeed. (`build` matters: consumers read `dist/*.d.ts`; a stale `dist` gives fake "property does not exist" errors in Task 5.)

- [ ] **Step 7: Commit** — do **not** push (a push applies the migration to DEV).

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20261009120000_application_secret
git commit -m "feat(platform-schema): application secret columns + require_secret CHECK (expand only)"
```

---

### Task 2: Error catalog entries

**Files:**
- Modify: `packages/error-catalog/src/catalog.ts` — insert after `APP_SELF_LOCK` (lines 2999-3005)

**Interfaces:**
- Produces `ERROR_CATALOG.APP_SECRET_INVALID` / `APP_SECRET_MISSING` / `APP_SECRET_SELF_LOCK` / `APP_SECRET_KEY_UNAVAILABLE` / `APP_SECRET_NOT_FOUND`. Mandatory: both the gateway `ExceptionFilter` (`exception.fillter.ts:237-247`) and `respond()` (`base-http-controller.ts:114-131`) look the code up here; an unknown code is not localized and the filter drops it, and the entry's `http_status` overrides the thrown status.

- [ ] **Step 1: Add entries**

```ts
  APP_SECRET_INVALID: {
    code: 'APP_SECRET_INVALID',
    id: makeId(MODULE.APPLICATION, 6),
    http_status: 401,
    message_en: 'Application secret is missing or invalid',
    message_th: 'ไม่มี secret ของแอปพลิเคชัน หรือ secret ไม่ถูกต้อง',
  },
  APP_SECRET_MISSING: {
    code: 'APP_SECRET_MISSING',
    id: makeId(MODULE.APPLICATION, 7),
    http_status: 400,
    message_en: 'Generate a secret before requiring it',
    message_th: 'ต้องสร้าง secret ก่อนจึงจะบังคับใช้ได้',
  },
  APP_SECRET_SELF_LOCK: {
    code: 'APP_SECRET_SELF_LOCK',
    id: makeId(MODULE.APPLICATION, 8),
    http_status: 409,
    message_en:
      'You cannot require a secret on the application you are using — this client does not send its secret, so you would lose access to undo it',
    message_th: 'บังคับ secret กับแอปที่กำลังใช้งานอยู่ไม่ได้ เพราะ client นี้ไม่ได้ส่ง secret มา จะกลับมาแก้คืนไม่ได้',
  },
  APP_SECRET_KEY_UNAVAILABLE: {
    code: 'APP_SECRET_KEY_UNAVAILABLE',
    id: makeId(MODULE.APPLICATION, 9),
    http_status: 503,
    message_en:
      'The stored application secret cannot be read with the server encryption key — rotate the secret to replace it',
    message_th: 'อ่าน secret ของแอปที่เก็บไว้ด้วยกุญแจเข้ารหัสของเซิร์ฟเวอร์ไม่ได้ — หมุน secret ใหม่เพื่อแทนที่',
  },
  APP_SECRET_NOT_FOUND: {
    code: 'APP_SECRET_NOT_FOUND',
    id: makeId(MODULE.APPLICATION, 10),
    http_status: 404,
    message_en: 'This application has no secret yet',
    message_th: 'แอปพลิเคชันนี้ยังไม่มี secret',
  },
```

- [ ] **Step 2: Verify ids, build, type-check, lint, existing spec**

```bash
cd packages/error-catalog
grep -n "makeId(MODULE.APPLICATION," src/catalog.ts   # expect 1..10, no duplicates
bun run build:package && bun run check-types
bunx eslint src/catalog.ts && npx prettier --write src/catalog.ts
bunx jest src/catalog.spec.ts --runInBand --forceExit
bun run gen:reference   # refreshes reference/error-codes.{json,md}; commit them only if they changed
cd -
```

Expected: PASS (the catalog spec checks uniqueness of code/id).

- [ ] **Step 3: Commit**

```bash
git add packages/error-catalog
git commit -m "feat(error-catalog): APP_SECRET_INVALID/MISSING/SELF_LOCK/KEY_UNAVAILABLE/NOT_FOUND"
```

---

### Task 3: Platform permission keys

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` — insert after `{ resource: 'application', action: 'delete', … }` (line 115)

**Interfaces:**
- Produces active keys `application.secret.manage`, `application.secret.reveal` in `PLATFORM_PERMISSION_SEED` (consumed by Task 8's `@RequirePlatformPermission` and by `audit:api-system-permission`). Resource `application` already has a description in `src/platform-permission-resource.ts:84`, so `audit:platform-permission-resource` needs nothing new. `ROLE_PERMISSIONS` is **not** changed: Platform Admin's `application.*` picks both up at seed time; Support Manager/Staff (`application.read` only) do not.

- [ ] **Step 1: Add the two keys**

```ts
  // Secret ของแอป (x-app-secret): แยก reveal ออกจาก manage — การดูค่าจริงเป็นสิทธิ์ที่แคบกว่าการหมุน/บังคับใช้
  // และทุกครั้งที่ reveal ถูกบันทึกลง tb_activity · action มีจุดโดยเจตนา คีย์จึงเป็น application.secret.*
  // และ wildcard application.* ของ Platform Admin ครอบทั้งสองตัวเมื่อ seed
  // Reveal is split from manage: viewing the plaintext is narrower than rotating/enforcing, and
  // every reveal is audit-logged. The dotted action makes the keys application.secret.*.
  {
    resource: 'application',
    action: 'secret.manage',
    description:
      'Generate and rotate application secrets (x-app-secret) and turn per-app secret enforcement on or off',
  },
  {
    resource: 'application',
    action: 'secret.reveal',
    description: 'Reveal the plaintext secret of an application — every reveal is audit-logged',
  },
```

- [ ] **Step 2: Type-check, lint, existing checks**

```bash
cd packages/prisma-shared-schema-platform
bun run check-types
bunx eslint prisma/seed.platform-permission.data.ts && npx prettier --write prisma/seed.platform-permission.data.ts
bun test prisma/seed.platform-role-permission.data.test.ts   # existing bun:test file — must stay green
cd - && bun run audit:platform-permission-resource
```

Expected: PASS. (`audit:api-system-permission` runs in Task 8 once routes reference the keys.)

- [ ] **Step 3: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts
git commit -m "feat(platform-permission): application.secret.manage and application.secret.reveal"
```

---

### Task 4: micro-cluster secret helper (over `@repo/secret-crypto`), audit redaction

**Files:**
- Create: `apps/micro-cluster/src/cluster/application/application.secret.ts`
- Modify: `apps/micro-cluster/src/app.module.ts:88-101` (`sensitiveFields`)

No env schema, `.env.example` or external-secrets change: micro-cluster already depends on `@repo/secret-crypto` (`apps/micro-cluster/package.json:39`) and already requires `SECRET_ENCRYPTION_KEY` at boot (`src/libs/config.env.ts:52`).

**Interfaces:**
- Produces (used by Tasks 5 and 6):

```ts
export const APP_SECRET_PREFIX = 'cas_';
export const APP_SECRET_GRACE_MS = 86_400_000;
export function generateAppSecret(): string;                   // 'cas_' + 40 base62
export function tryDecryptAppSecret(stored: string):           // never throws
  { plaintext: string; error: null } | { plaintext: null; error: string };
export function sha256Hex(value: string): string;              // 64 lowercase hex chars
export interface SecretReadModel {
  require_secret: boolean;
  has_secret: boolean;
  secret_last4: string | null;
  secret_rotated_at: Date | null;
  secret_rotated_by_name: string | null;
  secret_previous_expires_at: Date | null; // null once expired
}
export function toSecretReadModel(row: SecretReadModelSource, now?: number): SecretReadModel;
```

Encryption itself is `encryptSecret` from `@repo/secret-crypto`, called directly by `rotateSecret` (Task 6).

- [ ] **Step 1: Create `application.secret.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
import { decryptSecret } from '@repo/secret-crypto';

/**
 * Prefix of every application secret — makes a leaked secret greppable in logs and repositories
 * คำนำหน้าของ secret ทุกตัว — ทำให้ grep หา secret ที่รั่วใน log หรือ repository ได้
 */
export const APP_SECRET_PREFIX = 'cas_';

/**
 * How long the previous secret keeps working after a rotation (24 h)
 * ระยะเวลาที่ secret ตัวก่อนหน้ายังใช้ได้หลังการหมุน (24 ชั่วโมง)
 */
export const APP_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SECRET_BODY_LENGTH = 40;
// 248 = 62 × 4 — bytes at or above it are dropped so each character is equally likely
// 248 = 62 × 4 — ไบต์ที่ ≥ 248 ถูกทิ้งเพื่อให้ทุกตัวอักษรมีโอกาสเท่ากัน
const UNBIASED_BYTE_LIMIT = 248;

/**
 * Generates a new application secret: 'cas_' + 40 base62 characters (~238 bits) from crypto.randomBytes
 * สร้าง secret ใหม่: 'cas_' ตามด้วย base62 40 ตัว (~238 บิต) จาก crypto.randomBytes
 * @returns The plaintext secret / secret แบบ plaintext
 */
export function generateAppSecret(): string {
  let body = '';
  while (body.length < SECRET_BODY_LENGTH) {
    const bytes = randomBytes(64);
    for (let i = 0; i < bytes.length && body.length < SECRET_BODY_LENGTH; i++) {
      if (bytes[i] < UNBIASED_BYTE_LIMIT) body += BASE62[bytes[i] % 62];
    }
  }
  return APP_SECRET_PREFIX + body;
}

/**
 * Decrypts a stored enc:v1 secret with @repo/secret-crypto without throwing. decryptSecret throws on a
 * missing prefix, a malformed value, an unusable key and a GCM auth failure (key changed / tampered);
 * every caller here must turn that into a 503 or a skipped digest, never a crash.
 * ถอดรหัส secret แบบ enc:v1 ผ่าน @repo/secret-crypto โดยไม่ throw — decryptSecret throw เมื่อไม่มี prefix,
 * รูปแบบผิด, กุญแจใช้ไม่ได้ หรือ GCM ตรวจไม่ผ่าน (กุญแจเปลี่ยน/ถูกแก้) ผู้เรียกต้องแปลงเป็น 503 หรือข้าม digest
 * @param stored - The stored enc:v1 value / ค่า enc:v1 ที่เก็บไว้
 * @returns The plaintext, or the error message / plaintext หรือข้อความ error
 */
export function tryDecryptAppSecret(
  stored: string,
): { plaintext: string; error: null } | { plaintext: null; error: string } {
  try {
    return { plaintext: decryptSecret(stored), error: null };
  } catch (error: unknown) {
    return { plaintext: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * SHA-256 of a string as lowercase hex — the only form of a secret that leaves micro-cluster
 * SHA-256 ของสตริงเป็น hex ตัวเล็ก — รูปเดียวของ secret ที่ออกจาก micro-cluster
 * @param value - Input string / สตริงต้นทาง
 * @returns 64 hex characters / hex 64 ตัว
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Columns the read model is built from (relation optional so partial selects and fixtures still fit)
 * คอลัมน์ที่ใช้สร้าง read model (relation เป็น optional เพื่อให้ select บางส่วนและ fixture ใช้ได้)
 */
export interface SecretReadModelSource {
  require_secret: boolean | null;
  secret_last4: string | null;
  secret_rotated_at: Date | null;
  secret_previous_expires_at: Date | null;
  tb_user_tb_application_secret_rotated_by_idTotb_user?: {
    username: string;
    alias_name: string | null;
  } | null;
}

/**
 * Secret fields exposed by findOne and findAll — never the ciphertext
 * ฟิลด์เรื่อง secret ที่ findOne และ findAll เปิดเผย — ไม่มี ciphertext เด็ดขาด
 */
export interface SecretReadModel {
  require_secret: boolean;
  has_secret: boolean;
  secret_last4: string | null;
  secret_rotated_at: Date | null;
  secret_rotated_by_name: string | null;
  secret_previous_expires_at: Date | null;
}

/**
 * Builds the secret part of the application read model; an expired grace window reads as null
 * สร้างส่วน secret ของ read model แอป ช่วงผ่อนผันที่หมดแล้วอ่านเป็น null
 * @param row - Selected application columns / คอลัมน์แอปที่ select มา
 * @param now - Clock in ms / เวลาปัจจุบันเป็น ms
 * @returns The read-model fields / ฟิลด์ของ read model
 */
export function toSecretReadModel(row: SecretReadModelSource, now: number = Date.now()): SecretReadModel {
  const rotatedBy = row.tb_user_tb_application_secret_rotated_by_idTotb_user;
  const previousExpiresAt = row.secret_previous_expires_at ?? null;
  return {
    require_secret: row.require_secret === true,
    has_secret: row.secret_last4 != null,
    secret_last4: row.secret_last4 ?? null,
    secret_rotated_at: row.secret_rotated_at ?? null,
    secret_rotated_by_name: rotatedBy ? rotatedBy.alias_name || rotatedBy.username : null,
    secret_previous_expires_at:
      previousExpiresAt && previousExpiresAt.getTime() > now ? previousExpiresAt : null,
  };
}
```

- [ ] **Step 2: Redact ciphertext in `tb_activity`** — in `apps/micro-cluster/src/app.module.ts`, add to `sensitiveFields` after `'email_verification_token_hash', // tb_user` (line 100):

```ts
        // Matching is whole-name: 'secret' does NOT cover these. enc:v1 ciphertext is not plaintext,
        // but tb_activity is readable from the UI and a later SECRET_ENCRYPTION_KEY leak would turn
        // every row into a secret. จับคู่ทั้งชื่อ 'secret' จึงไม่ครอบสองคอลัมน์นี้
        'secret_ciphertext', // tb_application
        'secret_previous_ciphertext', // tb_application
```

- [ ] **Step 3: Type-check, lint, existing specs**

```bash
cd apps/micro-cluster && bun run check-types
bunx eslint src/cluster/application/application.secret.ts src/app.module.ts
npx prettier --write src/cluster/application/application.secret.ts src/app.module.ts
bunx jest src/cluster/application src/common/activity --runInBand --forceExit
cd ../..
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/micro-cluster/src/cluster/application/application.secret.ts apps/micro-cluster/src/app.module.ts
git commit -m "feat(micro-cluster): application secret helper over @repo/secret-crypto, redact ciphertext in tb_activity"
```

---

### Task 5: micro-cluster read model + gateway response DTO

**Files:**
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts:164-187` (findAll select), `:199-222` (findAll map), `:316-329` (findOne include), `:337-361` (findOne map)
- Modify: `apps/backend-gateway/src/platform/applications/swagger/response.ts:72` (`ApplicationResponseDto`, before `api_names`)

**Interfaces:**
- Consumes: `toSecretReadModel` (Task 4).
- Produces: every list row and the findOne payload gain `require_secret`, `has_secret`, `secret_last4`, `secret_rotated_at`, `secret_rotated_by_name`, `secret_previous_expires_at` (see API contract).

- [ ] **Step 1: Import** — add to the top of `application.service.ts` (after the `./application.status` import, line 20):

```ts
import { toSecretReadModel } from './application.secret';
```

- [ ] **Step 2: `findAll` select** — in the `select` (lines 164-187) add after `status_changed_at: true,` (line 175):

```ts
        require_secret: true,
        secret_last4: true,
        secret_rotated_at: true,
        secret_previous_expires_at: true,
```

and after the `tb_user_tb_application_status_changed_by_idTotb_user: { … },` block (line 186):

```ts
        tb_user_tb_application_secret_rotated_by_idTotb_user: {
          select: { username: true, alias_name: true },
        },
```

- [ ] **Step 3: `findAll` map** — in the `data` map, add after `status_changed_by_name: …,` (line 215):

```ts
        ...toSecretReadModel(app),
```

- [ ] **Step 4: `findOne` include** — add to the `include` (after the `tb_application_bypass_user: { … },` block, line 328):

```ts
        tb_user_tb_application_secret_rotated_by_idTotb_user: {
          select: { username: true, alias_name: true },
        },
```

and in the `Result.ok({ … })` add after the `bypass_users: …,` mapping (line 355):

```ts
      // Never spread `app` itself: findFirst+include returns every scalar, ciphertext included
      // ห้าม spread `app` ทั้งก้อน — findFirst+include คืนทุกคอลัมน์รวม ciphertext
      ...toSecretReadModel(app),
```

- [ ] **Step 5: Gateway DTO** — in `swagger/response.ts`, insert in `ApplicationResponseDto` before the `api_names` property (line 73):

```ts
  @ApiProperty({
    description: 'Whether the gateway rejects requests from this app that lack a valid x-app-secret',
    example: false,
  })
  require_secret: boolean;

  @ApiProperty({ description: 'Whether a secret has been generated', example: true })
  has_secret: boolean;

  @ApiProperty({
    description: 'Last 4 characters of the current secret (null when none)',
    nullable: true,
    example: 'a91f',
  })
  secret_last4: string | null;

  @ApiProperty({ description: 'When the secret was last generated or rotated', nullable: true, example: null })
  secret_rotated_at: string | null;

  @ApiProperty({ description: 'Display name of who last rotated the secret', nullable: true, example: null })
  secret_rotated_by_name: string | null;

  @ApiProperty({
    description: 'Until when the previous secret is still accepted; null when there is no open grace window',
    nullable: true,
    example: null,
  })
  secret_previous_expires_at: string | null;
```

- [ ] **Step 6: Type-check, lint, existing specs**

```bash
cd apps/micro-cluster && bun run check-types
bunx eslint src/cluster/application/application.service.ts && npx prettier --write src/cluster/application/application.service.ts
bunx jest src/cluster/application --runInBand --forceExit
cd ../backend-gateway && bun run check-types
bunx eslint src/platform/applications/swagger/response.ts && npx prettier --write src/platform/applications/swagger/response.ts
bunx jest src/platform/applications --runInBand --forceExit
cd ../..
```

Expected: PASS. The existing `findAll`/`findOne` assertions use `expect.objectContaining`, and the fixtures' missing secret columns read as `require_secret=false`, `has_secret=false`, nulls.

- [ ] **Step 7: Commit**

```bash
git add apps/micro-cluster/src/cluster/application/application.service.ts apps/backend-gateway/src/platform/applications/swagger/response.ts
git commit -m "feat(applications): expose require_secret/has_secret/last4/rotation in the application read model"
```

---

### Task 6: micro-cluster rotate / reveal / enforcement, snapshot digests, RPC contract

**Files:**
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts` — constructor (lines 59-62); 3 new methods inserted after `setBypassUsers` (ends line 627), before the `allowlistSnapshotV2` JSDoc; `allowlistSnapshotV2` (lines 636-669)
- Modify: `apps/micro-cluster/src/cluster/application/application.controller.ts` — 3 handlers appended after `allowlistSnapshotV2` (line 197)
- Modify: `apps/micro-cluster/src/cluster/application/application.service.spec.ts:14` (provider only)
- Modify: `apps/micro-cluster/src/common/activity/platform-activity-registry.ts:82` (after `applications.set-bypass-users`)
- Regenerate: `packages/rpc-contract/src/contracts/applications.ts`

**Interfaces:**
- Consumes: Task 4 helpers, Task 2 catalog codes.
- Produces RPC endpoints (names after generation): `Applications.rotateSecret` (`applications.rotate-secret`), `Applications.revealSecret` (`applications.reveal-secret`), `Applications.setSecretEnforcement` (`applications.set-secret-enforcement`).
  - `rotateSecret` payload `{ id, user_id, version }` → `Result<{ id: string; secret: string; last4: string; rotated_at: string; previous_expires_at: string | null; doc_version: number }>`
  - `revealSecret` payload `{ id, user_id, version }` → `Result<{ id: string; secret: string; last4: string }>`
  - `setSecretEnforcement` payload `{ id, data: { require_secret: boolean; doc_version?: number }, user_id, version }` → `Result<{ id: string; require_secret: boolean; doc_version: number }>`
- `allowlistSnapshotV2` items gain (used by Task 7):

```ts
require_secret: boolean;
secret_digests: { sha256: string /* 64 hex */; expires_at: string | null /* ISO; null = current */ }[];
```

`secret_digests` is filled for **every** app that has a secret (the gateway's self-lock check needs it even before enforcement is on); only `require_secret` decides whether the guard enforces.

- [ ] **Step 1: Imports + constructor** — in `application.service.ts` add:

```ts
import { LogEventsService, getAuditContext } from '@repo/log-events-library';
import { encryptSecret } from '@repo/secret-crypto';
import {
  APP_SECRET_GRACE_MS,
  generateAppSecret,
  sha256Hex,
  toSecretReadModel,
  tryDecryptAppSecret,
} from './application.secret';
```

(replacing the single `toSecretReadModel` import from Task 5) and change the constructor (lines 59-62) to:

```ts
  constructor(
    @Inject('PRISMA_SYSTEM')
    private readonly prismaSystem: typeof PrismaClient_SYSTEM,
    private readonly logEvents: LogEventsService,
  ) {}
```

`LogEventsService` is provided globally by `LogEventsModule.forRoot` in `app.module.ts:76` (business-unit already injects it with `imports: []`), so `application.module.ts` needs no change.

- [ ] **Step 2: Service methods** — insert after `setBypassUsers` (line 627):

```ts
  /**
   * Generates the application's first secret or rotates it; the old secret stays valid for 24 h.
   * Locks on the doc_version it read so two concurrent rotations cannot both "win".
   * สร้าง secret ครั้งแรกหรือหมุน secret ของแอป ตัวเดิมยังใช้ได้อีก 24 ชั่วโมง
   * ล็อกด้วย doc_version ที่อ่านมา เพื่อไม่ให้การหมุนพร้อมกันสองครั้ง "ชนะ" ทั้งคู่
   * @param id - Application UUID / UUID ของแอป
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns The plaintext secret (only here and in revealSecret) and the new doc_version / secret แบบ plaintext และ doc_version ใหม่
   */
  @TryCatch
  async rotateSecret(
    id: string,
    user_id: string,
    version: string,
  ): Promise<
    Result<{
      id: string;
      secret: string;
      last4: string;
      rotated_at: string;
      previous_expires_at: string | null;
      doc_version: number;
    }>
  > {
    this.logger.debug({ function: 'rotateSecret', id, user_id, version }, ApplicationService.name);
    const existing = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        doc_version: true,
        secret_ciphertext: true,
        secret_last4: true,
        secret_rotated_at: true,
      },
    });
    if (!existing) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    const secret = generateAppSecret();
    const last4 = secret.slice(-4);
    let ciphertext: string;
    try {
      // Throws only on an unusable SECRET_ENCRYPTION_KEY (wrong length) — boot checks non-empty only
      // throw เฉพาะเมื่อ SECRET_ENCRYPTION_KEY ใช้ไม่ได้ (ความยาวผิด) — ตอนบูตตรวจแค่ว่าไม่ว่าง
      ciphertext = encryptSecret(secret);
    } catch (error: unknown) {
      this.logger.error(
        `rotateSecret(${id}): encryptSecret failed — ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        ApplicationService.name,
      );
      return Result.errorFromCatalog(ERROR_CATALOG.APP_SECRET_KEY_UNAVAILABLE);
    }
    const now = new Date();
    const previousExpiresAt = existing.secret_ciphertext
      ? new Date(now.getTime() + APP_SECRET_GRACE_MS)
      : null;
    // where carries doc_version → the optimistic-lock hook bumps it and throws 409 on a lost race
    // where มี doc_version → hook ของ Prisma เพิ่มเวอร์ชันให้ และโยน 409 เมื่อแพ้การแข่งกัน
    const updated = await this.prismaSystem.tb_application.update({
      where: { id, doc_version: existing.doc_version },
      data: {
        secret_ciphertext: ciphertext,
        secret_last4: last4,
        secret_rotated_at: now,
        secret_rotated_by_id: user_id,
        secret_previous_ciphertext: existing.secret_ciphertext,
        secret_previous_expires_at: previousExpiresAt,
        updated_at: now,
        updated_by_id: user_id,
      },
      select: { id: true, doc_version: true },
    });
    const ctx = getAuditContext();
    if (ctx) {
      await this.logEvents.logPlatformEvent(
        'update',
        'tb_application',
        id,
        ctx,
        {
          secret_last4: existing.secret_last4,
          secret_rotated_at: existing.secret_rotated_at?.toISOString() ?? null,
        },
        {
          secret_last4: last4,
          secret_rotated_at: now.toISOString(),
          secret_previous_expires_at: previousExpiresAt?.toISOString() ?? null,
        },
        { event_type: 'application.secret.rotated', first_secret: existing.secret_ciphertext === null },
      );
    } else {
      this.logger.error(`rotateSecret(${id}) ran without an audit context`, undefined, ApplicationService.name);
    }
    return Result.ok({
      id: updated.id,
      secret,
      last4,
      rotated_at: now.toISOString(),
      previous_expires_at: previousExpiresAt?.toISOString() ?? null,
      doc_version: updated.doc_version,
    });
  }

  /**
   * Decrypts and returns the application's current secret; every call is written to tb_activity
   * ถอดรหัสและคืน secret ปัจจุบันของแอป ทุกครั้งที่เรียกถูกบันทึกลง tb_activity
   * @param id - Application UUID / UUID ของแอป
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns The plaintext secret and its last 4 characters / secret แบบ plaintext และ 4 ตัวท้าย
   */
  @TryCatch
  async revealSecret(
    id: string,
    user_id: string,
    version: string,
  ): Promise<Result<{ id: string; secret: string; last4: string }>> {
    this.logger.debug({ function: 'revealSecret', id, user_id, version }, ApplicationService.name);
    const app = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, secret_ciphertext: true, secret_last4: true },
    });
    if (!app) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    if (!app.secret_ciphertext || !app.secret_last4) {
      return Result.errorFromCatalog(ERROR_CATALOG.APP_SECRET_NOT_FOUND);
    }
    const decrypted = tryDecryptAppSecret(app.secret_ciphertext);
    if (decrypted.plaintext === null) {
      this.logger.error(
        `revealSecret(${id}): stored secret does not decrypt — SECRET_ENCRYPTION_KEY changed since it was written, or corrupt ciphertext (${decrypted.error})`,
        undefined,
        ApplicationService.name,
      );
      return Result.errorFromCatalog(ERROR_CATALOG.APP_SECRET_KEY_UNAVAILABLE);
    }
    const secret = decrypted.plaintext;
    const ctx = getAuditContext();
    if (ctx) {
      await this.logEvents.logPlatformEvent('view', 'tb_application', id, ctx, null, null, {
        event_type: 'application.secret.revealed',
        secret_last4: app.secret_last4,
      });
    } else {
      this.logger.error(`revealSecret(${id}) ran without an audit context`, undefined, ApplicationService.name);
    }
    return Result.ok({ id, secret, last4: app.secret_last4 });
  }

  /**
   * Turns per-app secret enforcement on or off. Enabling needs a secret that micro-cluster can
   * decrypt — otherwise the snapshot has no digest and the app would be locked out.
   * เปิด/ปิดการบังคับใช้ secret รายแอป การเปิดต้องมี secret ที่ micro-cluster ถอดรหัสได้
   * ไม่งั้น snapshot จะไม่มี digest และแอปจะถูกล็อกออก
   * @param id - Application UUID / UUID ของแอป
   * @param data - { require_secret: boolean; doc_version?: number }
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns The id, the stored switch and the new doc_version / id ค่าสวิตช์ที่บันทึก และ doc_version ใหม่
   */
  @TryCatch
  async setSecretEnforcement(
    id: string,
    data: any,
    user_id: string,
    version: string,
  ): Promise<Result<{ id: string; require_secret: boolean; doc_version: number }>> {
    this.logger.debug(
      { function: 'setSecretEnforcement', id, data, user_id, version },
      ApplicationService.name,
    );
    if (typeof data?.require_secret !== 'boolean') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: 'require_secret must be a boolean',
      });
    }
    const existing = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, secret_ciphertext: true },
    });
    if (!existing) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    if (data.require_secret) {
      if (!existing.secret_ciphertext) {
        return Result.errorFromCatalog(ERROR_CATALOG.APP_SECRET_MISSING);
      }
      const decrypted = tryDecryptAppSecret(existing.secret_ciphertext);
      if (decrypted.plaintext === null) {
        this.logger.error(
          `setSecretEnforcement(${id}): stored secret does not decrypt under SECRET_ENCRYPTION_KEY — refusing to enforce (${decrypted.error})`,
          undefined,
          ApplicationService.name,
        );
        return Result.errorFromCatalog(ERROR_CATALOG.APP_SECRET_KEY_UNAVAILABLE);
      }
    }
    const now = new Date().toISOString();
    const updated = await this.prismaSystem.tb_application.update({
      where: typeof data.doc_version === 'number' ? { id, doc_version: data.doc_version } : { id },
      data: {
        require_secret: data.require_secret,
        updated_at: now,
        updated_by_id: user_id,
        // Always bump, like updateStatus: the hook only auto-increments on the locked path
        doc_version: { increment: 1 },
      },
      select: { id: true, require_secret: true, doc_version: true },
    });
    return Result.ok(updated);
  }

  /**
   * SHA-256 digests of the app's current and unexpired previous secret for the gateway snapshot.
   * Never throws: a secret that does not decrypt is logged and left out, so one bad row cannot
   * break the snapshot for every app — and an enforced app with a bad row fails closed.
   * digest SHA-256 ของ secret ปัจจุบันและตัวก่อนหน้าที่ยังไม่หมดอายุ สำหรับ snapshot ของเกตเวย์
   * ไม่ throw: secret ที่ถอดรหัสไม่ได้ถูก log แล้วข้าม แถวเสียแถวเดียวจึงไม่ทำ snapshot ของทุกแอปพัง
   * และแอปที่บังคับ secret แต่แถวเสียจะปฏิเสธคำขอ (fail closed)
   * @param app - Selected secret columns / คอลัมน์ secret ที่ select มา
   * @param app.id - Application UUID / UUID ของแอป
   * @param app.require_secret - Enforcement switch / สวิตช์บังคับใช้
   * @param app.secret_ciphertext - Current secret, enc:v1 / secret ปัจจุบันแบบ enc:v1
   * @param app.secret_previous_ciphertext - Previous secret, enc:v1 / secret ก่อนหน้าแบบ enc:v1
   * @param app.secret_previous_expires_at - Grace-window end / เวลาสิ้นสุดช่วงผ่อนผัน
   * @param now - Snapshot clock in ms / เวลาของ snapshot เป็น ms
   * @returns Digests with their expiry (null = current) / digest พร้อมเวลาหมดอายุ (null = ตัวปัจจุบัน)
   */
  private secretDigests(
    app: {
      id: string;
      require_secret: boolean;
      secret_ciphertext: string | null;
      secret_previous_ciphertext: string | null;
      secret_previous_expires_at: Date | null;
    },
    now: number,
  ): Array<{ sha256: string; expires_at: string | null }> {
    const digests: Array<{ sha256: string; expires_at: string | null }> = [];
    if (!app.secret_ciphertext) return digests;
    const current = tryDecryptAppSecret(app.secret_ciphertext);
    if (current.plaintext !== null) {
      digests.push({ sha256: sha256Hex(current.plaintext), expires_at: null });
    } else {
      this.logger.error(
        `allowlistSnapshotV2: current secret of application ${app.id} does not decrypt under SECRET_ENCRYPTION_KEY (${current.error})${app.require_secret ? ' — app requires a secret, every request to it will be refused until it is rotated' : ''}`,
        undefined,
        ApplicationService.name,
      );
    }
    const previousExpiresAt = app.secret_previous_expires_at;
    if (app.secret_previous_ciphertext && previousExpiresAt && previousExpiresAt.getTime() > now) {
      const previous = tryDecryptAppSecret(app.secret_previous_ciphertext);
      if (previous.plaintext !== null) {
        digests.push({ sha256: sha256Hex(previous.plaintext), expires_at: previousExpiresAt.toISOString() });
      } else {
        this.logger.error(
          `allowlistSnapshotV2: previous secret of application ${app.id} does not decrypt under SECRET_ENCRYPTION_KEY (${previous.error})`,
          undefined,
          ApplicationService.name,
        );
      }
    }
    return digests;
  }
```

- [ ] **Step 3: Snapshot V2** — in `allowlistSnapshotV2` (lines 636-669): add to the `select` after `status_until: true,` (line 648):

```ts
        require_secret: true,
        secret_ciphertext: true,
        secret_previous_ciphertext: true,
        secret_previous_expires_at: true,
```

insert before `const data = apps.map(…)` (line 656):

```ts
    // Decrypt once per snapshot, never per request — the gateway only ever sees digests.
    // secretDigests never throws, so a row that fails to decrypt cannot take the snapshot down.
    // ถอดรหัสครั้งเดียวต่อ snapshot ไม่ใช่ต่อคำขอ — เกตเวย์เห็นแค่ digest และแถวที่ถอดรหัสไม่ได้ไม่ทำ snapshot ล่ม
    const now = Date.now();
```

and add to the mapped object after `bypass_user_ids: …,` (line 666):

```ts
      require_secret: app.require_secret === true,
      secret_digests: this.secretDigests(app, now),
```

Do **not** touch `allowlistSnapshot()` (V1, lines 676-695) — an old gateway keeps working and simply never enforces.

- [ ] **Step 4: Controller handlers with temporary literals** — append after `allowlistSnapshotV2` in `application.controller.ts` (before the closing `}` on line 198):

```ts

  /**
   * Generates or rotates an application's secret
   * สร้างหรือหมุน secret ของแอปพลิเคชัน
   * @param payload - { id, user_id, version } / ข้อมูลไมโครเซอร์วิส
   * @returns Microservice response with the plaintext secret / การตอบสนองพร้อม secret แบบ plaintext
   */
  @MessagePattern({ cmd: 'applications.rotate-secret', service: 'micro-cluster' })
  async rotateSecret(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.applicationService.rotateSecret(payload.id, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Reveals an application's current secret (audited on every call)
   * เปิดดู secret ปัจจุบันของแอปพลิเคชัน (บันทึก audit ทุกครั้ง)
   * @param payload - { id, user_id, version } / ข้อมูลไมโครเซอร์วิส
   * @returns Microservice response with the plaintext secret / การตอบสนองพร้อม secret แบบ plaintext
   */
  @MessagePattern({ cmd: 'applications.reveal-secret', service: 'micro-cluster' })
  async revealSecret(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.applicationService.revealSecret(payload.id, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Turns an application's secret enforcement on or off
   * เปิด/ปิดการบังคับใช้ secret ของแอปพลิเคชัน
   * @param payload - { id, data: { require_secret, doc_version? }, user_id, version } / ข้อมูลไมโครเซอร์วิส
   * @returns Microservice response with id, require_secret and doc_version / การตอบสนองพร้อม id, require_secret และ doc_version
   */
  @MessagePattern({ cmd: 'applications.set-secret-enforcement', service: 'micro-cluster' })
  async setSecretEnforcement(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.applicationService.setSecretEnforcement(
        payload.id,
        payload.data,
        payload.user_id,
        payload.version,
      ),
    );
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 5: Generate the contract, then swap literals for references**

```bash
bun run gen:rpc-contract
grep -n "rotateSecret\|revealSecret\|setSecretEnforcement" packages/rpc-contract/src/contracts/applications.ts
```

Expected: three new `.restTodo()` entries. Replace the three literals with `Applications.rotateSecret.pattern`, `Applications.revealSecret.pattern`, `Applications.setSecretEnforcement.pattern`, then:

```bash
(cd packages/rpc-contract && bun run build:package)
bun run audit:message-pattern-literal && bun run audit:rest-contract
```

- [ ] **Step 6: Activity registry** — in `platform-activity-registry.ts` after the `applications.set-bypass-users` entry (line 82):

```ts
  [
    'applications.set-secret-enforcement',
    { action: 'update', entityName: 'tb_application', idSource: EDITED_ID },
  ],
```

Rotate and reveal are deliberately **not** registered here: they write their own rows in Step 2 with an `event_type` (`application.secret.rotated` / `.revealed`), and a reveal changes no column, so a snapshot diff would be empty. Registering rotate too would write two rows per rotation.

- [ ] **Step 7: Existing spec provider** — in `application.service.spec.ts`, add `import { LogEventsService } from '@repo/log-events-library';` and change the providers (line 14) to:

```ts
      providers: [
        ApplicationService,
        { provide: 'PRISMA_SYSTEM', useValue: prisma },
        { provide: LogEventsService, useValue: { logPlatformEvent: jest.fn() } },
      ],
```

No new `it(...)` blocks.

- [ ] **Step 8: Type-check, lint, existing specs**

```bash
cd apps/micro-cluster && bun run check-types
bunx eslint src/cluster/application/*.ts src/common/activity/platform-activity-registry.ts
npx prettier --write src/cluster/application/*.ts src/common/activity/platform-activity-registry.ts
bunx jest src/cluster/application src/common/activity --runInBand --forceExit
cd ../..
```

Expected: PASS (if an activity-registry spec enumerates every cmd, add `applications.set-secret-enforcement` to its expected list — fixture only).

- [ ] **Step 9: Commit**

```bash
git add apps/micro-cluster packages/rpc-contract/src/contracts/applications.ts
git commit -m "feat(micro-cluster): application secret rotate/reveal/enforcement and secret digests in snapshot V2"
```

---

### Task 7: Gateway store digests + `AppIdGuard` secret step

**Files:**
- Modify: `apps/backend-gateway/src/common/guard/app-allowlist.store.ts:1-44` (types), `:60-70` (`replace`), `:78-93` (`replaceV2`), after `isBypassUser` (`:139-142`)
- Modify: `apps/backend-gateway/src/common/guard/app-id.guard.ts:71-78` (JSDoc), `:125-127` (secret step)

**Interfaces:**
- Consumes: `allowlistSnapshotV2` items with optional `require_secret` / `secret_digests` (Task 6; optional so a gateway deployed ahead of micro-cluster treats every app as not requiring a secret).
- Produces (used by Task 8):

```ts
appAllowlistStore.matchesSecret(appId: string, presented: unknown): boolean
// true only when presented is a non-empty string whose SHA-256 equals a current or unexpired previous digest
AppState.require_secret: boolean
```

- Guard throws, right after "401 unknown app", only when `state.require_secret` and `!matchesSecret(...)`: `HttpException({ code: 'APP_SECRET_INVALID', error: 'This application requires a valid x-app-secret header' }, 401)`.

- [ ] **Step 1: Store types** — in `app-allowlist.store.ts` add at the top:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';
```

extend `AppAllowlistSnapshotV2Item` (lines 18-23) with:

```ts
  /** Absent from a micro-cluster older than application secrets → treated as false */
  require_secret?: boolean;
  /** SHA-256 hex of the current secret (expires_at null) and of an unexpired previous one */
  secret_digests?: { sha256: string; expires_at: string | null }[];
```

add after `AppAllowlistSnapshotV2Item`:

```ts
/**
 * One accepted secret digest held in memory — never the secret itself
 * digest ของ secret ที่ยอมรับหนึ่งตัวในหน่วยความจำ — ไม่ใช่ตัว secret
 */
export interface AppSecretDigest {
  digest: Buffer;
  /** Epoch ms after which the digest is refused; null for the current secret */
  expires_at: number | null;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Parses snapshot digests, dropping malformed entries
 * แปลง digest จาก snapshot และทิ้งรายการที่รูปแบบไม่ถูกต้อง
 * @param raw - secret_digests from the V2 snapshot / secret_digests จาก snapshot V2
 * @returns Parsed digests / digest ที่แปลงแล้ว
 */
function parseSecretDigests(raw: AppAllowlistSnapshotV2Item['secret_digests']): AppSecretDigest[] {
  const out: AppSecretDigest[] = [];
  for (const entry of raw ?? []) {
    if (typeof entry?.sha256 !== 'string' || !SHA256_HEX.test(entry.sha256)) continue;
    const expiresAt = entry.expires_at ? new Date(entry.expires_at).getTime() : null;
    if (expiresAt !== null && Number.isNaN(expiresAt)) continue;
    out.push({ digest: Buffer.from(entry.sha256, 'hex'), expires_at: expiresAt });
  }
  return out;
}
```

and extend `AppState` (lines 29-37) with:

```ts
  require_secret: boolean;
  secret_digests: AppSecretDigest[];
```

- [ ] **Step 2: `replace` / `replaceV2`** — in `replace` (V1, lines 60-70) add to the mapped object after `bypass_user_ids: [],`:

```ts
        require_secret: false,
        secret_digests: [],
```

and in `replaceV2` add to the object passed to `next.set(...)` after `bypass: new Set(item.bypass_user_ids ?? []),`:

```ts
        require_secret: item.require_secret === true,
        secret_digests: parseSecretDigests(item.secret_digests),
```

- [ ] **Step 3: `matchesSecret`** — add after `isBypassUser` (line 142):

```ts
  /**
   * Checks a presented x-app-secret against the app's current and unexpired previous digests.
   * Compares every digest with timingSafeEqual (no early exit) and never holds plaintext.
   * ตรวจ x-app-secret ที่ส่งมากับ digest ปัจจุบันและตัวก่อนหน้าที่ยังไม่หมดอายุ
   * เทียบทุกตัวด้วย timingSafeEqual (ไม่ออกก่อน) และไม่เก็บ plaintext
   * @param appId - The x-app-id header value / ค่า header x-app-id
   * @param presented - The x-app-secret header value, any type / ค่า header x-app-secret
   * @returns True when it matches an accepted digest / true เมื่อตรงกับ digest ที่ยอมรับ
   */
  matchesSecret(appId: string, presented: unknown): boolean {
    const state = this.getAppState(appId);
    if (!state || typeof presented !== 'string' || presented === '') return false;
    const digest = createHash('sha256').update(presented, 'utf8').digest();
    const now = Date.now();
    let matched = false;
    for (const accepted of state.secret_digests) {
      if (accepted.expires_at !== null && accepted.expires_at <= now) continue;
      if (timingSafeEqual(digest, accepted.digest)) matched = true;
    }
    return matched;
  }
```

- [ ] **Step 4: Guard** — in `app-id.guard.ts` replace lines 125-127:

```ts
    const state = appAllowlistStore.getAppState(appId);
    if (!state) return notAllowed();
    if (this.options.statusProbe) return true;
```

with:

```ts
    const state = appAllowlistStore.getAppState(appId);
    if (!state) return notAllowed();

    // Right after "unknown app" and before statusProbe/disabled: an enforced app answers nothing —
    // not even its status — to a caller without its secret
    // ต่อจาก "ไม่รู้จักแอป" ทันที ก่อน statusProbe/disabled: แอปที่บังคับ secret ไม่ตอบอะไรเลย
    // แม้แต่สถานะ ให้ผู้เรียกที่ไม่มี secret
    if (state.require_secret && !appAllowlistStore.matchesSecret(appId, request.headers['x-app-secret'])) {
      logger.error(
        {
          function: 'AppIdGuard',
          appId,
          api_name: this.api_name,
          has_header: typeof request.headers['x-app-secret'] === 'string',
          error: 'x-app-secret missing or invalid',
        },
        undefined,
        'AppIdGuard',
      );
      throw new HttpException(
        { code: 'APP_SECRET_INVALID', error: 'This application requires a valid x-app-secret header' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (this.options.statusProbe) return true;
```

and update the order line of the `canActivate` JSDoc (lines 72-75) to:

```ts
   * Order: 400 header → 401 unknown app → 401 APP_SECRET_INVALID (require_secret only) → statusProbe pass →
   * 403 disabled → 401 api not allowed → running pass → auth.* pass → bypass user pass → read_only + read method pass → 503
   * ลำดับ: 400 header → 401 ไม่รู้จักแอป → 401 APP_SECRET_INVALID (เฉพาะแอปที่บังคับ) → statusProbe ผ่าน →
   * 403 disabled → 401 ไม่มีสิทธิ์ api → running ผ่าน → auth.* ผ่าน → ผู้ใช้ยกเว้นผ่าน → read_only + method อ่านผ่าน → 503
```

The existing `app-id.guard.spec.ts` mock (`getAppState: () => ({ status: 'running', … })`) has no `require_secret`, which reads as falsy — the spec needs **no** change.

- [ ] **Step 5: Type-check, lint, existing specs**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/common/guard/app-allowlist.store.ts src/common/guard/app-id.guard.ts
npx prettier --write src/common/guard/app-allowlist.store.ts src/common/guard/app-id.guard.ts
bunx jest src/common/guard --runInBand --forceExit
cd ../..
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/common/guard/app-allowlist.store.ts apps/backend-gateway/src/common/guard/app-id.guard.ts
git commit -m "feat(gateway): AppIdGuard enforces x-app-secret for apps with require_secret (digests from snapshot V2)"
```

---

### Task 8: Gateway admin endpoints, self-lock, app-api catalog, CORS check

**Files:**
- Modify: `apps/backend-gateway/src/platform/applications/swagger/request.ts` (append after line 176)
- Modify: `apps/backend-gateway/src/platform/applications/swagger/response.ts` (append 3 DTOs at end of file)
- Modify: `apps/backend-gateway/src/platform/applications/applications.service.ts` (3 methods after `setBypassUsers`, line 172)
- Modify: `apps/backend-gateway/src/platform/applications/applications.controller.ts` (imports lines 45-52; 3 routes after `setApplicationBypassUsers`, line 531, before the `deleteApplication` JSDoc)
- Regenerate: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `Applications.rotateSecret` / `revealSecret` / `setSecretEnforcement` (Task 6), `appAllowlistStore.matchesSecret` (Task 7), `APP_SECRET_SELF_LOCK` (Task 2), permission keys (Task 3).
- Produces the HTTP API in the **API contract** section above.

- [ ] **Step 1: Request DTO** — append to `swagger/request.ts`:

```ts

/**
 * Zod schema for the secret-enforcement body
 * Zod schema ของ body เปิด/ปิดการบังคับใช้ secret
 */
export const ApplicationSecretEnforcementRequestSchema = z.object({
  require_secret: z.boolean(),
  doc_version: z.number().int().nonnegative().optional(),
});

/**
 * Body of PATCH /api-system/applications/:id/secret/enforcement
 * body ของ PATCH /api-system/applications/:id/secret/enforcement
 */
export class ApplicationSecretEnforcementRequestDto extends createZodDto(
  ApplicationSecretEnforcementRequestSchema,
) {
  @ApiProperty({
    description: 'true = the gateway rejects requests from this app without a valid x-app-secret',
    example: true,
  })
  require_secret: boolean;

  @ApiPropertyOptional({ description: 'Optimistic-lock token from the last GET', example: 6 })
  doc_version?: number;
}
```

- [ ] **Step 2: Response DTOs** — append to `swagger/response.ts`:

```ts

/**
 * data of POST /api-system/applications/:id/secret/rotate — the plaintext appears here and in reveal only
 * data ของ POST …/secret/rotate — plaintext ปรากฏที่นี่และที่ reveal เท่านั้น
 */
export class ApplicationSecretRotateResponseDto {
  @ApiProperty({ example: '0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90' })
  id: string;

  @ApiProperty({ description: 'Plaintext secret', example: 'cas_7Hq2LmZ0pX4vR9sT1uW3yA5bC8dE6fG2hJ4ka91f' })
  secret: string;

  @ApiProperty({ example: 'a91f' })
  last4: string;

  @ApiProperty({ example: '2026-10-09T08:00:00.000Z' })
  rotated_at: string;

  @ApiProperty({
    description: 'Until when the replaced secret is still accepted; null on the first generate',
    nullable: true,
    example: '2026-10-10T08:00:00.000Z',
  })
  previous_expires_at: string | null;

  @ApiProperty({ example: 7 })
  doc_version: number;
}

/**
 * data of GET /api-system/applications/:id/secret
 * data ของ GET /api-system/applications/:id/secret
 */
export class ApplicationSecretRevealResponseDto {
  @ApiProperty({ example: '0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90' })
  id: string;

  @ApiProperty({ description: 'Plaintext secret', example: 'cas_7Hq2LmZ0pX4vR9sT1uW3yA5bC8dE6fG2hJ4ka91f' })
  secret: string;

  @ApiProperty({ example: 'a91f' })
  last4: string;
}

/**
 * data of PATCH /api-system/applications/:id/secret/enforcement
 * data ของ PATCH /api-system/applications/:id/secret/enforcement
 */
export class ApplicationSecretEnforcementResponseDto {
  @ApiProperty({ example: '0c7b5f2e-8d0a-4a51-9f3e-2b1c6d7e8f90' })
  id: string;

  @ApiProperty({ example: true })
  require_secret: boolean;

  @ApiProperty({ example: 8 })
  doc_version: number;
}
```

- [ ] **Step 3: Service wrappers** — add to `ApplicationsService` after `setBypassUsers` (line 172). Never log results here — they carry plaintext.

```ts

  /**
   * Generate or rotate an application's secret
   * สร้างหรือหมุน secret ของแอปพลิเคชัน
   * @param id - Application id / รหัสแอป
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns Result with the plaintext secret / ผลลัพธ์พร้อม secret แบบ plaintext
   */
  async rotateSecret(id: string, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'rotateSecret', id, user_id, version }, ApplicationsService.name);
    return this.toResult(
      await this.rpc.send(Applications.rotateSecret, { id, user_id, version }),
      HttpStatus.OK,
    );
  }

  /**
   * Reveal an application's current secret
   * เปิดดู secret ปัจจุบันของแอปพลิเคชัน
   * @param id - Application id / รหัสแอป
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns Result with the plaintext secret / ผลลัพธ์พร้อม secret แบบ plaintext
   */
  async revealSecret(id: string, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'revealSecret', id, user_id, version }, ApplicationsService.name);
    return this.toResult(
      await this.rpc.send(Applications.revealSecret, { id, user_id, version }),
      HttpStatus.OK,
    );
  }

  /**
   * Turn an application's secret enforcement on or off
   * เปิด/ปิดการบังคับใช้ secret ของแอปพลิเคชัน
   * @param id - Application id / รหัสแอป
   * @param data - { require_secret, doc_version? } / ข้อมูลสวิตช์
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns Result with { id, require_secret, doc_version } / ผลลัพธ์พร้อม { id, require_secret, doc_version }
   */
  async setSecretEnforcement(
    id: string,
    data: unknown,
    user_id: string,
    version: string,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'setSecretEnforcement', id, data, user_id, version },
      ApplicationsService.name,
    );
    return this.toResult(
      await this.rpc.send(Applications.setSecretEnforcement, { id, data, user_id, version }),
      HttpStatus.OK,
    );
  }
```

- [ ] **Step 4: Controller imports** — change the response import (line 45) and request import (lines 46-51) to:

```ts
import {
  ApplicationRegistrySummaryDto,
  ApplicationSecretEnforcementResponseDto,
  ApplicationSecretRevealResponseDto,
  ApplicationSecretRotateResponseDto,
} from './swagger/response';
import {
  ApplicationBypassUsersRequestDto,
  ApplicationCreateRequestDto,
  ApplicationSecretEnforcementRequestDto,
  ApplicationStatusUpdateRequestDto,
  ApplicationUpdateRequestDto,
} from './swagger/request';
```

and add `import { appAllowlistStore } from 'src/common/guard/app-allowlist.store';` next to the `AppIdGuard` import (line 41). (`Post`, `Patch`, `Get`, `HttpException` are already imported, lines 1-18.)

- [ ] **Step 5: Controller routes** — insert after `setApplicationBypassUsers` (line 531), before the `deleteApplication` JSDoc:

```ts

  /**
   * Generate an application's first secret, or rotate it (the old one stays valid for 24 h)
   * สร้าง secret แรกของแอป หรือหมุน secret (ตัวเดิมยังใช้ได้ 24 ชั่วโมง)
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param id - Application ID / รหัสแอปพลิเคชัน
   * @param version - API version / เวอร์ชัน API
   * @returns { id, secret, last4, rotated_at, previous_expires_at, doc_version }
   */
  @Post(':application_id/secret/rotate')
  @UseGuards(new AppIdGuard('application.secretRotate'), PlatformPermissionGuard)
  @RequirePlatformPermission('application.secret.manage')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiParam({
    name: 'application_id',
    description: 'Unique identifier (UUID v4)',
    example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d',
  })
  @ApiOperation({
    summary: 'Generate or rotate an application secret',
    description:
      'Generates the first x-app-secret or rotates it. The previous secret stays valid for 24 h. The plaintext is returned only here and by GET …/secret. Gateways pick the change up within one allowlist refresh (APP_ALLOWLIST_TTL_MS, default 60 s).\n\nสร้างหรือหมุน secret ของแอป ตัวเดิมยังใช้ได้ 24 ชั่วโมง plaintext คืนเฉพาะที่นี่และ GET …/secret',
    operationId: 'application_secretRotate',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiStdResponse(ApplicationSecretRotateResponseDto, { description: 'Secret generated or rotated' })
  @ApiResponse({ status: 403, description: 'Missing application.secret.manage permission' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  @ApiResponse({ status: 409, description: 'Concurrent rotation (stale doc_version)' })
  @ApiResponse({ status: 503, description: 'APP_SECRET_KEY_UNAVAILABLE' })
  async rotateApplicationSecret(
    @Req() req: Request,
    @Res() res: Response,
    @Param('application_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug({ function: 'rotateApplicationSecret', id, version }, ApplicationsController.name);
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.applicationsService.rotateSecret(id, user_id, version);
    res.setHeader('Cache-Control', 'no-store');
    this.respond(res, result);
  }

  /**
   * Reveal an application's current secret; every call is audit-logged
   * เปิดดู secret ปัจจุบันของแอป ทุกครั้งถูกบันทึก audit
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param id - Application ID / รหัสแอปพลิเคชัน
   * @param version - API version / เวอร์ชัน API
   * @returns { id, secret, last4 }
   */
  @Get(':application_id/secret')
  @UseGuards(new AppIdGuard('application.secretReveal'), PlatformPermissionGuard)
  @RequirePlatformPermission('application.secret.reveal')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiParam({
    name: 'application_id',
    description: 'Unique identifier (UUID v4)',
    example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d',
  })
  @ApiOperation({
    summary: 'Reveal an application secret',
    description:
      'Decrypts and returns the current x-app-secret. Every call writes an audit row. Responses are sent with Cache-Control: no-store.\n\nถอดรหัสและคืน secret ปัจจุบัน ทุกครั้งที่เรียกถูกบันทึก audit',
    operationId: 'application_secretReveal',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiStdResponse(ApplicationSecretRevealResponseDto, { description: 'Secret revealed' })
  @ApiResponse({ status: 403, description: 'Missing application.secret.reveal permission' })
  @ApiResponse({ status: 404, description: 'APPLICATION_NOT_FOUND or APP_SECRET_NOT_FOUND' })
  @ApiResponse({ status: 503, description: 'APP_SECRET_KEY_UNAVAILABLE' })
  async revealApplicationSecret(
    @Req() req: Request,
    @Res() res: Response,
    @Param('application_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug({ function: 'revealApplicationSecret', id, version }, ApplicationsController.name);
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.applicationsService.revealSecret(id, user_id, version);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    this.respond(res, result);
  }

  /**
   * Turn x-app-secret enforcement on or off. Refuses to enable it on the caller's own app unless
   * this request presented that app's valid secret.
   * เปิด/ปิดการบังคับ x-app-secret ไม่ยอมเปิดกับแอปที่ผู้เรียกใช้อยู่เอง เว้นแต่คำขอนี้ส่ง secret ที่ถูกต้องมา
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param id - Application ID / รหัสแอปพลิเคชัน
   * @param body - { require_secret, doc_version? } / ข้อมูลสวิตช์
   * @param version - API version / เวอร์ชัน API
   * @returns { id, require_secret, doc_version }
   */
  @Patch(':application_id/secret/enforcement')
  @UseGuards(new AppIdGuard('application.secretEnforcement'), PlatformPermissionGuard)
  @RequirePlatformPermission('application.secret.manage')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiParam({
    name: 'application_id',
    description: 'Unique identifier (UUID v4)',
    example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d',
  })
  @ApiBody({ type: ApplicationSecretEnforcementRequestDto })
  @ApiOperation({
    summary: 'Turn application secret enforcement on or off',
    description:
      'require_secret=true makes every gateway reject requests from this app that lack a valid x-app-secret (within one allowlist refresh). 400 APP_SECRET_MISSING when the app has no secret; 409 APP_SECRET_SELF_LOCK when enabling the calling app without presenting its secret.\n\nเปิด/ปิดการบังคับ x-app-secret ของแอป มีผลภายในหนึ่งรอบรีเฟรช',
    operationId: 'application_secretEnforcement',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiStdResponse(ApplicationSecretEnforcementResponseDto, { description: 'Enforcement changed' })
  @ApiResponse({ status: 400, description: 'Invalid body, or APP_SECRET_MISSING' })
  @ApiResponse({ status: 403, description: 'Missing application.secret.manage permission' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  @ApiResponse({ status: 409, description: 'APP_SECRET_SELF_LOCK, or stale doc_version' })
  @ApiResponse({ status: 503, description: 'APP_SECRET_KEY_UNAVAILABLE' })
  async setApplicationSecretEnforcement(
    @Req() req: Request,
    @Res() res: Response,
    @Param('application_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ApplicationSecretEnforcementRequestDto,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug(
      { function: 'setApplicationSecretEnforcement', id, body, version },
      ApplicationsController.name,
    );
    const headers = req.headers as unknown as Record<string, unknown>;
    const callerAppId = String(headers['x-app-id'] ?? '').toLowerCase();
    // Uses the gateway's snapshot digests: right after the FIRST generate this can 409 for up to one
    // refresh (the digest has not arrived yet) — failing toward "not locked out" on purpose.
    // ใช้ digest จาก snapshot ของเกตเวย์ หลังสร้าง secret ครั้งแรกอาจได้ 409 ไม่เกินหนึ่งรอบรีเฟรช
    if (
      body.require_secret === true &&
      callerAppId === id.toLowerCase() &&
      !appAllowlistStore.matchesSecret(callerAppId, headers['x-app-secret'])
    ) {
      throw new HttpException(
        {
          code: 'APP_SECRET_SELF_LOCK',
          error:
            'You cannot require a secret on the application you are using — this client does not send its secret',
        },
        HttpStatus.CONFLICT,
      );
    }
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.applicationsService.setSecretEnforcement(id, body, user_id, version);
    this.respond(res, result);
  }
```

No `@EnrichAuditUsers()` on these three: their payloads carry no `*_by_id` to enrich, and rotate/reveal carry plaintext that should pass through as few hands as possible.

- [ ] **Step 6: Regenerate the app-api catalog**

```bash
bun run scripts/generate-app-api-catalog/run.ts
grep -n "'application.secret" apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
bun run audit:app-api-catalog-drift
```

Expected: `application.secretEnforcement`, `application.secretReveal`, `application.secretRotate` present in `APP_API_CATALOG` and in the `application` group; audit passes.

- [ ] **Step 7: CORS — confirm `x-app-secret` is an allowed request header (no code change expected)**

Evidence: both Nest apps are created with `cors: { origin: envConfig.CORS_ALLOWED_ORIGINS }` and **no** `allowedHeaders` (`apps/backend-gateway/src/main.ts:23-33` and `:52-62`). With `allowedHeaders` unset, the `cors` middleware reflects the preflight's `Access-Control-Request-Headers` back (`node_modules/cors/lib/index.js:95-100`), and nothing else in the repo sets `Access-Control-Allow-Headers` (`git grep -n -i "allowedHeaders\|access-control-allow-headers"` outside `docs/` returns nothing). Confirm:

```bash
grep -n "allowedHeaders" apps/backend-gateway/src/main.ts || echo "no allowedHeaders → request headers reflected"
grep -n "allowedHeaders\|options.headers" node_modules/cors/lib/index.js | head -3
```

If either grep shows an `allowedHeaders` list in `main.ts`, add `'x-app-secret'` to it in both `cors` blocks. The live preflight check is in Task 9 Step 3 (a proxy or LB in front of the gateway could still strip it).

- [ ] **Step 8: Type-check, lint, existing specs, permission + guard audits**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/platform/applications/applications.controller.ts src/platform/applications/applications.service.ts \
  src/platform/applications/swagger/request.ts src/platform/applications/swagger/response.ts
npx prettier --write src/platform/applications/applications.controller.ts src/platform/applications/applications.service.ts \
  src/platform/applications/swagger/request.ts src/platform/applications/swagger/response.ts \
  src/platform/applications/app-api-catalog.generated.ts
bunx jest src/platform/applications --runInBand --forceExit
cd ../.. && bun run audit:api-system-permission && bun run audit:guard-providers
```

Expected: PASS. `audit:api-system-permission` lists the three routes as covered by `application.secret.manage` / `application.secret.reveal`.

- [ ] **Step 9: Boot check** — start micro-cluster and the gateway locally (gateway needs a reachable micro-cluster for the initial allowlist load) and confirm both boot and the three routes are mapped:

```bash
(cd apps/micro-cluster && bun run start:dev) &   # wait for "successfully started"
cd apps/backend-gateway && bun run start:dev     # expect RouterExplorer lines for …/secret/rotate, …/secret, …/secret/enforcement; Ctrl-C after
```

- [ ] **Step 10: Commit**

```bash
git add apps/backend-gateway/src/platform/applications
git commit -m "feat(gateway): application secret rotate/reveal/enforcement routes with self-lock guard"
```

---

### Task 9: Gates, deploy order, curl verification

**Files:** none (verification only)

- [ ] **Step 1: Local gates**

```bash
SKIP_TESTS=1 bun run gates
```

Expected: `✓ ผ่านครบ`. Also run the gate that `gates` does not include but CI does, then the suites this branch touched:

```bash
bun run audit:platform-permission-resource
(cd apps/micro-cluster && bunx jest src/cluster/application src/common --runInBand --forceExit)
(cd apps/backend-gateway && bunx jest src/common/guard src/platform/applications --runInBand --forceExit)
(cd packages/error-catalog && bunx jest --runInBand --forceExit)
```

If `audit:fe-license-fixture` or `audit:env-drift` is red, check `origin/main` first (both have been red on `main` before).

- [ ] **Step 2: Deploy order — get the user's approval before pushing** (a push applies the migration to DEV within ~2 minutes even unmerged; it is additive, so that is safe, but it is still a DEV schema change)

1. **No key to provision.** Secrets are encrypted with the existing `SECRET_ENCRYPTION_KEY`, which micro-cluster already requires at boot in every environment. Do confirm it is the same value on every micro-cluster replica of an environment (it already must be, for DB-pool passwords), and tell whoever owns that key that rotating it now also invalidates every stored app secret.
2. `git push -u origin feature/application-secret` → migration applies on DEV; open the PR (`gh pr create --base main --title "feat: per-app x-app-secret (generate/reveal/rotate/enforce)" --body "Implements the backend half of carmen-platform docs/superpowers/specs/2026-10-09-application-secret-design.md"`).
3. Merge → deploy micro-cluster and gateway (either order is safe: an old gateway ignores the new snapshot fields; a new gateway with an old micro-cluster sees no `require_secret` and enforces nothing).
4. **Seed permissions, in this order** (role-permission only warns and skips keys it cannot find — reversed order grants nobody anything):
   ```bash
   cd packages/prisma-shared-schema-platform
   bun run db:seed.platform-permission && bun run db:seed.platform-role-permission
   bun run db:check.platform-permission && bun run db:check.platform-role-permission
   ```
5. In every environment, confirm the platform's own application can call the three new api_names before the FE ships — `allow_all = true`, or the three names in its allowlist:
   ```bash
   curl -sk "$BASE/api-system/applications/$PLATFORM_APP" -H "Authorization: Bearer $ADMIN" -H "x-app-id: $PLATFORM_APP" | jq '.data | {allow_all, api_names}'
   ```
   If `allow_all` is false, add `application.secretRotate`, `application.secretReveal`, `application.secretEnforcement` via `PUT /api-system/applications/$PLATFORM_APP` (`details.add`) — otherwise the FE card's first call is a 401 that logs the admin out.
6. Only then deploy the platform FE.

- [ ] **Step 3: CORS preflight on DEV** (the browser fails a disallowed header as a bare Network Error):

```bash
BASE=https://dev.blueledgers.com:4001
curl -sk -X OPTIONS "$BASE/api/app-status" -H "Origin: http://localhost:3304" \
  -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: x-app-id,x-app-secret" -D - -o /dev/null \
  | grep -i "access-control-allow"
```

Expected: `Access-Control-Allow-Origin: http://localhost:3304` and `Access-Control-Allow-Headers: x-app-id,x-app-secret`.

- [ ] **Step 4: DEV verification matrix (manual, after DEV deploy + seeds)** — **use only a dedicated test application.** DEV serves carmen-platform production; never rotate or enforce the platform's or inventory's app id.

Setup (platform-admin token `$ADMIN`, platform app id `$PLATFORM_APP`):

```bash
BASE=https://dev.blueledgers.com:4001
H=(-H "Authorization: Bearer $ADMIN" -H "x-app-id: $PLATFORM_APP" -H 'content-type: application/json')
# test app, allow_all so api lists do not interfere
curl -sk -X POST "$BASE/api-system/applications" "${H[@]}" -d '{"name":"zz-app-secret-test","allow_all":true}'   # → $TEST_APP
# no secret yet → enabling is refused
curl -sk -X PATCH "$BASE/api-system/applications/$TEST_APP/secret/enforcement" "${H[@]}" -d '{"require_secret":true}' | jq .error.code   # "APP_SECRET_MISSING", 400
curl -sk "$BASE/api-system/applications/$TEST_APP/secret" "${H[@]}" | jq .error.code                                            # "APP_SECRET_NOT_FOUND", 404
# generate S1 (note headers)
curl -sk -D - -X POST "$BASE/api-system/applications/$TEST_APP/secret/rotate" "${H[@]}"   # Cache-Control: no-store; data.previous_expires_at null → S1
curl -sk -X PATCH "$BASE/api-system/applications/$TEST_APP/secret/enforcement" "${H[@]}" -d '{"require_secret":true}'      # 200
sleep 65   # one allowlist refresh on every gateway
```

Probe with `GET $BASE/api/app-status` (`AppIdGuard` with `statusProbe`; no bearer needed) and record HTTP code + `error.code`:

| # | `x-app-id: $TEST_APP` plus | Expected |
|---|---|---|
| 1 | no `x-app-secret` | 401 `APP_SECRET_INVALID` |
| 2 | `x-app-secret: cas_wrongwrongwrongwrongwrongwrongwrongwrong` | 401 `APP_SECRET_INVALID` |
| 3 | `x-app-secret: $S1` (current) | 200 |

Then rotate to S2 and probe again:

```bash
curl -sk -X POST "$BASE/api-system/applications/$TEST_APP/secret/rotate" "${H[@]}" | jq .data   # S2; previous_expires_at ≈ now + 24 h
sleep 65
```

| # | `x-app-id: $TEST_APP` plus | Expected |
|---|---|---|
| 4 | `x-app-secret: $S2` (current) | 200 |
| 5 | `x-app-secret: $S1` (previous, within grace) | 200 |
| 6 | no `x-app-secret` | 401 `APP_SECRET_INVALID` |
| 7 | any `x-app-id` whose app has `require_secret=false`, no secret | 200 (unchanged behavior) |

Extra checks:
- Reveal: `curl -sk -D - "$BASE/api-system/applications/$TEST_APP/secret" "${H[@]}"` → 200, `data.secret == S2`, headers `Cache-Control: no-store` and `Pragma: no-cache`. An audit row appears with `action='view'`, `meta_data->>'event_type' = 'application.secret.revealed'`; each rotate left one `update` row with `event_type = 'application.secret.rotated'`.
- No ciphertext anywhere on the wire: `curl -sk "$BASE/api-system/applications/$TEST_APP" "${H[@]}" | jq '.data | keys'` contains the six secret fields and **no** `secret_ciphertext` / `secret_previous_ciphertext`; same for one row of `GET /api-system/applications`. In `tb_activity`, the enforcement row's before/after show `"[REDACTED]"` for both ciphertext columns.
- Read model: `has_secret true`, `secret_last4` = last 4 of S2, `secret_rotated_by_name` set, `secret_previous_expires_at` ≈ now + 24 h.
- Concurrent rotate: fire two rotates at once (`for i in 1 2; do curl … rotate & done; wait`) → one 200 and one 409; GET shows `secret_last4` of the 200's secret.
- Disabled + enforced: `PATCH …/$TEST_APP/status {"status":"disabled"}`, wait 65 s → probe without secret = 401 `APP_SECRET_INVALID`, with S2 = 403 `APP_DISABLED`; set back to `running`.
- Self-lock (needs no secret on the platform app; does not change it): `PATCH $BASE/api-system/applications/$PLATFORM_APP/secret/enforcement` with `x-app-id: $PLATFORM_APP`, body `{"require_secret":true}`, no `x-app-secret` → 409 `APP_SECRET_SELF_LOCK`; GET shows `require_secret` still false. `{"require_secret":false}` on the same app → 200.
- Stale `doc_version` on enforcement → 409.
- Disable enforcement on the test app, wait 65 s → probe with no secret = 200.
- Cleanup: delete the test app.

- [ ] **Step 5: Decrypt-failure behaviour (local DB only — never corrupt a row on DEV)** — with micro-cluster and the gateway running locally, give a throwaway app a secret and enforce it, then break its stored value:

```sql
-- local DB only: simulate "SECRET_ENCRYPTION_KEY changed since this was written"
UPDATE "tb_application" SET "secret_ciphertext" = 'enc:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA' WHERE "name" = 'zz-app-secret-local';
```

Expected after one refresh (≤ ~60–90 s):
  - micro-cluster logs `current secret of application … does not decrypt … every request to it will be refused until it is rotated` on each snapshot, and the snapshot still loads — every other app keeps working (probe one with `GET /api/app-status` → 200);
  - the broken app → 401 `APP_SECRET_INVALID` even with its old correct secret;
  - `GET …/secret` → 503 `APP_SECRET_KEY_UNAVAILABLE`; `PATCH …/secret/enforcement {"require_secret":true}` → 503; `{"require_secret":false}` → 200;
  - `POST …/secret/rotate` → 200 (rotate never decrypts — note `previous_expires_at` is set but the previous digest is skipped with a log, because the old value is the broken one); after one refresh the new secret works again.

- [ ] **Step 6: Record results** in the PR description (the two tables above filled in). No commit.
