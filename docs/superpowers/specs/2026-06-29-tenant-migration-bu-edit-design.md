# Tenant Migrations on the Business Unit Edit page

**Date:** 2026-06-29
**Status:** Approved (design)
**Page:** `src/pages/BusinessUnitEdit.tsx` (existing BU only)

## Problem

A Business Unit (BU) is a tenant. Its tenant database is reached via the
`db_connection` config stored on the BU record (already shown read-only in the
"Database Connection" section of the edit page). When the platform ships schema
changes, each tenant DB must have those migrations applied. Today there is no UI
to do this — a super-admin would run a CLI against the tenant by hand.

We want a control on the BU edit page to **check** whether this BU's tenant DB
has pending migrations and **apply** them, scoped to this single BU.

## Backend contract (already exists)

Source: dev backend OpenAPI (`https://dev.blueledgers.com:4001/swagger`). The
local backend (`:4000`) was unreachable during design; the dev backend has these
endpoints. All are **super-admin only** (`security: [{ bearer: [] }]`; error text
"Disabled, missing token, or not a super-admin"). The logged-in super-admin's
bearer token (added by the axios interceptor) is what authorizes the call — the
optional CI/CD deploy-token header is **not** used by the frontend.

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api-system/tenant/migrations/{bu_id}/status` | Pending-migration status |
| `POST` | `/api-system/tenant/migrations/{bu_id}/deploy` | Apply pending migrations |

> Note: a `POST .../resolve` endpoint and a `bu_id='all'` multi-BU mode also exist
> but are **out of scope** (see Non-goals).

The backend resolves the **target tenant DB from the BU's stored `db_connection`**.
The frontend sends only `bu_id` in the path — it never sends connection details.

### Response shapes

`GET /status` → `TenantMigrationStatusResponseDto`:
```jsonc
{
  "bu_id": "…", "bu_code": "BU01",
  "has_pending": true,
  "pending": ["20260622120000_add_product_account_code_mapping"],
  "up_to_date": false,
  "raw": "Following migration have not yet been applied:\n…"   // raw CLI text
}
```

`POST /deploy` → `TenantMigrationDeployResponseDto`:
```jsonc
{
  "bu_id": "…", "bu_code": "BU01",
  "success": true,
  "already_up_to_date": false,
  "applied_migrations": ["20260622120000_add_product_account_code_mapping"],
  "raw": "The following migration(s) have been applied:\n…"
}
```

**Envelope caveat:** swagger annotates the `200` for both as the generic
`StdResponseMetaDto` (`{ status, success, message, timestamp }`), while the
typed DTOs above are defined but not wired to a `200`. This is the usual pattern
where the response interceptor wraps the DTO in a `data` field. The service
therefore unwraps tolerantly with `response.data.data ?? response.data`, and we
confirm the exact envelope on the first live call (the card surfaces `raw`, and
the dev debug Sheet shows the full response).

### Error responses
- **403** — disabled, missing token, or not a super-admin.
- **409** — a migration operation is already running for this BU.
- **500** — migration failed (the `raw`/message carries the reason).

## Design

### Access control
Per decision: the card is **visible to everyone who can reach the edit page**
(`cluster.update`), but its action buttons are **disabled with a tooltip** when
the user is not a super-admin ("Super-admin required"). The backend independently
enforces super-admin, so this is purely a UX affordance.

### 1. Types — `src/types/index.ts`
Add (fields optional only where the API does not guarantee them — here the DTOs
mark all fields required, so model them as required on the read types):
```ts
export interface TenantMigrationStatus {
  bu_id: string;
  bu_code: string;
  has_pending: boolean;
  pending: string[];
  up_to_date: boolean;
  raw: string;
}

export interface TenantMigrationDeployResult {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
  raw: string;
}
```

### 2. Service — `src/services/tenantMigrationService.ts` (new, dedicated)
Kept separate from `businessUnitService` (distinct `/tenant/migrations` resource;
`businessUnitService`/the edit page are already large). Follows the standard
service shape (base path `/api-system/...`, interceptor adds auth + `x-app-id`).
```ts
import api from './api';
import type { TenantMigrationStatus, TenantMigrationDeployResult } from '../types';

const tenantMigrationService = {
  getStatus: async (buId: string): Promise<TenantMigrationStatus> => {
    const res = await api.get(`/api-system/tenant/migrations/${buId}/status`);
    return res.data.data ?? res.data;
  },
  deploy: async (buId: string): Promise<TenantMigrationDeployResult> => {
    const res = await api.post(`/api-system/tenant/migrations/${buId}/deploy`);
    return res.data.data ?? res.data;
  },
};

export default tenantMigrationService;
```

### 3. Component — `src/components/TenantMigrationCard.tsx` (new)
Self-contained so it survives the eventual `BusinessUnitEdit` split (a pending
project item) and stays out of the page's form-submit flow.

**Props:**
```ts
interface TenantMigrationCardProps {
  buId: string;
  buCode: string;
  buName: string;
  hasDbConnection: boolean;   // derived: formData.db_connection is non-empty
  isSuperAdmin: boolean;      // from useAuth()
}
```

**Local state only** (no page-level state, no `doc_version`):
`status: TenantMigrationStatus | null`, `loadingStatus: boolean`,
`deploying: boolean`, `confirmOpen: boolean`, `lastChecked: string | null`,
`showRaw: boolean`.

**Render** — a top-level `<Card>` titled "Tenant Migrations" with a short
description ("Check and apply database schema migrations for this BU's tenant
database"). Behaviour by state:

| State | Render |
|-------|--------|
| Initial (no status fetched) | "Check status" button + helper text. Status is **on-demand**, never auto-fetched on page load. |
| Loading status | button shows `Loader2` spinner ("Checking…") |
| Loaded, `up_to_date` | `<Badge variant="success">Up to date</Badge>` + "Last checked {time}" + re-check button |
| Loaded, `has_pending` | "{n} pending migration(s)" + list of `pending` names (`text-xs font-mono`) + a destructive-styled **"Apply {n} migration(s)"** button + re-check button |
| Raw output (any loaded/deployed state) | a collapsible `<pre>` (`whitespace-pre-wrap`, `max-h-60 overflow-auto`) showing `raw`, toggled by `showRaw` |

**Button gating** — both "Check status" and "Apply" are `disabled` when either:
- `!isSuperAdmin` → tooltip "Super-admin required."
- `!hasDbConnection` → tooltip "Configure a database connection first."

(Use the existing tooltip primitive; when both reasons apply, the
no-db-connection message takes precedence since it is the more actionable one.)

**Deploy flow:** "Apply" opens a `<ConfirmDialog>` (never `window.confirm`) whose
body shows the BU name + code and the list of `pending` migration names, with a
destructive Confirm. On confirm → `tenantMigrationService.deploy(buId)`:
- success with `applied_migrations.length` → `toast.success("Applied N migration(s) to {buCode}.")`
- success with `already_up_to_date` → `toast.info("Already up to date.")`
- then **re-fetch status** so the card flips to "Up to date".
`ConfirmDialog` self-manages its spinner; the page passes an async `onConfirm`.

**Error handling** (every catch → `parseApiError(err)` + toast):
- `403` → `toast.error("Migrations are disabled or require super-admin.")`
- `409` → `toast.warning("A migration is already running for this BU. Try again shortly.")` — controls stay enabled to retry.
- `500` → `toast.error(message)` and keep the `raw` output visible for diagnosis.
- otherwise → `toast.error(parseApiError(err).message)`.

### 4. Wiring into `BusinessUnitEdit.tsx`
- Render `<TenantMigrationCard>` as a sibling **after `</form>`** (alongside the
  Branding card), gated on `!isNew` so it only shows for existing BUs.
- Pass `buId={id!}`, `buCode={formData.code}`, `buName={formData.name}`,
  `hasDbConnection={!!formData.db_connection?.trim()}`, and `isSuperAdmin` from
  `useAuth()`.
- The existing read-only "Database Connection" section is unchanged.

## Loading / button patterns
Follows the repo conventions: `Loader2` spinner + disabled buttons during async
calls; `ConfirmDialog` for the destructive deploy; `Badge variant="success"` for
the up-to-date status (never raw green Tailwind).

## Non-goals (YAGNI)
- The `POST .../resolve` endpoint (mark a migration applied/rolled-back) — recovery tool, not needed now.
- The `bu_id='all'` multi-BU deploy mode.
- The CI/CD deploy-token header (frontend uses the super-admin bearer token).
- Editing `db_connection` itself — stays read-only as today.
- Auto-fetching status on page load.
- `doc_version` / optimistic locking — migrations don't touch the BU record.

## Verification
Manual, against the dev backend (`dev.blueledgers.com:4001`):
1. Open this BU's edit page as a super-admin.
2. Click "Check status" → pending list (or "Up to date") renders; `raw` toggles open.
3. Click "Apply" → ConfirmDialog lists pending migrations → confirm → success toast → status re-fetches and shows "Up to date".
4. As a non-super-admin: card is visible, buttons disabled with the tooltip.
5. With a BU that has no `db_connection`: buttons disabled with the "configure connection" tooltip.

No automated tests (Vitest setup is still a pending project item).
