# Tenant Migration & Tenant Seed — Platform Permissions

**Date:** 2026-09-29
**Repos:** `carmen-turborepo-backend-v2` (gateway + platform permission seed), `carmen-platform` (FE)
**Status:** Design approved in chat — pending written-spec review

## Goal

Let a platform user who is **not** a super-admin apply tenant migrations and run tenant seeds
(single BU and batch) by holding a platform permission, instead of both actions being hard-wired
to super-admin. Super-admin and the CI deploy token keep working exactly as today.

## Current state (verified 2026-09-29)

- **Backend:** every endpoint under `api-system/tenant/migrations/*` and
  `api-system/tenant/seeds/*` is guarded by `TenantMigrationGuard`
  (`apps/backend-gateway/src/auth/guards/tenant-migration.guard.ts`), which admits only a matching
  `x-deploy-token` or a super-admin — including the read-only `GET :bu_id/status`.
- **Frontend:** routes and nav gate the two pages on `cluster.read`, but every action — including
  "check status" — is gated on `isSuperAdmin`. A `cluster.read` holder who is not super-admin can
  open the page and gets 403 on everything.
- **Catalog:** no permission key exists for tenant migration or seed.
- **Audit gate:** the tenant routes sit in the `audit:api-system-permission` allowlist with
  reason `TenantMigrationGuard (deploy token)`.

## Permission keys

| Key | Grants |
|---|---|
| `tenant_migration.read` | View a BU schema's migration status |
| `tenant_migration.apply` | Deploy pending migrations (single BU and fleet) and resolve a failed migration |
| `tenant_seed.read` | View a BU's seed status |
| `tenant_seed.apply` | Seed baseline data into a BU (single row and batch) |

### Role mapping (`seed.platform-role-permission.data.ts`)

| Role | Keys |
|---|---|
| Platform Admin | `tenant_migration.*`, `tenant_seed.*` |
| Support Manager | `tenant_migration.read`, `tenant_seed.read` |
| Support Staff | `tenant_migration.read`, `tenant_seed.read` |
| Security Officer | — |

Support roles read so they can answer "is this BU behind / seeded?" without acting — the same
reasoning already recorded for `license_feature_group`. This **widens** read access: Support
Staff can see status today they cannot. Intended.

## Backend design

### Catalog

Add the four rows to `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
with descriptions matching neighbours. Add the role mapping above with a bilingual comment
explaining why support gets read only. The drift checker consumes the same data file, so it needs
no change.

### Guard (`TenantMigrationGuard`)

Order of checks:

1. `TENANT_MIGRATION_API_ENABLED` off → `403 Tenant migration API is disabled` (unchanged).
2. `x-deploy-token` matches → allow, `deployActor = 'ci:deploy-token'` (unchanged).
3. Handler carries no `@RequirePlatformPermission` → `403` (**fail closed**). Required because
   `PlatformPermissionGuard.handleUndecoratedRoute` lets an undecorated route through for every
   logged-in user while `PLATFORM_PERMISSION_MODE` is `log-only` (the default) — delegating
   without this check would turn a forgotten decorator into "anyone can deploy", strictly looser
   than today's super-admin-only guard. Needs `Reflector` injected.
3a. `KeycloakGuard.canActivate(context)` — unauthenticated → 403.
4. `PlatformPermissionGuard.canActivate(context)` — reads the handler's
   `@RequirePlatformPermission`, lets super-admin through, otherwise throws
   `403 Missing platform permission: <key>`.
5. `deployActor = request.platformPermissions.is_super_admin ? 'super-admin:<id>' : 'platform-user:<id>'`.

Constructor injects `KeycloakGuard`, `PlatformPermissionGuard` and `Reflector`; `PlatformSuperAdminGuard` is
removed — `PlatformPermissionGuard` already owns the super-admin bypass, so the decision lives in one
place.

**Scope:** step 4's `PlatformPermissionGuard.canActivate` is COARSE — it also accepts the required
key held in ANY cluster scope (`PlatformPermissionService.has`), which is too wide for these routes:
they act on any BU and on `'all'` (fleet-wide), previously super-admin only. `TenantMigrationGuard`
therefore re-checks the effective permissions after step 4 and requires the key at PLATFORM scope
specifically (or `is_super_admin`) — a cluster-scoped grant is rejected even though the delegated
guard call above already passed.

### Controllers

| Handler | Key |
|---|---|
| `GET tenant/migrations/:bu_id/status` | `tenant_migration.read` |
| `POST tenant/migrations/:bu_id/deploy` | `tenant_migration.apply` |
| `POST tenant/migrations/:bu_id/deploy/stream` | `tenant_migration.apply` |
| `POST tenant/migrations/:bu_id/resolve` | `tenant_migration.apply` |
| `GET tenant/seeds/:bu_id/status` | `tenant_seed.read` |
| `POST tenant/seeds/:bu_id/deploy/stream` | `tenant_seed.apply` |

If the controllers hold handlers beyond these, each gets a key by the same read/write rule — the
plan enumerates them from source, not from this table.

### Modules

`tenant-migrations.module.ts` and `tenant-seeds.module.ts` register `PlatformPermissionGuard` and
`PlatformPermissionService` (and drop `PlatformSuperAdminGuard`). Missing either crashed the gateway
at boot in #375; `audit:guard-providers` exists to catch it.

### `audit:api-system-permission`

Remove the tenant migration **and** tenant seed rows from the allowlist so the gate checks the new
decorators and keys against the catalog. If the checker only recognises `PlatformPermissionGuard` as
a guard that reads the decorator, teach it that `TenantMigrationGuard` does too. It must not be made
green by a change that stops it checking these routes.

### Out of scope

`PlatformMigrationGuard` (`/platform/migrations`, `/platform/seeds`) stays super-admin only.
micro-business is untouched — authorization stays at the gateway.

## Frontend design

### Routes and nav

- `App.tsx` `/tenant-migrations` → `requiredPermission="tenant_migration.read"`;
  `/tenant-seeds` → `tenant_seed.read`.
- `components/nav/platformNav.ts` same two keys; fix the comment near line 63 that lists Tenant
  Migrations as `cluster.read`.

### Management pages

`TenantMigrationManagement.tsx` and `TenantSeedManagement.tsx` replace `isSuperAdmin` with
`canApply = hasPermission('tenant_migration.apply')` / `hasPermission('tenant_seed.apply')`.

Each handler is classified individually — no blanket replace:

- **Read** (status check, "Check all") — allowed for anyone who reached the page (route already
  requires `.read`). Today these are wrongly blocked for non-super-admins.
- **Write** (deploy, deploy-all, resolve, seed row, seed all) — require `canApply`; the
  `disabledReason` names the missing permission.

### BU Edit technical tab

- `TenantMigrationCard` / `TenantSeedCard`: rename prop `isSuperAdmin` → `canApply` (each card has a
  single caller, `BusinessUnitEdit.tsx`).
- `BusinessUnitEdit.tsx` renders each card only when the user holds that card's `.read`; passes
  `canApply` from the matching `.apply`. Fixes the existing case where a BU editor without access
  sees the card and gets 403 on check.

### i18n (th + en)

Replace `pages.tenantMigration.superAdminRequired`, `pages.tenantSeed.superAdminRequired`, and
`common.state.superAdminRequired` (only the two cards use the last) with permission-named messages,
e.g. `Requires the tenant_migration.apply permission.` / `ต้องมีสิทธิ์ tenant_migration.apply`
(seed variant names `tenant_seed.apply`).

## Error handling

- Missing permission → gateway 403 `Missing platform permission: <key>`. FE should not reach it for
  gated buttons; if it does (stale permissions after a role change), the existing catch path surfaces
  the message via toast.
- Permission-service RPC failure → `PlatformPermissionGuard` already denies (fail closed).
- Deploy token path unchanged, so CI is unaffected by the permission seed state.

## Verification

Per the user's standing preference, no new test files. Existing suites must stay green, which means
updating tests that pin the old contract:

- BE `tenant-migration.guard.spec.ts` (constructor + super-admin path), FE
  `TenantMigrationCard.test.tsx` / `TenantSeedCard.test.tsx` (`isSuperAdmin` prop → `canApply`).

Gates:

- BE: `check-types`, gateway jest for the guard, `audit:api-system-permission`,
  `audit:guard-providers` (plus the other audit gates run before push).
- FE: `bun run typecheck`, `bun run lint`, `bun run test`.

Manual on DEV, after the BE deploy and permission seed:

1. Platform Admin **non**-super-admin: both menus visible; status check works; deploy/resolve/seed
   enabled and succeed.
2. Support Staff: menus visible; status check works; apply buttons disabled with the permission
   reason; `curl` to a deploy endpoint → 403 `Missing platform permission: tenant_migration.apply`.
3. Security Officer: menus hidden; direct route → 403 page.
4. Super-admin: unchanged.
5. CI deploy token: status endpoint still 200 with `x-deploy-token`.

Only a few DEV users can reach this app; a test user may need a role binding first.

## Rollout order

1. BE PR merged → gateway deployed to DEV.
2. Run the platform permission + role-permission seed on DEV (no schema migration). Without it,
   non-super-admins still get 403; super-admins are unaffected.
3. FE PR merged → auto-deploys to DEV.
4. Manual verification above.
5. `git push origin main:vercel` for production — only after BE is on the production backend and the
   seed has run there.

FE before BE is safe for super-admins but shows enabled buttons that 403 for everyone else — so BE
ships first.
