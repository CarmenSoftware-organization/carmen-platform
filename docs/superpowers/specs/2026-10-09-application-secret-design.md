# Application secret: generate, reveal, rotate, enforce per app

**Date:** 2026-10-09
**Repos:** `carmen-turborepo-backend-v2`, `carmen-platform`
(other clients — inventory-frontend, mobile, micro-* — add the header in their own follow-ups)
**Branch:** `feature/application-secret` (same name in each repo)
**Status:** Design approved; plans written (`docs/superpowers/plans/2026-10-09-application-secret-{backend,platform}.md`)

## Problem

An application is identified to the gateway only by `x-app-id`, a UUID that every
client ships in plain sight. `AppIdGuard` checks it against the allowlist and nothing
else — there is no secret anywhere (`tb_application` has no such column, the guard
reads no such header). Anyone who learns an app id can call the API as that app.

## Decisions (from brainstorming)

- **Goal: every app eventually carries a secret** (`x-app-secret`), SPAs included.
  Accepted limitation, stated so nobody over-trusts it: an SPA's secret is bundled into
  its JS and readable in DevTools. For SPAs it raises the bar from "know a UUID" to
  "load the app once"; it is real protection only for server-side clients.
- **Rollout: per-app switch `require_secret`** (default `false`). The guard enforces
  the secret only for apps with the switch on, so deploying the guard changes nothing.
  Admins turn it on app by app once that app's client ships the header.
- **Re-viewable secret.** Stored encrypted with the existing `@repo/secret-crypto`
  (AES-256-GCM, key `SECRET_ENCRYPTION_KEY` — already required by micro-cluster and
  already protecting tenant DB and SMTP passwords), not hashed, so an admin can reveal it again. Reveal is its own permission and every
  reveal is audit-logged.
- **Rotation grace window: 24 h.** Rotating keeps the previous secret valid for 24 h so
  a `require_secret` app is not cut off between rotate and client redeploy.

## Backend (`carmen-turborepo-backend-v2`)

### Schema — `tb_application` (platform schema, one migration)

| Column | Type | Note |
|---|---|---|
| `require_secret` | `Boolean @default(false)` | the per-app enforcement switch |
| `secret_ciphertext` | `String?` | `encryptSecret()` output (`enc:v1:…`) |
| `secret_last4` | `String? @db.VarChar(4)` | shown masked without decrypting |
| `secret_rotated_at` | `DateTime? @db.Timestamptz(6)` | |
| `secret_rotated_by_id` | `String? @db.Uuid` | FK `tb_user` |
| `secret_previous_ciphertext` | `String?` | grace-window secret |
| `secret_previous_expires_at` | `DateTime? @db.Timestamptz(6)` | `rotated_at + 24h` |

DB CHECK: `require_secret = false OR secret_ciphertext IS NOT NULL`.

### Secret format

`cas_` + 40 chars base62 from `crypto.randomBytes` (≈238 bits). The prefix makes a
leaked secret greppable in logs and repos.

### Endpoints (`/api-system/applications/:id/secret…`)

| Method & path | Permission | Behavior |
|---|---|---|
| `POST …/secret/rotate` | `application.secret.manage` | Generate (first time) or rotate. Moves current → previous with 24 h expiry. Returns `{ secret, last4, rotated_at }` — the only response besides reveal that carries plaintext. Audit `application.secret.rotated`. |
| `GET …/secret` | `application.secret.reveal` | Decrypt and return `{ secret, last4 }`. `404` when none. Audit `application.secret.revealed` on every call. `Cache-Control: no-store`. |
| `PATCH …/secret/enforcement` | `application.secret.manage` | Body `{ require_secret, doc_version }`. `400 APP_SECRET_MISSING` when enabling without a secret. **Self-lock guard:** when `:id` equals the caller's own `x-app-id` and the request did not present that app's valid secret → `409 APP_SECRET_SELF_LOCK` (mirrors the status-modes self-lock). `409` on stale `doc_version`. |

`GET /api-system/applications/:id` (and the list) gain `require_secret`, `has_secret`,
`secret_last4`, `secret_rotated_at`, `secret_rotated_by_name` — **never** ciphertext.
A secret that will not decrypt (key changed, corrupt ciphertext) → `503
APP_SECRET_KEY_UNAVAILABLE` on reveal/enforce; at snapshot build that app's digests are
skipped and logged, never crashing the snapshot. Reveal on an app with no secret →
`404 APP_SECRET_NOT_FOUND`. Encryption lives in micro-cluster only; the gateway receives
only SHA-256 digests inside the snapshot.

Both ciphertext columns go on the audit-log redaction list (it matches whole field
names, so the existing `secret` entry does not cover them).

The two permissions go in the platform permission seed **and** the role-permission seed;
neither seed runs on deploy — run `db:seed.platform-permission` then
`db:seed.platform-role-permission` by hand on each environment (reverse order silently
grants nobody), and the endpoints in
the app-api catalog (run `scripts/run-gates.sh` locally, plus `audit:platform-permission-resource`, which CI
runs but `gates` does not).

### Guard — `AppIdGuard`

- The allowlist snapshot carries `require_secret` plus **SHA-256 digests** of the current
  and (unexpired) previous secret, decrypted once at snapshot load — the guard never
  decrypts per request and never holds plaintext.
- New step right after "401 unknown app": if `require_secret`, hash `x-app-secret` and
  `timingSafeEqual` against current/previous digests. Mismatch or missing →
  **`401` with code `APP_SECRET_INVALID`**. Applies to `statusProbe` too.
- Changes reach each gateway through the existing allowlist poll (`APP_ALLOWLIST_TTL_MS`,
  60 s) — there is no push refresh, so allow ~60–90 s. During that window a just-rotated
  secret on an enforced app is still rejected while the previous one works.
- CORS: confirm `x-app-secret` is an allowed request header on the gateway before any
  browser client sends it — otherwise the preflight fails as a bare Network Error.

## Frontend (`carmen-platform`)

### Client header

`src/services/api.ts` sends `x-app-secret` when `REACT_APP_API_APP_SECRET` is set
(optional, so existing env files keep working). Add it to `.env.example`. A 401 whose
code is `APP_SECRET_INVALID` must **not** go through refresh-then-logout — show a
toast that the app's secret is wrong/out of date instead.

### Design direction

Purpose: a credential an admin touches rarely, under some tension (rotate can break a
client). Tone: quiet, technical, deliberate — one card, no decoration. Memorable detail:
**the key stub** — a fixed-width monospace field that always shows `cas_••••••••••a91f`
(last4 never hidden), so admins identify which secret a client holds without revealing
it. Revealing swaps the dots for the plaintext in place (no layout shift — same font,
same width, horizontal scroll inside the field on mobile) and re-masks itself after
30 s, with a thin depleting bar under the field as the only motion.

### `ApplicationSecretCard` (`src/pages/applicationEdit/`)

An operational card like `ApplicationStatusCard` / `ApplicationBypassUsersCard`: own
actions, own confirms, never rides the page's Save, never touches `formData`. Placed as
a full-width row under the Status/Bypass grid.

```
┌ App secret ───────────────────────────── [Enforced ●] ┐
│ Clients send it as x-app-secret.                       │
│ ┌──────────────────────────────────────┐ [👁] [⧉]     │
│ │ cas_••••••••••••••••••••••••••••a91f │               │
│ └──────────────────────────────────────┘               │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔ (30 s re-mask bar, only while revealed)   │
│ Rotated 3 days ago by Somchai · previous valid until … │
│ ─────────────────────────────────────────────────────  │
│ [switch] Require secret     [↻ Rotate secret]          │
└────────────────────────────────────────────────────────┘
```

States:

| State | Shows |
|---|---|
| No secret | Inline empty row "No secret yet" + **Generate secret** (primary). Switch disabled, hint "Generate a secret first". |
| Has secret, masked | Key stub; Reveal (needs `application.secret.reveal`), Copy (copies only after reveal — copying dots is useless; button reveals-then-copies). |
| Revealed | Plaintext in the same field, 30 s bar, Hide. Clears plaintext from state on hide/unmount. |
| Just generated / rotated | Revealed automatically + `toast.success`; if `require_secret` the toast says the old secret works until `previous_expires_at`. |
| Grace window open | Meta line "Previous secret valid until {time}" (`text-warning`). |
| Enforced | `Badge variant="success"` "Enforced"; off → `secondary` "Not enforced". |

Confirms (`<ConfirmDialog>`): **Rotate** (stronger copy when enforced: "clients must update
within 24 h"), **Enable enforcement** ("requests without the secret will be rejected"),
**Disable enforcement**. Self-lock `409` → `toast.error` explaining this build lacks the
secret; `APP_SECRET_KEY_UNAVAILABLE` → `toast.error`. Enforcement PATCH threads
`doc_version` (`isVersionConflict` → `notifyVersionConflict()` + `onChanged`).

Permissions: whole card behind `application.secret.manage` OR `.reveal` via `<Can>`;
users with neither see nothing. All strings in the TH/EN catalogs.

`ApplicationIdentityHero` gains a small "Secret required" chip when `require_secret`, so
the fact is visible at the top without scrolling.

## Rollout

1. Backend: migration + endpoints + guard. All apps `require_secret=false` → no behavior change.
2. Run the two permission seeds on the environment.
3. Frontend: card + optional header. Deploy after BE (card calls new endpoints).
4. Per app: generate → put secret in that client's env/secret store → redeploy client →
   enable enforcement. Do carmen-platform's own app **last** (self-lock guard protects it).

## Out of scope

- Adding the header to inventory-frontend, mobile, micro-* (each its own follow-up).
- Multiple named secrets per app, expiring secrets, re-encryption tooling for rotating
  `SECRET_ENCRYPTION_KEY` itself.
- Wiring `REACT_APP_API_APP_SECRET` into `deploy-dev.yml`, `deploy-gcs.yml` and Vercel —
  required before carmen-platform's own app is enforced.

## Verification

- Typecheck + lint + existing suites in both repos (no new tests per working preference
  unless asked).
- Browser at 390 px and desktop, TH/EN: generate, reveal/auto-mask, copy, rotate,
  enforce on a throwaway app; curl that app with no/old/new/previous secret → 401/200.
