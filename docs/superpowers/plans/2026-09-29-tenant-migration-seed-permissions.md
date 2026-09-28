# Tenant Migration & Seed Platform Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate tenant migration apply/resolve and tenant seed (single + batch) on four new platform permissions instead of super-admin only, keeping super-admin and the CI deploy token working.

**Architecture:** Backend: `TenantMigrationGuard` keeps its flag + deploy-token path, then fails closed on an undecorated handler, runs `KeycloakGuard`, and delegates to `PlatformPermissionGuard` (which owns the super-admin bypass). Each handler declares `@RequirePlatformPermission`. Frontend: pages/cards split "read" actions (status check) from "apply" actions and gate each on `hasPermission`.

**Tech Stack:** NestJS gateway + Prisma seed data (`carmen-turborepo-backend-v2`), React 19 + Vite + Vitest (`carmen-platform`).

**Spec:** `docs/superpowers/specs/2026-09-29-tenant-migration-seed-permissions-design.md`

## Global Constraints

- Permission keys, exactly: `tenant_migration.read`, `tenant_migration.apply`, `tenant_seed.read`, `tenant_seed.apply`.
- Roles: Platform Admin `tenant_migration.*` + `tenant_seed.*`; Support Manager and Support Staff `tenant_migration.read` + `tenant_seed.read`; Security Officer none.
- Deploy-token path and `TENANT_MIGRATION_API_ENABLED` check are unchanged and run first.
- `deployActor`: `ci:deploy-token` | `super-admin:<user_id>` | `platform-user:<user_id>`.
- `PlatformMigrationGuard` and micro-business are **not** touched.
- **No new test files and no "write failing test first" steps** (user's standing preference). Existing tests that pin the old contract are updated so the suites stay green. Static checks (type-check, lint) always run.
- Backend work happens on branch **`feature/tenant-migration-seed-permissions` in `../carmen-turborepo-backend-v2`** — create it from an up-to-date `main`; never commit to `main`.
- Frontend work happens on branch `feature/tenant-migration-seed-permissions` in `carmen-platform` (already checked out).
- Backend: never run `bun run lint` (it rewrites the whole repo with `--fix`); use `bunx eslint <files>`. Run jest with `--runInBand --forceExit` (LokiTransport hangs jest otherwise).
- User-facing copy comes from i18n (`src/i18n/en.ts` + `th.ts`); interpolation is `{{name}}`.

## Review Focus

1. **Undecorated handler under `log-only` mode** — a handler that lost its `@RequirePlatformPermission` must 403 for humans, not pass everyone (`PlatformPermissionGuard.handleUndecoratedRoute` returns `true` in `log-only`). Owned by Task 2's explicit `Reflector` check; verified by reading the guard, the audit sanity check in Task 2 Step 7, and the curl probe in Task 6.
2. **Read-only user on the pages** — someone with `.read` but not `.apply` must be able to Check / Check all, and must *not* be able to Apply / Resolve / Seed / Deploy all / Seed all, including via an already-open confirm dialog. Owned by Tasks 4–5 (handler-level `if (!canApply) return` + existing revoked-mid-dialog tests re-pointed to `canApply`).
3. **BU editor without `.read`** — BU Edit must not render the card (today it renders and 403s on Check). Owned by Task 4; checked manually in Task 6.
4. **Module DI** — gateway must boot: both modules provide `PlatformPermissionGuard` + `PlatformPermissionService`. Owned by Task 2, verified by `audit:guard-providers` and `check-types`.
5. **Permission rows not yet seeded on an environment** — non-super-admins keep getting 403 until the seed runs; super-admin must be unaffected. Owned by Task 6 rollout order.

---

## File Map

**Backend (`../carmen-turborepo-backend-v2`)**
- Modify `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` — 4 catalog rows.
- Modify `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` — role mapping.
- Modify `apps/backend-gateway/src/auth/guards/tenant-migration.guard.ts` — new check order.
- Modify `apps/backend-gateway/src/auth/guards/tenant-migration.guard.spec.ts` — adapt to new constructor.
- Modify `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.ts` + `.module.ts`.
- Modify `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts` + `.module.ts`.
- Modify `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` — guard set + allowlist.

**Frontend (`carmen-platform`)**
- Modify `src/i18n/en.ts`, `src/i18n/th.ts` — `common.state.permissionRequired`, drop three `superAdminRequired`.
- Modify `src/components/TenantMigrationCard.tsx`, `src/components/TenantSeedCard.tsx` (+ their tests) — `canApply`, split reasons.
- Modify `src/pages/BusinessUnitEdit.tsx` — render cards on `.read`, pass `canApply`.
- Modify `src/pages/TenantMigrationManagement.tsx` (+ test), `src/pages/TenantSeedManagement.tsx`.
- Modify `src/App.tsx`, `src/components/nav/platformNav.ts` — route/nav keys.

---

### Task 1: Backend — permission catalog and role mapping

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` (header comment ~line 15, new rows after the `data_import` block ~line 153)
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts:11-80`

**Interfaces:**
- Produces: catalog keys `tenant_migration.read|apply`, `tenant_seed.read|apply` — Task 2's decorators and the coverage audit depend on these existing.

- [ ] **Step 1: Create the backend branch**

```bash
cd ../carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/tenant-migration-seed-permissions
```

- [ ] **Step 2: Add catalog rows** directly after the `data_import` / `manage` entry:

```ts
  {
    resource: 'tenant_migration',
    action: 'read',
    description: "View a business unit schema's tenant migration status (single BU or fleet)",
  },
  {
    resource: 'tenant_migration',
    action: 'apply',
    description:
      'Deploy pending tenant migrations (single BU or every active BU) and resolve a failed migration',
  },
  {
    resource: 'tenant_seed',
    action: 'read',
    description: "View a business unit's tenant seed status",
  },
  {
    resource: 'tenant_seed',
    action: 'apply',
    description: 'Seed baseline tenant data into a business unit (single row or batch)',
  },
```

Update the header comment `// 17 active resources × actions.` to the new resource count (count the distinct non-deleted `resource` values after the edit; it rises by 2 from whatever it truly is now — recount, don't just add 2 to a possibly stale 17).

- [ ] **Step 3: Add role mapping.** In `'Platform Admin'`, after `'data_import.*',` add:

```ts
    // apply ของ tenant migration/seed แตะ schema และข้อมูลของ BU จริง — ให้เฉพาะ Platform Admin
    // เหมือน sql_workbench/data_import; ก่อนหน้านี้ผูกกับ super-admin อย่างเดียว
    // Applying tenant migrations/seeds writes to a BU's real schema and data — Platform Admin
    // only, like sql_workbench/data_import. Previously this was super-admin only.
    'tenant_migration.*',
    'tenant_seed.*',
```

In `'Support Manager'` and `'Support Staff'`, append:

```ts
    // อ่านสถานะอย่างเดียวเพื่อตอบลูกค้าว่า BU ไหนค้าง migration / ยังไม่ได้ seed — ลงมือเองไม่ได้
    // Read-only status so support can answer "is this BU behind / seeded?" without acting.
    'tenant_migration.read',
    'tenant_seed.read',
```

Leave `'Security Officer'` unchanged.

- [ ] **Step 4: Static checks**

```bash
ls packages/prisma-shared-schema-platform/prisma/check.platform-*drift*.ts
```
Run each listed drift checker only if its header says it works without a DB (if it needs `DATABASE_URL`, skip and note it in the report). Then from the repo root:

```bash
bun run audit:api-system-permission
```
Expected: PASS (nothing references the new keys yet; the allowlist still covers the tenant routes).

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(platform-permission): เพิ่ม tenant_migration/tenant_seed read+apply และผูก role"
```

---

### Task 2: Backend — guard delegation, handler decorators, module providers, coverage audit

These land together: decorators without the guard change are inert, and the guard change without decorators would 403 every human (by design, fail closed). The audit is only honest once both exist.

**Files:**
- Modify: `apps/backend-gateway/src/auth/guards/tenant-migration.guard.ts` (whole file)
- Modify: `apps/backend-gateway/src/auth/guards/tenant-migration.guard.spec.ts`
- Modify: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.ts:25,134-139,158-163,184-192,282-304`
- Modify: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.module.ts`
- Modify: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts:24,69-74,90-102`
- Modify: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.module.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts:66,170-186,~564,~652,~672`

**Interfaces:**
- Consumes: Task 1 catalog keys; `PlatformPermissionGuard.canActivate(ctx): Promise<boolean>` (throws `ForbiddenException('Missing platform permission: <key>')` on deny, sets `request.platformPermissions`, returns `true` for `is_super_admin === true`); `PLATFORM_PERMISSION_KEY` from `src/auth/decorators/platform-permission.decorator`.
- Produces: HTTP contract — humans lacking a key get 403 `Missing platform permission: <key>`; status endpoints accept `.read` holders (FE Tasks 4–5 rely on this).

- [ ] **Step 1: Rewrite the guard** — `tenant-migration.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { KeycloakGuard } from './keycloak.guard';
import { PlatformPermissionGuard } from './platform-permission.guard';
import { PLATFORM_PERMISSION_KEY } from '../decorators/platform-permission.decorator';
import { envConfig } from 'src/libs/config.env';

/**
 * Authorizes tenant-migration and tenant-seed endpoints for a valid deploy token, or a user
 * holding the handler's @RequirePlatformPermission key (super-admin passes via PlatformPermissionGuard).
 * อนุญาต endpoint migration/seed ของผู้เช่าสำหรับ deploy token ที่ถูกต้อง หรือผู้ใช้ที่ถือสิทธิ์
 * ตาม @RequirePlatformPermission ของ handler (super-admin ผ่านได้ผ่าน PlatformPermissionGuard)
 */
@Injectable()
export class TenantMigrationGuard implements CanActivate {
  constructor(
    private readonly keycloakGuard: KeycloakGuard,
    private readonly platformPermissionGuard: PlatformPermissionGuard,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Constant-time comparison of two strings.
   * เปรียบเทียบสตริงแบบใช้เวลาเท่ากันเพื่อกัน timing attack
   * @param a - First string / สตริงแรก
   * @param b - Second string / สตริงที่สอง
   * @returns Whether the strings are equal / สตริงเท่ากันหรือไม่
   */
  private isTokenEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) {
      return false;
    }
    return timingSafeEqual(ab, bb);
  }

  /**
   * Allow when the feature flag is on and either a deploy token matches, or the caller holds the
   * handler's platform permission. A handler with no permission key is denied outright:
   * PlatformPermissionGuard lets undecorated routes through in `log-only` mode, and this guard
   * must never be looser than the super-admin-only guard it replaced.
   * อนุญาตเมื่อเปิด feature flag และมี deploy token ที่ตรง หรือผู้เรียกถือสิทธิ์ของ handler นั้น
   * handler ที่ไม่ประกาศ permission key ถูกปฏิเสธทันที เพราะ PlatformPermissionGuard ปล่อย route
   * ที่ไม่มี decorator ผ่านในโหมด `log-only` และ guard นี้ต้องไม่หลวมกว่า guard super-admin เดิม
   * @param context - NestJS execution context / บริบทการทำงานของ NestJS
   * @returns Whether the request is authorized / คำขอได้รับอนุญาตหรือไม่
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!envConfig.TENANT_MIGRATION_API_ENABLED) {
      throw new ForbiddenException('Tenant migration API is disabled');
    }
    const request = context.switchToHttp().getRequest();
    const presentedToken = request.headers?.['x-deploy-token'];
    const configuredToken = envConfig.TENANT_DEPLOY_TOKEN;
    if (presentedToken && configuredToken && this.isTokenEqual(presentedToken, configuredToken)) {
      request.deployActor = 'ci:deploy-token';
      return true;
    }
    const required = this.reflector.get<string>(PLATFORM_PERMISSION_KEY, context.getHandler());
    if (!required) {
      throw new ForbiddenException('Missing platform permission: route declares no permission key');
    }
    if (!(await this.keycloakGuard.canActivate(context))) {
      throw new ForbiddenException('Authentication required');
    }
    // Throws ForbiddenException(`Missing platform permission: ${required}`) on deny.
    await this.platformPermissionGuard.canActivate(context);
    if (!request.user?.user_id) {
      throw new ForbiddenException('Authentication required');
    }
    request.deployActor =
      request.platformPermissions?.is_super_admin === true
        ? `super-admin:${request.user.user_id}`
        : `platform-user:${request.user.user_id}`;
    return true;
  }
}
```

- [ ] **Step 2: Adapt the existing spec** `tenant-migration.guard.spec.ts` to the new constructor (update existing cases only — no new file):
  - `ctxWith` returns `{ switchToHttp: …, getHandler: () => handler, _req: req }` where `const handler = () => undefined;` is declared at module scope.
  - Replace `const superAdminGuard = …` with `const permissionGuard = { canActivate: jest.fn() };` and add `const reflector = { get: jest.fn() };`; `makeGuard = () => new TenantMigrationGuard(keycloakGuard as never, permissionGuard as never, reflector as never)`.
  - In `beforeEach`, after `jest.clearAllMocks()`: `reflector.get.mockReturnValue('tenant_migration.apply');`.
  - Rename every `superAdminGuard` reference to `permissionGuard`; the case "…Keycloak passes but the super-admin guard rejects" becomes "…but the permission guard rejects".
  - The case "allows a real super-admin and stamps deployActor" keeps its Keycloak mock; make `permissionGuard.canActivate.mockImplementation((c) => { c.switchToHttp().getRequest().platformPermissions = { platform: [], clusters: {}, is_super_admin: true }; return Promise.resolve(true); })`; expected actor stays `'super-admin:admin-1'`.

Run:
```bash
cd apps/backend-gateway && bunx jest src/auth/guards/tenant-migration.guard.spec.ts --runInBand --forceExit
```
Expected: all cases PASS.

- [ ] **Step 3: Decorate the migration controller.** Add import:

```ts
import { RequirePlatformPermission } from 'src/auth/decorators/platform-permission.decorator';
```
First run `grep -nE "@(Get|Post|Put|Patch|Delete)\(" src/platform/tenant-migrations/tenant-migrations.controller.ts`. Add directly under each verb decorator:
- `@Get(':bu_id/status')` → `@RequirePlatformPermission('tenant_migration.read')`
- `@Post(':bu_id/deploy')` → `@RequirePlatformPermission('tenant_migration.apply')`
- `@Post(':bu_id/deploy/stream')` → `@RequirePlatformPermission('tenant_migration.apply')`
- `@Post(':bu_id/resolve')` → `@RequirePlatformPermission('tenant_migration.apply')`

Any verb decorator beyond these gets `.read` (GET) or `.apply` (mutating). Replace every `@ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })` with `description: 'Disabled, missing token, or missing platform permission'`.

- [ ] **Step 4: Decorate the seed controller** the same way (same import, same grep):
- `@Get(':bu_id/status')` → `@RequirePlatformPermission('tenant_seed.read')`
- `@Post(':bu_id/deploy/stream')` → `@RequirePlatformPermission('tenant_seed.apply')`

Same 403 description change.

- [ ] **Step 5: Module providers.** `tenant-seeds.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TenantSeedsController } from './tenant-seeds.controller';
import { TenantSeedsService } from './tenant-seeds.service';
import { TenantMigrationGuard } from 'src/auth/guards/tenant-migration.guard';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { PlatformPermissionService } from 'src/auth/services/platform-permission.service';

/**
 * Registers the tenant-seeds controller, RPC proxy service, and auth guards.
 * ลงทะเบียน controller, บริการ proxy RPC และ guard ของ tenant-seeds
 */
@Module({
  controllers: [TenantSeedsController],
  providers: [
    TenantSeedsService,
    TenantMigrationGuard,
    PlatformPermissionGuard,
    PlatformPermissionService,
  ],
})
export class TenantSeedsModule {}
```
`tenant-migrations.module.ts`: the same shape with `TenantMigrationsController` / `TenantMigrationsService` and its existing doc comment. Both drop the `PlatformSuperAdminGuard` import.

- [ ] **Step 6: Coverage audit.** In `check.api-system-permission-coverage.ts`:
  - Replace `const PERMISSION_GUARD = 'PlatformPermissionGuard';` with:

```ts
// Guards that enforce @RequirePlatformPermission. TenantMigrationGuard delegates to
// PlatformPermissionGuard after its deploy-token path, so a decorator under it is enforced too.
// guard ที่บังคับใช้ @RequirePlatformPermission — TenantMigrationGuard ส่งต่อให้
// PlatformPermissionGuard หลังเส้นทาง deploy token จึงบังคับ decorator ได้จริงเช่นกัน
const PERMISSION_GUARDS = ['PlatformPermissionGuard', 'TenantMigrationGuard'] as const;
```
  - Where `has_permission_guard` is computed:

```ts
        const guard_text = `${class_guards} ${read_guard_text(method)}`;
        const has_permission_guard = PERMISSION_GUARDS.some((guard) => guard_text.includes(guard));
```
  - Replace remaining `${PERMISSION_GUARD}` in messages with `${PERMISSION_GUARDS.join('/')}`.
  - Delete the six allowlist rows keyed `'GET api-system/tenant/migrations/:bu_id/status'`, `'POST api-system/tenant/migrations/:bu_id/deploy'`, `'POST api-system/tenant/migrations/:bu_id/deploy/stream'`, `'POST api-system/tenant/migrations/:bu_id/resolve'`, `'GET api-system/tenant/seeds/:bu_id/status'`, `'POST api-system/tenant/seeds/:bu_id/deploy/stream'`.

- [ ] **Step 7: Run gates** (repo root)

```bash
bun run audit:api-system-permission   # Expected: PASS — no MISSING_DECORATOR / UNKNOWN_KEY / stale allowlist
bun run audit:guard-providers         # Expected: PASS
bun run check-types                   # Expected: PASS (use a --filter for backend-gateway if the root script supports it)
bunx eslint apps/backend-gateway/src/auth/guards/tenant-migration.guard.ts apps/backend-gateway/src/auth/guards/tenant-migration.guard.spec.ts apps/backend-gateway/src/platform/tenant-migrations apps/backend-gateway/src/platform/tenant-seeds
(cd apps/backend-gateway && bunx jest src/auth/guards src/platform/tenant-migrations src/platform/tenant-seeds --runInBand --forceExit)
```
Expected: all green. Then prove the audit is really checking: temporarily delete the `@RequirePlatformPermission('tenant_seed.read')` line, re-run `bun run audit:api-system-permission`, confirm it FAILS naming `GET api-system/tenant/seeds/:bu_id/status`, then restore the line and re-run to PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend-gateway/src/auth/guards/tenant-migration.guard.ts apps/backend-gateway/src/auth/guards/tenant-migration.guard.spec.ts apps/backend-gateway/src/platform/tenant-migrations apps/backend-gateway/src/platform/tenant-seeds packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git commit -m "feat(tenant-migration): กั้น migration/seed ด้วย platform permission แทน super-admin อย่างเดียว"
```

---

### Task 3: Backend — remaining audit gates, push, PR

- [ ] **Step 1:** From the repo root run `audit:app-api-catalog-drift`, `audit:rest-contract`, `audit:guard-providers`, `audit:api-system-permission`. Expected: PASS. Fix anything this branch caused; report (don't fix) anything already red on `main`.
- [ ] **Step 2:** `git push -u origin feature/tenant-migration-seed-permissions`, then `gh pr create --base main` with a body stating: the four keys + role mapping; guard behavior (deploy token unchanged, fail-closed on undecorated handler, super-admin via `PlatformPermissionGuard`); **DEV needs the platform-permission + platform-role-permission seed after deploy**; the FE PR must merge after this one.

---

### Task 4: Frontend — i18n, cards, BU Edit

**Files:**
- Modify: `src/i18n/en.ts:586-589`, `src/i18n/th.ts:~442`
- Modify: `src/components/TenantMigrationCard.tsx:15-53,106-120,133-139,190-225,304`
- Modify: `src/components/TenantSeedCard.tsx:15-46,125-151,195,245`
- Modify: `src/components/TenantMigrationCard.test.tsx:28`, `src/components/TenantSeedCard.test.tsx` (`baseProps`, case at ~line 87)
- Modify: `src/pages/BusinessUnitEdit.tsx:51,761-777`

**Interfaces:**
- Produces: i18n key `common.state.permissionRequired` with param `permission` (Task 5 uses it); card prop `canApply: boolean` replacing `isSuperAdmin`.

- [ ] **Step 1: i18n.** In `en.ts` `common.state`, replace the `superAdminRequired` entry and its 3-line comment with:

```ts
      // Shared disabled reason for actions gated on a platform permission key
      // (TenantMigrationCard/TenantSeedCard and the two tenant management pages).
      permissionRequired: 'Requires the {{permission}} permission.',
```
In `th.ts` `common.state`, replace `superAdminRequired` with `permissionRequired: 'ต้องมีสิทธิ์ {{permission}}',`. Leave `pages.tenantMigration.superAdminRequired` / `pages.tenantSeed.superAdminRequired` for Task 5 (the pages still use them).

- [ ] **Step 2: TenantMigrationCard.** Prop `isSuperAdmin: boolean` → `canApply: boolean` (interface + destructure). Replace the `disabledReason` / `busy` / `actionsDisabled` block with:

```ts
  // Checking status is a read; applying/resolving writes to the BU schema. They need different
  // permissions, so each carries its own reason — a read-only user can still check.
  const checkReason = !hasDbConnection ? t('common.state.configureDbPoolFirst') : null;
  const applyReason = !canApply
    ? t('common.state.permissionRequired', { permission: 'tenant_migration.apply' })
    : checkReason;
  const busy = loadingStatus || deploying;
  const checkDisabled = checkReason !== null || busy;
  const applyDisabled = applyReason !== null || busy;
```
Change `withTooltip` to take the reason (keep its existing comments and the `eslint-disable-next-line` line exactly):

```tsx
  const withTooltip = (el: ReactElement, reason: string | null): ReactElement =>
    reason ? (
      <Tooltip content={reason}>
        {/* Focusable wrapper so the disabled button's tooltip is reachable by keyboard,
            not just hover (a disabled <button> is removed from the tab order). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>{el}</span>
      </Tooltip>
    ) : (
      el
    );
```
Call sites: Check-status button → `disabled={checkDisabled}`, `withTooltip(…, checkReason)`; Apply button → `disabled={applyDisabled}`, `withTooltip(…, applyReason)`; Resolve button → same as Apply; `<TenantMigrationResolveDialog … disabledReason={applyReason}>`. Afterwards `grep -n "actionsDisabled\|disabledReason\|isSuperAdmin" src/components/TenantMigrationCard.tsx` shows only the `disabledReason={applyReason}` prop.

- [ ] **Step 3: TenantSeedCard.** Same prop rename, same reason block (with `seeding` instead of `deploying`, permission `'tenant_seed.apply'`), same `withTooltip(el, reason)`. Call sites: Check-status button → `checkDisabled` / `checkReason`; per-set checkbox → `disabled={applyDisabled || complete}`; Seed button → `disabled={applyDisabled || selectedMissing === 0}` with `applyReason`. Afterwards grep for `actionsDisabled|disabledReason|isSuperAdmin` returns nothing.

- [ ] **Step 4: BusinessUnitEdit.** Replace the two card elements in `advancedExtraSlot` with:

```tsx
                {hasPermission('tenant_migration.read') && (
                  <TenantMigrationCard
                    key={id}
                    buId={id!}
                    buCode={formData.code}
                    buName={formData.name}
                    hasDbConnection={!!(formData.database_pool_id && formData.db_schema)}
                    canApply={hasPermission('tenant_migration.apply')}
                  />
                )}
                {hasPermission('tenant_seed.read') && (
                  <TenantSeedCard
                    key={`seed-${id}`}
                    buId={id!}
                    buCode={formData.code}
                    buName={formData.name}
                    hasDbConnection={!!(formData.database_pool_id && formData.db_schema)}
                    canApply={hasPermission('tenant_seed.apply')}
                  />
                )}
```
If `isSuperAdmin` is no longer used in the file, drop it from the `useAuth()` destructure (lint will say).

- [ ] **Step 5: Adapt existing card tests.** `TenantMigrationCard.test.tsx`: `isSuperAdmin` → `canApply`. `TenantSeedCard.test.tsx`: `baseProps` `isSuperAdmin: true` → `canApply: true`; rewrite the case `'disables actions and shows a reason when not super-admin'` for the new contract:

```tsx
  it('keeps Check status enabled but disables seeding without tenant_seed.apply', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [
        { key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] },
      ],
    });
    render(<TenantSeedCard {...baseProps} canApply={false} />);
    const check = screen.getByRole('button', { name: /check status/i });
    expect(check).toBeEnabled();
    await userEvent.click(check);
    await waitFor(() => expect(svc.getStatus).toHaveBeenCalledWith('bu-1'));
    for (const box of await screen.findAllByRole('checkbox')) expect(box).toBeDisabled();
  });
```
Confirm `waitFor` / `userEvent` are already imported in that file (they are used by neighbouring cases). If the set rows expose no `checkbox` role, assert the Seed button is disabled instead, using the same name pattern the neighbouring passing case clicks.

- [ ] **Step 6: Gates**

```bash
bun run typecheck && bun run lint && bunx vitest run src/components/TenantMigrationCard.test.tsx src/components/TenantSeedCard.test.tsx src/pages/BusinessUnitEdit.test.tsx
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts src/components/TenantMigrationCard.tsx src/components/TenantSeedCard.tsx src/components/TenantMigrationCard.test.tsx src/components/TenantSeedCard.test.tsx src/pages/BusinessUnitEdit.tsx
git commit -m "feat(tenant-migration): การ์ดใน BU Edit กั้นด้วย tenant_*.read/apply แทน super-admin"
```

---

### Task 5: Frontend — management pages, routes, nav

**Files:**
- Modify: `src/pages/TenantMigrationManagement.tsx:133,168,252-298,301-358,395-400,545-583,603-620,725`
- Modify: `src/pages/TenantMigrationManagement.test.tsx:31,182-190,193-290`
- Modify: `src/pages/TenantSeedManagement.tsx:97,132,165-190,234-286,313-320,448-471,514-520`
- Modify: `src/App.tsx:270,278`, `src/components/nav/platformNav.ts:14-15,~63`
- Modify: `src/i18n/en.ts:~3424,~3482`, `src/i18n/th.ts:~2396,~2453`

**Interfaces:**
- Consumes: `common.state.permissionRequired` (Task 4); `useAuth().hasPermission(key: string): boolean`.

- [ ] **Step 1: TenantMigrationManagement.**

```ts
  const { hasPermission } = useAuth();
  // Status checks are reads (the route already requires tenant_migration.read); only
  // apply / deploy-all / resolve write to the BU schema.
  const canApply = hasPermission('tenant_migration.apply');
```
and replace the `disabledReason` line with:

```ts
  const applyReason = !canApply
    ? t('common.state.permissionRequired', { permission: 'tenant_migration.apply' })
    : null;
```
Rename `disabledReason` → `applyReason` everywhere, then un-gate the reads:
- per-row Check `iconAction`: `disabled: busy || batchRunning`, `reason: null`.
- Apply / Resolve `iconAction`: `disabled: !!applyReason || busy || batchRunning`, `reason: applyReason`.
- Check all button: `disabled={anyBusy || bus.length === 0}`, `withTooltip(…, null)`.
- Deploy all: `disabled={!!applyReason || anyBusy || bus.length === 0 || nothingToDeploy}`; `deployAllReason = applyReason ?? (…unchanged…)`.
- `<TenantMigrationResolveDialog disabledReason={applyReason} …>`.
- `applyOne` / `deployAll`: `if (!canApply) return;`; replace `isSuperAdmin` with `canApply` in their `useCallback` deps and their "Defence-in-depth" comments.
- columns `useMemo` deps: `disabledReason` → `applyReason`.

Afterwards `grep -n "isSuperAdmin\|disabledReason" src/pages/TenantMigrationManagement.tsx` shows only the `disabledReason={applyReason}` prop.

- [ ] **Step 2: Adapt the page test.** Add below the imports in `TenantMigrationManagement.test.tsx`:

```ts
// hasPermission stand-in: read is always granted (the route requires it); apply is the variable.
const authAs = (canApply: boolean) =>
  ({
    hasPermission: (key: string) =>
      key === 'tenant_migration.read' || (canApply && key === 'tenant_migration.apply'),
  }) as never;
```
Replace every `mockReturnValue({ isSuperAdmin: true } as never)` with `mockReturnValue(authAs(true))` and every `{ isSuperAdmin: false } as never` with `authAs(false)`. Rewrite `'disables all action buttons for a non-super-admin'` as:

```ts
  it('keeps Check enabled but disables Deploy all without tenant_migration.apply', async () => {
    vi.mocked(useAuth).mockReturnValue(authAs(false));
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /check all/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /deploy all/i })).toBeDisabled();
    for (const btn of screen.getAllByRole('button', { name: /^check$/i })) {
      expect(btn).toBeEnabled();
    }
  });
```
Rename the `describe('handler-level super-admin guard (defence-in-depth)')` block and its `it` titles/comments from "isSuperAdmin is revoked" to "tenant_migration.apply is revoked"; the bodies change only by the mock swap.

- [ ] **Step 3: TenantSeedManagement.** Same pattern with `'tenant_seed.apply'`:
- `const { hasPermission } = useAuth(); const canApply = hasPermission('tenant_seed.apply');` and `applyReason` as above.
- `checkOne` / `checkAll`: **remove** `if (!isSuperAdmin) return;` and drop `isSuperAdmin` from their deps (reads are allowed for anyone on the page).
- `seedOne` / `seedAll`: `if (!canApply) return;`, deps `canApply`.
- per-row Check: `disabled: busy || batchRunning || checkingAll`, `reason: null`; per-row Seed: `disabled: !!applyReason || busy || batchRunning || checkingAll`, `reason: applyReason`.
- Check all: `disabled={anyBusy || checkableBus.length === 0}`, `withTooltip(…, null)`.
- `seedAllReason = applyReason ?? (…unchanged…)`.
- For any other remaining `disabledReason` use, decide by whether it gates a read (→ `null`) or a write (→ `applyReason`).

Afterwards grep for `isSuperAdmin|disabledReason` in the file returns nothing (or only a prop fed `applyReason`).

- [ ] **Step 4: Routes + nav.** `App.tsx`: `/tenant-migrations` → `requiredPermission="tenant_migration.read"`, `/tenant-seeds` → `requiredPermission="tenant_seed.read"`. `platformNav.ts:14-15`: same two `permission:` values. Read the comment near line 63 and remove Tenant Migrations from its list of `cluster.read` items, rephrasing so it stays true.

- [ ] **Step 5: i18n cleanup.** Delete `superAdminRequired` from `pages.tenantMigration` and `pages.tenantSeed` in `en.ts` and `th.ts`. `grep -rn "superAdminRequired" src` → nothing tenant-related remains.

- [ ] **Step 6: Gates**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: all green, test count unchanged from `main` (no new files).

- [ ] **Step 7: Commit**

```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/TenantMigrationManagement.test.tsx src/pages/TenantSeedManagement.tsx src/App.tsx src/components/nav/platformNav.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(tenant-migration): หน้า migration/seed แยกสิทธิ์ read กับ apply แทน super-admin"
```

---

### Task 6: Rollout and manual verification (user-driven — ask before each outward step)

- [ ] **Step 1:** Merge the BE PR → gateway auto-deploys to DEV (confirm with `gh run list --branch main -R CarmenSoftware-organization/carmen-turborepo-backend-v2` and match `headSha`).
- [ ] **Step 2:** Seed on DEV: platform-permission, then platform-role-permission (`db:seed.platform-permission`, `db:seed.platform-role-permission` against the DEV platform DB, or the Platform Seed console if it lists these ops). **Ask the user before running anything against DEV.**
- [ ] **Step 3:** Probe the deployed guard (not `/version`): Support Staff token → `GET /api-system/tenant/migrations/<bu_id>/status` 200, `POST /api-system/tenant/migrations/<bu_id>/deploy` 403 `Missing platform permission: tenant_migration.apply`. Deploy token → status 200.
- [ ] **Step 4:** Push the FE branch, open the PR, merge after the BE is live → FE auto-deploys to DEV.
- [ ] **Step 5:** Browser on DEV: (a) Platform Admin non-super-admin — both menus, check + apply work; (b) Support Staff — menus visible, check works, apply buttons disabled with "Requires the tenant_migration.apply permission."; (c) Security Officer — menus hidden, direct URL → 403 page; (d) super-admin unchanged; (e) BU Edit technical tab shows/hides the cards by the same rules. A test user may need a role binding first.
- [ ] **Step 6:** Production (`git push origin main:vercel`) only after the BE is on the production backend **and** the seed has run there.
