# Application status modes: running, maintenance, read-only, disabled

**Date:** 2026-10-09
**Repos:** `carmen-turborepo-backend-v2`, `carmen-platform`, `carmen-inventory-frontend-react`
(mobile is out of scope — separate follow-up)
**Branch:** `feature/application-status-modes` (same name in each repo)
**Status:** Design approved, awaiting spec review

## Problem

An application (`tb_application`, identified to the gateway by `x-app-id`) has only
`is_active: Boolean`. Turning it off drops the app from the gateway allowlist
snapshot, so `AppIdGuard` answers **401** "not found or not allowed". Clients treat 401
as an auth failure: they refresh the token, get 401 again, and log the user out. A
user never learns the app was switched off on purpose, and there is no way to take an
app down for maintenance, freeze writes, or tell users when it will be back.

## Decisions (from brainstorming)

- **Four statuses:** `running` · `maintenance` · `read_only` · `disabled`. "stop" and
  "disable" are the same thing (`disabled`).
- **Read-only rule:** by HTTP method. `GET`/`HEAD`/`OPTIONS` pass; every other method
  is blocked, except `auth.*` api_names (login/refresh/logout are POSTs). POSTs that
  only read (`preview`, `check`, …) are blocked too — accepted.
- **Status metadata:** `status_message` (free text) and `status_until` (expected
  return time). `status_until` is **display-only**; nothing switches back
  automatically — an admin returns the app to `running` by hand. Scheduled windows are
  a later spec.
- **Bypass list:** per-application list of users who keep full access during
  `maintenance` and `read_only`. It has **no effect on `disabled`**, which blocks
  everyone including login.
- **Storage — approach A:** a `status` column replaces `is_active` via expand/contract.
  `is_active` stays for one release, derived from `status`, then is dropped.
- **Scope:** backend + `/applications` in carmen-platform + inventory React frontend.

## Wire contract

Error bodies use the same envelope the license errors already use, so clients read
`body.error.code` (as `licenseErrorCodeFrom()` does in the inventory frontend).
Verify during implementation that the gateway exception filter produces exactly this
shape for the new exceptions.

```json
{ "error": { "code": "APP_MAINTENANCE", "message": "…" }, "until": "2026-10-09T07:00:00.000Z" }
```

| Status | Request outcome | Response when blocked |
|---|---|---|
| `running` | passes | — |
| `read_only` | passes if method is `GET`/`HEAD`/`OPTIONS`, or api_name starts with `auth.`, or the user is on the bypass list | **503** `APP_READ_ONLY` |
| `maintenance` | passes if api_name starts with `auth.`, or the user is on the bypass list | **503** `APP_MAINTENANCE` |
| `disabled` | always blocked (bypass list and login included) | **403** `APP_DISABLED` |
| unknown app / api not allowed | unchanged | **401** (unchanged) |

- `until` sits at the **top level** of the body (the gateway exception filter keeps only catalog keys inside `error`) and is present only when `status_until` is set. A 503 carries `Retry-After`
  (seconds until `status_until`, minimum 60) only when `status_until` is in the future.
- `message` is `status_message` when set, otherwise a default English sentence; clients
  show their own translated text and use `message` as the admin's extra note.
- `disabled` moves from 401 to **403 with a code** so clients stop treating it as an
  expired session.

## Part 1 — Backend (`carmen-turborepo-backend-v2`)

### Schema (`packages/prisma-shared-schema-platform`)

`tb_application` gains:

| Column | Type | Notes |
|---|---|---|
| `status` | `VARCHAR NOT NULL DEFAULT 'running'` | `CHECK (status IN ('running','maintenance','read_only','disabled'))` |
| `status_message` | `TEXT NULL` | |
| `status_until` | `TIMESTAMPTZ NULL` | display-only |
| `status_changed_at` | `TIMESTAMPTZ NULL` | |
| `status_changed_by_id` | `UUID NULL` | FK → `tb_user` |

Migration backfills `status = CASE WHEN is_active = false THEN 'disabled' ELSE 'running' END`.

New table `tb_application_bypass_user`:
`id` UUID PK, `application_id` FK → `tb_application`, `user_id` FK → `tb_user`,
`created_at`, `created_by_id`, `UNIQUE (application_id, user_id)`.

The migration is **expand-only** (no DROP). Table references in raw SQL must go through
`systemTableRef()`.

### micro-cluster (`apps/micro-cluster/src/cluster/application/`)

- **Keep `Applications.allowlistSnapshot` exactly as today** (active apps only). Add
  **`Applications.allowlistSnapshotV2`** returning every non-deleted app with
  `{ id, allow_all, device, apis, status, status_message, status_until, bypass_user_ids }`.
  Reason: if the new micro-cluster deployed before the new gateway and the old pattern
  started returning disabled apps, the old gateway store (which never checks
  `is_active`) would **let disabled apps through**. Two patterns make every deploy
  order safe.
- Read model (`findOne`, paginate) adds `status`, `status_message`, `status_until`,
  `status_changed_at`, `status_changed_by_name`, and (`findOne` only)
  `bypass_users: { user_id, name, email }[]`. `is_active` is still returned, computed
  as `status !== 'disabled'`.
- Paginate accepts a `status` filter (one or more values).
- Generic update no longer accepts `status*`. **Legacy `is_active` on update** (old
  platform builds still send it): `false` → `status = 'disabled'`; `true` →
  `status = 'running'` **only if** the current status is `disabled`. It never
  overwrites `maintenance` / `read_only`.
- New message patterns: `updateStatus` and `setBypassUsers` (replace semantics: the
  body is the full desired set). `updateStatus` honours `doc_version` (409 on stale),
  sets `status_changed_at/by`, clears `status_message`/`status_until` when the new
  status is `running`, and records an activity event.

### Gateway (`apps/backend-gateway`)

New endpoints under `/api-system/applications`, gated like the existing application
endpoints (`platform_admin`, `PlatformPermissionGuard`):

- `PATCH /:id/status` — body `{ status, status_message?, status_until?, doc_version? }`.
  **Self-lock guard:** when `:id` equals the request's own `x-app-id` and
  `status !== 'running'`, answer **409** `{ error: { code: 'APP_SELF_LOCK' } }`
  without calling micro-cluster.
- `PUT /:id/bypass-users` — body `{ user_ids: string[] }`.

New public-to-the-app endpoint:

- `GET /api/app-status` — guarded by `AppIdGuard('app.status', { statusProbe: true })`,
  which **skips the status gate and the per-api allowlist check** (so it answers for
  `disabled` apps and for apps whose api list does not include `app.status`). No
  `KeycloakGuard`: the handler verifies the bearer token the same way `KeycloakGuard`
  does, and a missing or invalid token yields `bypass: false`, never a 401.
  Returns `{ status, message, until, bypass: boolean }`.

`app-allowlist.store.ts` holds the V2 snapshot (`status`, metadata, `Set` of bypass
user ids); `app-allowlist.refresher.ts` calls V2. Refresh interval stays
`APP_ALLOWLIST_TTL_MS` (default 60 s) — a status change takes effect within one
interval per gateway instance.

`AppIdGuard.canActivate` order:

1. Header empty / not UUID → 400 (unchanged).
2. App not in snapshot → 401 (unchanged).
3. Guard constructed with `statusProbe` → pass.
4. `status === 'disabled'` → 403 `APP_DISABLED`.
5. api not allowed for the app → 401 (unchanged).
6. `status === 'running'` → pass.
7. api_name starts with `auth.` → pass.
8. `request.user?.user_id` in the bypass set → pass.
9. `status === 'read_only'` and method is `GET`/`HEAD`/`OPTIONS` → pass.
10. Otherwise → 503 `APP_READ_ONLY` / `APP_MAINTENANCE`.

`KeycloakGuard` is applied at class level and `AppIdGuard` at method level, so
`request.user` is already populated in step 8. **Known limitation:** routes without
`KeycloakGuard` (e.g. `auth.register`) have no user and are treated as not on the
bypass list.

### Gates

Run `bun run gates` before pushing. The two most likely to fail:
`app-api-catalog` (new api_name `app.status` → regenerate the catalog) and
`audit:api-system-permission` (two new `/api-system` endpoints).

## Part 2 — `/applications` (`carmen-platform`)

### Types and service

- `src/types/index.ts`: `type ApplicationStatus = 'running' | 'maintenance' | 'read_only' | 'disabled'`;
  `Application` gains optional `status`, `status_message`, `status_until`,
  `status_changed_at`, `status_changed_by_name`, `bypass_users`. When `status` is
  absent (old backend), derive it from `is_active`.
- `applicationService`: add `updateStatus(id, payload)` and `setBypassUsers(id, userIds)`;
  stop sending `is_active` in `ApplicationWritePayload`.

### Management (`ApplicationManagement.tsx`)

- Keep the "draw only the exception" rule: `running` rows get no badge; others get a
  badge beside the name — `maintenance` `warning`, `read_only` `info`, `disabled`
  `secondary`. A tooltip notes when `status_until` has already passed.
- Filter switches from `where.is_active` to `where.status` (multi-select).
- CSV: `status` column replaces `is_active`; add `status_until`.
- `ApplicationRegistrySummary`: counts per status.

### Edit (`ApplicationEdit.tsx`)

Status is an operational action, **not** part of the form's Save/Cancel — so editing a
description can never also take an app down without its own confirmation.

- Remove the `is_active` switch from the form.
- **"Service status" card:** the four statuses, each with a one-line description of what
  callers experience. Non-`running` choices reveal `status_message` (`Textarea`) and
  `status_until` (`datetime-local`). Apply goes through `<ConfirmDialog>` stating the
  impact and "takes effect within about a minute", then `PATCH /status` with the
  `doc_version` from its own state. On 409 distinguish `isVersionConflict` (notify +
  refetch) from `APP_SELF_LOCK` (toast explaining why).
- **Own app** (`id === REACT_APP_API_APP_ID`): only `running` is selectable, with an
  explanation that this page would lose access to undo the change.
- **"Bypass users" card:** `<UserMultiSelect>` with its own Save (`PUT /bypass-users`);
  helper text says it applies to maintenance and read-only, not disabled.
- `ApplicationIdentityHero`: status badge (via `afterTitle`, outside the `<h1>`) instead
  of Active/Inactive.

### i18n

en + th keys for status names, descriptions, confirm copy, self-lock and bypass texts.

## Part 3 — Inventory frontend (`carmen-inventory-frontend-react`)

- **`lib/api-error.ts`:** add `APP_STATUS_ERROR_CODES` and `appStatusErrorCodeFrom(body)`
  shaped like `licenseErrorCodeFrom`. `ApiError.from()` sets `retryable = false` for
  `APP_MAINTENANCE` / `APP_READ_ONLY` (today every 5xx is retryable, which would hammer
  a gateway that is down for maintenance).
- **`lib/http-client.ts`:** on any response carrying an app-status code, update a
  central `app-status` store. These responses never enter the refresh/logout path, and
  `APP_DISABLED` (403) must not open `PermissionDeniedDialog`.
- **`useAppStatus()`:** fetch `GET /api/app-status` on app load, every 60 s, and on tab
  focus; merge with what `http-client` observed. A 404 (old backend) means `running`.
- **`routes/root-layout.tsx`** (same placement as `license-expired-banner`):

| State (user not on bypass list) | UI |
|---|---|
| `maintenance` | full-screen "Under maintenance" + message + "expected back {until}"; no logout; resumes automatically when polling sees `running` |
| `read_only` | top banner "Read-only mode"; Save buttons stay enabled; a blocked write shows a translated toast |
| `disabled` | full-screen "This application has been disabled" + sign-out button |
| on bypass list (maintenance/read_only) | small banner "You are using the app during maintenance as an exempt user" |

- Login page: `APP_DISABLED` shows the disabled message instead of a generic error.
- `ApiErrorToaster` skips the app-status codes the layout already renders.
- en + th keys in `messages/`.

## Deploy order

1. **Backend.** Expand migration, then micro-cluster and gateway in any order (V2
   pattern makes it safe). Pushing a branch that contains a migration applies it to DEV
   within ~2 minutes, even unmerged — harmless here because it is expand-only, but
   expect it.
2. **carmen-platform.** Works against old and new backend (falls back to `is_active`);
   the status/bypass actions 404 until the backend is up.
3. **Inventory frontend.** Any time; `/api/app-status` 404 is read as `running`.
4. **Contract (later, own PR).** Drop `is_active` once nothing reads it — check
   `apps/micro-business/src/log/activity-event/activity-event.service.ts` and mobile.

## Risks

| Risk | Mitigation |
|---|---|
| **The DEV backend serves carmen-platform's production** (`.env.prod` points at DEV); testing with a real app id blocks real users | Test only with an application created for the test — never the platform's or inventory's app id |
| Admin locks the platform out of itself | 409 `APP_SELF_LOCK` in the gateway + option disabled in the UI |
| Gateway instances refresh at different times | Up to 60 s of disagreement; stated in the confirm dialog |
| Old clients (mobile) get unknown 503/403 | They show a generic error but no longer log the user out — better than today's 401 |
| Routes without `KeycloakGuard` cannot see bypass users | Documented limitation |
| Old platform build sends `is_active` | Legacy mapping in micro-cluster (never overwrites maintenance/read_only) |

## Verification

New automated tests are skipped per the user's standing preference; existing suites,
typecheck and lint must pass in all three repos.

- **curl matrix on DEV** with a dedicated test application: 4 statuses × `GET`/`POST` ×
  normal user / bypass user × `auth.login`. Check status code, `error.code`, `until`
  and `Retry-After` in each cell, after waiting one refresh interval (60 s) per change.
- `GET /api/app-status` returns the right `status` and `bypass` for both users, and
  answers while the app is `disabled`.
- Self-lock: `PATCH /status` on the request's own app id returns 409 `APP_SELF_LOCK`.
- Legacy: old-shape update with `is_active: false` sets `disabled`; `true` on a
  `maintenance` app leaves it in maintenance.
- **Browser, carmen-platform:** status card (confirm, message/until, own-app lock),
  bypass card, list badges, status filter, CSV, summary counts; 390 px width.
- **Browser, inventory** pointed at the test app: maintenance full-screen → back to
  `running` resumes without reload; read-only banner + blocked-save toast; bypass
  banner; disabled at login and mid-session; 390 px width.

## Out of scope

- Scheduled maintenance windows / automatic return to `running`.
- Mobile client handling.
- Per-api_name read-only exceptions.
- Dropping `is_active` (step 4 above).
