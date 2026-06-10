# Platform Super-Admin (god-mode bypass) Plan

> **For agentic workers:** Adds a platform "super-admin" allowlist that bypasses ALL permission checks. Spans backend (`carmen-turborepo-backend-v2`) + frontend (`carmen-platform`), both on branch `feat/platform-super-admin`. Builds on the existing Platform RBAC.

**Decisions (approved):**
- Bypass via an explicit `is_super_admin` flag (NOT a catalog snapshot) — a true god-mode that doesn't depend on the catalog being complete.
- New table + management endpoints + a frontend management page. **Managing super-admins is restricted to super-admins themselves** (no privilege-escalation path). The first super-admin is bootstrapped via a seed script.

**Contract:** `GET /api/user/permission/platform` response gains `is_super_admin: boolean`. Shape: `{ platform: string[]; clusters: Record<string,string[]>; is_super_admin: boolean }`.

**DB POLICY:** edit schema + `bun run db:generate` (offline, safe). DEFER `db:migrate`/seed application to the user (note the commands). Verify via check-types + unit tests + (offline) build.

---

## BACKEND (`carmen-turborepo-backend-v2`)

### B1: Prisma table
- Modify `packages/prisma-shared-schema-platform/prisma/schema.prisma` — append:
```prisma
model tb_platform_super_admin {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id   String   @db.Uuid
  is_active Boolean? @default(true) @db.Boolean

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  @@unique([user_id, deleted_at], map: "platform_super_admin_user_deleted_at_u")
}
```
- `cd packages/prisma-shared-schema-platform && bun run db:generate`; from root `bun run build:package` + `bun run check-types`. Do NOT run db:migrate (defer). Commit.

### B2: Seed (bootstrap)
- Create `packages/prisma-shared-schema-platform/prisma/seed.platform-super-admin.ts` — mirror `seed.platform-permission.ts` structure. It reads a `user_id` from an env var `SUPER_ADMIN_USER_ID` (or a top-of-file constant the operator edits) and upserts a `tb_platform_super_admin` row (idempotent: findFirst by user_id+deleted_at:null). If no user_id provided, log and exit cleanly. Add `db:seed.platform-super-admin` to package.json scripts. (Operator runs it to anoint the first super-admin.) Commit.

### B3: micro-business — super-admin check + management handler
- Create `apps/micro-business/src/authen/platform_super_admin/` with:
  - `platform_super_admin.service.ts` (inject `@Inject('PRISMA_SYSTEM')`; ALWAYS filter `deleted_at: null` — no soft-delete middleware):
    - `isSuperAdmin(userId): Promise<boolean>` — findFirst `tb_platform_super_admin` where `{ user_id, is_active: true, deleted_at: null }`.
    - `list(): Promise<...>` — all active super-admin rows (return `{ id, user_id, created_at }`). (Optionally enrich with user email by joining `tb_user` — keep simple: return user_id; the frontend can resolve names.)
    - `add(userId): Result` — reject duplicate active (ALREADY_EXISTS); create row; return `{ id }`.
    - `remove(id): Result` — soft-delete (deleted_at=now); 404 if missing.
  - `platform_super_admin.controller.ts` — `@MessagePattern` cmds: `platform-super-admins.is-super-admin` (payload.user_id → boolean), `.list`, `.add` (payload.user_id), `.remove` (payload.id). Mirror `platform_role.controller.ts` (BaseMicroserviceController, runWithAuditContext on mutations, handleResult).
  - `platform_super_admin.module.ts` — `imports: [TenantModule]` (for PRISMA_SYSTEM!), provides+exports the service.
  - Register in `apps/micro-business/src/app.module.ts`.
  - Smoke test for the service (mock PRISMA_SYSTEM).
- check-types + tests. Commit.

### B4: Wire bypass into resolver + guard
- `apps/micro-business/src/authen/platform_permission/effective_permissions.service.ts`: inject `PlatformSuperAdminService` (import its module into `platform_permission.module.ts`); in `resolve(userId)`, set `is_super_admin = await superAdmin.isSuperAdmin(userId)` and include it in the returned object. Update the `EffectivePermissions` interface here to `{ platform: string[]; clusters: Record<string,string[]>; is_super_admin: boolean }`. (Update the existing unit tests to expect `is_super_admin: false` by default — provide a mock `PlatformSuperAdminService` returning false.)
- `apps/backend-gateway/src/auth/guards/platform-permission.guard.ts`: after unwrapping the effective response, if `eff?.is_super_admin` is true → `return true` (bypass) BEFORE the `permSvc.has()` check. (The guard already TCP-fetches effective perms; the response now includes is_super_admin.)
- check-types + tests. Commit.

### B5: Gateway — management endpoints (super-admin-gated) + is_super_admin passthrough
- The `/api/user/permission/platform` endpoint already returns `response.data` from the resolver — now includes `is_super_admin`. (Update `PlatformPermissionResponseDto` swagger shape to add `is_super_admin`.) No logic change needed there.
- Create `apps/backend-gateway/src/platform/platform-super-admins/` (mirror `platform-roles/` slice): controller `@Controller('api-system/platform/super-admins')` + service proxying to the `platform-super-admins.*` cmds + module (BUSINESS_SERVICE register).
  - `GET /` → list; `POST /` body `{ user_id }` → add; `DELETE /:id` → remove.
  - **Gating:** these endpoints must be callable ONLY by a super-admin. Create a `PlatformSuperAdminGuard` (in `auth/guards/`) that resolves the caller's effective perms (reuse the `platform-permissions.effective` cmd, like `PlatformPermissionGuard`) and allows only if `is_super_admin` true, else `ForbiddenException`. Apply `@UseGuards(KeycloakGuard, PlatformSuperAdminGuard)` to all three endpoints. (Bootstrap: the first super-admin is seeded, so they can then use these endpoints.)
  - Register the module in `route-application.ts`.
- check-types (gateway baseline 23). Commit.

---

## FRONTEND (`carmen-platform`)

### F1: Types + bypass + AuthContext.isSuperAdmin
- `src/types/index.ts`: `EffectivePermissions` → add `is_super_admin?: boolean`. Add `isSuperAdmin: boolean` to `AuthContextValue`.
- `src/utils/permissions.ts`: `checkPermission(eff, key, opts)` → at the top, `if (eff?.is_super_admin) return true;` (god-mode short-circuit). Add `is_super_admin: false` to `DEV_MOCK_EFFECTIVE_PERMISSIONS` (dev-mock grants via the explicit perms list, not the flag — keep flag false so dev still tests the normal path; OR set true — decision: keep `false` so dev exercises real permission logic, since dev-mock already grants all perms).
- `src/context/AuthContext.tsx`: derive `const isSuperAdmin = !!effectivePermissions?.is_super_admin;` and expose it in the context value. The login gate already passes for super-admins because `checkPermission` short-circuits — BUT the gate computes `hasAnyPermission` directly; update it to also pass when `eff?.is_super_admin` is true: `const hasAnyPermission = !!eff && (eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters).length > 0);`
- `src/services/permissionService.ts` `getMyPlatformPermissions`: pass through `is_super_admin` (`is_super_admin: body.is_super_admin ?? false`).
- Build. Commit.

### F2: Super-admin-only route guard
- `src/components/PrivateRoute.tsx`: add optional `requireSuperAdmin?: boolean` prop; when set and `!isSuperAdmin` → `<AccessDenied />`. (Keep allowedRoles + requiredPermission.)
- Build. Commit.

### F3: Super Admins management page + service + route + nav
- `src/services/superAdminService.ts`: `list()` GET `/api-system/platform/super-admins`; `add(user_id)` POST; `remove(id)` DELETE `/:id`. Unwrap `data.data || data`.
- `src/pages/SuperAdminManagement.tsx`: a simple management page (copy the lighter parts of RoleManagement / the config-page pattern). List current super-admins (user_id + created_at; resolve user display via `userService` if easy, else show user_id). An "Add Super Admin" control: a user picker (native `<select>` populated from `userService.getAll({perpage:200})`) + Add button → `superAdminService.add(user_id)`. Per-row Remove → `<ConfirmDialog>` → `superAdminService.remove(id)`. `toast` + `parseApiError` in catches. Dev debug Sheet. The whole page is super-admin-only (route guard below).
- `src/App.tsx`: route `/platform/super-admins` → `<PrivateRoute requireSuperAdmin><SuperAdminManagement/></PrivateRoute>` (lazy).
- `src/components/Layout.tsx`: nav item `{ path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true }`. Add `superAdminOnly?: boolean` to `NavItem` (Sidebar.tsx) and filter: `... && (!item.superAdminOnly || isSuperAdmin)`. (Destructure `isSuperAdmin` from `useAuth()` in Layout.)
- Build. Commit.

---

## Verify (offline) + DEFERRED
- Backend: `bun run check-types`, micro-business + gateway tests, gateway tsc baseline 23.
- Frontend: `CI=true bun run build`.
- **DEFERRED to operator (shared DEV DB):** `cd packages/prisma-shared-schema-platform && bun run db:migrate` (or diff+execute+resolve like the platform_rbac migration), then `SUPER_ADMIN_USER_ID=<uuid> bun run db:seed.platform-super-admin` to anoint the first super-admin. Then live-verify: that user logs in → `is_super_admin:true`, sees the "Super Admins" nav + can add/remove; a non-super-admin cannot reach `/platform/super-admins` (403/AccessDenied).

## Notes
- Bootstrap: first super-admin via seed (operator supplies user_id). Thereafter super-admins manage each other via the UI.
- Removing oneself as the last super-admin is allowed by the API (no guard) — operator caution; could add a "can't remove last" check later if desired.
