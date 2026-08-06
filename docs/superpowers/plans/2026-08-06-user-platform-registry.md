# User Platform Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/platform/user-platform` from a full user directory into a registry of platform-privilege holders, backed by one server-side query instead of ~78 client requests.

**Architecture:** A new `GET /api-system/platform/users` returns one row per privilege holder with their assignments nested, so the page needs a single request. A new atomic bulk-assign route lets one dialog grant several roles at once. The write path starts recording who granted access — a column that exists but has never been written. The frontend page is rebuilt around that endpoint; the per-user edit page is left alone.

**Tech Stack:** NestJS + Prisma (`PrismaClient_SYSTEM`) across a gateway and a `micro-business` TCP service; React 19 + TypeScript + Vite, shadcn/ui, TanStack Table v8, Vitest.

## Global Constraints

- **Three repos.** Backend is `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` (tasks 1–5); frontend is `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` (tasks 6–11); the Playwright E2E suite is the standalone sibling `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e` (task 12).
- **Backend ships and deploys to DEV first.** The frontend branch must not merge until `GET /api-system/platform/users` answers on DEV, or the page 404s.
- **Branch name in all three repos:** `feature/user-platform-registry`. Never commit to `main` — the E2E repo in particular sits on `main` by default, and a subagent that is not told the branch name will commit straight to it.
- **Write tests, TDD.** The user ruled on 2026-08-06 that this plan gets tests on both sides, explicitly overriding their standing "skip tests during plan execution" default. So: write the failing test first, watch it fail, implement, watch it pass, commit. New `*.spec.ts` (backend) and `*.test.ts(x)` (frontend) files are expected where no suite covers the new code. Existing suites must also stay green. Static checks (`typecheck`, `lint`, `build`) are not tests — run them too.
  - **Frontend test conventions:** co-locate beside source; explicit `import { describe, it, expect, vi } from 'vitest'` (no globals); assert behavior and roles, never snapshots. Pure functions → unit test. Components → React Testing Library. Pages → `vi.mock` the shell (`Layout`, `Can`) and services, keep routing real via `MemoryRouter`. Do not touch `tsconfig.json` or `vite.config.ts` for test setup.
  - **Backend test conventions:** co-locate `*.spec.ts` beside source, matching the existing `user_platform_role.service.spec.ts` style (mocked `PRISMA_SYSTEM`, no live DB).
- **Backend jest must run in the foreground, scoped to whole spec files.** `bunx jest <file> -t "<name>"` hangs for 10+ minutes in this repo (it filters after transforming). Never use `-t`.
- **Naming:** SQL and JSON are `snake_case`; Kotlin/TS code is `camelCase`. Multi-word `@QueryValue`-equivalent query params are read as `snake_case` strings.
- **All timestamps are UTC** (`TIMESTAMPTZ` → `Instant`/`Date` → ISO 8601 with `Z`). Never format for display on the server.
- **Frontend rules that apply throughout:** never `alert()` / `window.confirm()` (use `toast.*` and `<ConfirmDialog>`); never modify `src/components/ui/` primitives; never add a `#` row-index column (`DataTable` adds one); wrap column defs in `useMemo`; wrap debug-only code in `process.env.NODE_ENV === 'development'`; every catch uses `parseApiError(err)` + `toast.error()`.
- **Permission for the new read route is `user_platform.read`**, not `user.read`. `support_staff` holds `user.read` without `user_platform.read`, so copying the neighbouring route's check would expose the registry to a role deliberately excluded from the page.

---

## File Structure

**Backend — `carmen-turborepo-backend-v2`**

| Path | Responsibility |
|---|---|
| `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts` | Modify — add `listPlatformUsers`, `assignBulk`; record actor on `assign`/`remove` |
| `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.ts` | Modify — new message patterns; fix audit-context actor |
| `apps/micro-business/src/authen/user_platform_role/*.spec.ts` | Modify — keep green |
| `apps/backend-gateway/src/common/dto/user-platform-role/user-platform-role.assign-bulk.dto.ts` | Create — Zod schema + DTO for bulk assign |
| `apps/backend-gateway/src/common/dto/user-platform-role/index.ts` | Modify — export the new DTO |
| `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.controller.ts` | Modify — `GET /` and `POST :user_id/roles/bulk`; forward actor |
| `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.service.ts` | Modify — proxy the two new commands; pass `actor_user_id` |
| `apps/backend-gateway/src/platform/user-platform-roles/swagger/response.ts` | Modify — response DTO for the registry list |

**Frontend — `carmen-platform`**

| Path | Responsibility |
|---|---|
| `src/types/index.ts` | Modify — `PlatformUserRow`, `PlatformUserRoleAssignment` |
| `src/services/userPlatformService.ts` | Create — `getAll`, `assignBulk` |
| `src/pages/userPlatformManagement/PlatformAccessSummary.tsx` | Rewrite — registry-shaped counts |
| `src/pages/userPlatformManagement/GrantAccessDialog.tsx` | Create — user + roles + scope in one dialog |
| `src/pages/userPlatformManagement/roleChips.tsx` | Create — scope grouping + the scope rail |
| `src/pages/UserPlatformManagement.tsx` | Rewrite — orchestration, filters, table |
| `src/pages/UserPlatformEdit.tsx` | Modify — one sentence of confirm copy |
| the three existing `*.test.tsx` beside them | Modify — keep green |

---

# BACKEND — `carmen-turborepo-backend-v2`

### Task 1: Record who granted the access

Three defects in one write path: `created_by_id` is never written, the gateway never sends the acting user's id, and the audit context is built from the **grantee's** id.

**Files:**
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts`
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.ts`
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.spec.ts`
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.spec.ts`

**Interfaces:**
- Produces: `assign(userId: string, input: AssignInput, actorUserId?: string)` and `remove(userId: string, assignmentId: string, actorUserId?: string)` — Task 3 and Task 4 both rely on this trailing optional `actorUserId` parameter.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Start the branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/user-platform-registry
```

- [ ] **Step 2: Thread `actorUserId` through the service write methods**

In `user_platform_role.service.ts`, change the `assign` signature and the `create` data:

```ts
  async assign(
    userId: string,
    input: AssignInput,
    actorUserId?: string,
  ): Promise<Result<unknown>> {
```

and inside it, replace the `create` call with:

```ts
    const created = await this.prismaSystem.tb_user_tb_platform_role.create({
      data: {
        user_id: userId,
        platform_role_id: input.role_id,
        cluster_id: clusterId,
        created_at: new Date(),
        created_by_id: actorUserId ?? null,
      },
    });
```

Then change `remove` the same way:

```ts
  async remove(
    userId: string,
    assignmentId: string,
    actorUserId?: string,
  ): Promise<Result<unknown>> {
```

and its update call:

```ts
    await this.prismaSystem.tb_user_tb_platform_role.update({
      where: { id: assignmentId },
      data: {
        deleted_at: new Date().toISOString(),
        deleted_by_id: actorUserId ?? null,
      },
    });
```

`actorUserId` stays optional so an older gateway that does not send it degrades to today's behavior (a NULL column) rather than throwing.

- [ ] **Step 3: Fix the audit context and pass the actor from the controller**

In `user_platform_role.controller.ts`, `createAuditContext` currently sets
`user_id: payload.user_id` — on these routes that is the **grantee**. Replace the method:

```ts
  /**
   * Create audit context from payload
   * สร้างบริบทการตรวจสอบจาก payload
   *
   * `payload.user_id` on these routes is the GRANTEE — the person receiving or losing a
   * role — not the person performing the action. The acting admin arrives as
   * `payload.actor_user_id`, forwarded by the gateway from `request.user.user_id`.
   * Attributing an audit event to the grantee would record every privilege grant as
   * self-granted.
   */
  private createAuditContext(payload: MicroservicePayload): AuditContext {
    return {
      tenant_id: payload.tenant_id || payload.bu_code,
      user_id: payload.actor_user_id ?? payload.user_id,
      request_id: payload.request_id,
      ip_address: payload.ip_address,
      user_agent: payload.user_agent,
    };
  }
```

If `MicroservicePayload` does not already carry `actor_user_id`, add it as an optional
field wherever that interface is declared (find it with
`grep -rn "interface MicroservicePayload" apps/micro-business/src`):

```ts
  /** Id of the user performing the action, distinct from `user_id` (the subject). */
  actor_user_id?: string;
```

Then pass it through in both handlers:

```ts
      this.userPlatformRoleService.assign(
        payload.user_id,
        payload.data,
        payload.actor_user_id,
      ),
```

```ts
      this.userPlatformRoleService.remove(
        payload.user_id,
        payload.assignment_id,
        payload.actor_user_id,
      ),
```

Match the existing `remove` handler's parameter names — read the current handler before
editing so the second argument keeps whatever the payload field is actually called.

- [ ] **Step 4: Update the existing specs so they stay green**

Read both spec files first. Wherever a spec asserts the `create`/`update` argument shape,
add the new fields to the expectation — for example:

```ts
    expect(prismaSystem.tb_user_tb_platform_role.create).toHaveBeenCalledWith({
      data: {
        user_id: USER_ID,
        platform_role_id: ROLE_ID,
        cluster_id: null,
        created_at: expect.any(Date),
        created_by_id: null,
      },
    });
```

Then **add** cases covering the new behavior this task introduces: `assign` writes
`created_by_id` from `actorUserId`, `remove` writes `deleted_by_id`, and
`createAuditContext` prefers `actor_user_id` over `user_id` (the regression that made every
grant look self-granted). Follow the existing file's style — mocked `PRISMA_SYSTEM`, no
live DB.

- [ ] **Step 5: Verify**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx jest apps/micro-business/src/authen/user_platform_role/user_platform_role.service.spec.ts apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.spec.ts
```

Run it in the foreground and wait. Expected: both suites pass. Do **not** add `-t`.

- [ ] **Step 6: Commit**

```bash
git add apps/micro-business/src/authen/user_platform_role/
git commit -m "fix(user-platform-role): บันทึกผู้กระทำแทนผู้รับสิทธิ์

created_by_id ไม่เคยถูกเขียน และ AuditContext ใช้ payload.user_id ซึ่งเป็น
ผู้รับสิทธิ์ ทำให้ทุก grant ถูกบันทึกว่าผู้รับเป็นคนให้ตัวเอง

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Registry query in micro-business

**Files:**
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts`
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent methods on the same class).
- Produces: message pattern `{ cmd: 'user-platform-roles.list-users', service: 'user-platform-roles' }` accepting `{ page, perpage, search, sort, advance }` and returning a `handlePaginatedResult` envelope — Task 4 calls this.
- Produces: `Result.ok({ paginate: { total, page, perpage, pages }, data: PlatformUserRow[] })` where each row is
  `{ user_id, username, email, firstname, lastname, is_active, roles: RoleRow[], last_granted_at }`
  and `RoleRow` is `{ id, role_id, role_name, scope, created_at, created_by_id }`.
  The gateway's enricher rewrites `created_at`/`created_by_id` into `audit.created`.

- [ ] **Step 1: Add the sort and filter parsers**

At the top of `user_platform_role.service.ts`, beside the existing `AssignInput`
interface, add:

```ts
interface ListUsersInput {
  page?: number;
  perpage?: number;
  search?: string;
  sort?: string;
  advance?: string;
}

type SortKey = 'username' | 'email' | 'last_granted_at';
const SORT_KEYS: readonly SortKey[] = ['username', 'email', 'last_granted_at'];
```

Then add these two private methods to the class:

```ts
  /**
   * Parse a "field:direction" sort string, falling back to newest-grant-first
   * แปลงสตริง sort เป็นคีย์และทิศทาง โดยค่าเริ่มต้นคือสิทธิ์ที่เพิ่งให้ล่าสุดก่อน
   * @param sort - Sort string such as "username:asc" / สตริง sort
   * @returns Sort key and direction / คีย์และทิศทางการเรียง
   */
  private parseSort(sort?: string): { key: SortKey; desc: boolean } {
    const [rawKey, rawDir] = (sort ?? '').split(':');
    const key = SORT_KEYS.includes(rawKey as SortKey)
      ? (rawKey as SortKey)
      : 'last_granted_at';
    const desc = rawDir
      ? rawDir.toLowerCase() === 'desc'
      : key === 'last_granted_at';
    return { key, desc };
  }

  /**
   * Extract the `where` object from the `advance` JSON string, tolerating malformed input
   * ดึงอ็อบเจกต์ where จากสตริง JSON ของ advance โดยทนต่อข้อมูลที่ผิดรูปแบบ
   * @param advance - JSON string shaped `{"where":{...}}` / สตริง JSON
   * @returns The where object, or empty when absent or unparseable / อ็อบเจกต์ where
   */
  private parseAdvanceWhere(advance?: string): Record<string, unknown> {
    if (!advance) return {};
    try {
      const parsed = JSON.parse(advance) as { where?: Record<string, unknown> };
      return parsed?.where && typeof parsed.where === 'object' ? parsed.where : {};
    } catch {
      return {};
    }
  }
```

A malformed `advance` returns no filter rather than throwing — a bad query string should
narrow nothing, not 500 the page.

- [ ] **Step 2: Add `listPlatformUsers`**

Add this method to the same class:

```ts
  /**
   * List users holding at least one live platform role, with their assignments nested
   * แสดงรายการผู้ใช้ที่ถือบทบาทแพลตฟอร์มอย่างน้อยหนึ่งรายการ พร้อมการกำหนดบทบาทที่ซ้อนอยู่
   * @param input - Pagination, search, sort and advance filter / พารามิเตอร์การแบ่งหน้าและตัวกรอง
   * @returns Paginated privilege holders / ผู้ถือสิทธิ์แบบแบ่งหน้า
   */
  @TryCatch
  async listPlatformUsers(input: ListUsersInput): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'listPlatformUsers', input },
      UserPlatformRoleService.name,
    );

    const page = Math.max(1, Number(input.page) || 1);
    const perpage = Math.min(100, Math.max(1, Number(input.perpage) || 10));
    const where = this.parseAdvanceWhere(input.advance);

    // 1. Every user holding a live assignment that matches the assignment-level filter,
    //    plus the newest grant time per user — one grouped query, no N+1.
    const assignmentWhere: Record<string, unknown> = { deleted_at: null };
    if (where.platform_role_id !== undefined) {
      assignmentWhere.platform_role_id = where.platform_role_id;
    }
    if ('cluster_id' in where) {
      // `null` is meaningful here: it selects platform-wide assignments.
      assignmentWhere.cluster_id = where.cluster_id;
    }

    const grouped = await this.prismaSystem.tb_user_tb_platform_role.groupBy({
      by: ['user_id'],
      where: assignmentWhere,
      _max: { created_at: true },
    });

    if (grouped.length === 0) {
      return Result.ok({ paginate: { total: 0, page, perpage, pages: 0 }, data: [] });
    }

    const lastGrantedAt = new Map<string, Date | null>(
      grouped.map((g) => [g.user_id, g._max.created_at ?? null]),
    );

    // 2. Apply the user-level filters. Selected without pagination so sorting by
    //    last_granted_at — a value that lives on the assignments, not on tb_user —
    //    can be applied across the whole result rather than within one page.
    //    Bounded by the number of privilege holders, which is small by construction.
    const userWhere: Record<string, unknown> = {
      id: { in: [...lastGrantedAt.keys()] },
      deleted_at: null,
    };
    if (typeof where.is_active === 'boolean') userWhere.is_active = where.is_active;

    const search = input.search?.trim();
    if (search) {
      userWhere.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const matched = await this.prismaSystem.tb_user.findMany({
      where: userWhere,
      select: { id: true, username: true, email: true, is_active: true },
    });

    // 3. Sort, then slice.
    const { key, desc } = this.parseSort(input.sort);
    const sorted = [...matched].sort((a, b) => {
      let cmp: number;
      if (key === 'last_granted_at') {
        const av = lastGrantedAt.get(a.id)?.getTime() ?? 0;
        const bv = lastGrantedAt.get(b.id)?.getTime() ?? 0;
        cmp = av - bv;
      } else {
        cmp = (a[key] ?? '').localeCompare(b[key] ?? '');
      }
      // Stable tie-break so pagination never drops or repeats a row.
      return (desc ? -cmp : cmp) || a.id.localeCompare(b.id);
    });

    const total = sorted.length;
    const pageUsers = sorted.slice((page - 1) * perpage, page * perpage);
    const pageIds = pageUsers.map((u) => u.id);

    if (pageIds.length === 0) {
      return Result.ok({
        paginate: { total, page, perpage, pages: Math.ceil(total / perpage) },
        data: [],
      });
    }

    // 4. Everything the page needs: every live assignment for these users (deliberately
    //    NOT narrowed by the role filter — hiding a user's other privileges on an audit
    //    page would understate what they can do), plus names for roles, clusters, people.
    const assignments = await this.prismaSystem.tb_user_tb_platform_role.findMany({
      where: { user_id: { in: pageIds }, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        platform_role_id: true,
        cluster_id: true,
        created_at: true,
        created_by_id: true,
        tb_platform_role: { select: { name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    const clusterIds = [
      ...new Set(
        assignments
          .map((a) => a.cluster_id)
          .filter((c): c is string => typeof c === 'string' && c.length > 0),
      ),
    ];
    const clusters = clusterIds.length
      ? await this.prismaSystem.tb_cluster.findMany({
          where: { id: { in: clusterIds } },
          select: { id: true, name: true },
        })
      : [];
    const clusterName = new Map(clusters.map((c) => [c.id, c.name]));

    const profiles = await this.prismaSystem.tb_user_profile.findMany({
      where: { user_id: { in: pageIds }, deleted_at: null },
      select: { user_id: true, firstname: true, lastname: true },
    });
    const profileOf = new Map(profiles.map((p) => [p.user_id as string, p]));

    const byUser = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = byUser.get(a.user_id) ?? [];
      list.push(a);
      byUser.set(a.user_id, list);
    }

    const data = pageUsers.map((u) => {
      const profile = profileOf.get(u.id);
      return {
        user_id: u.id,
        username: u.username,
        email: u.email,
        firstname: profile?.firstname ?? '',
        lastname: profile?.lastname ?? '',
        is_active: u.is_active ?? false,
        roles: (byUser.get(u.id) ?? []).map((a) => ({
          id: a.id,
          role_id: a.platform_role_id,
          role_name: a.tb_platform_role?.name ?? null,
          scope: a.cluster_id
            ? {
                type: 'cluster' as const,
                cluster_id: a.cluster_id,
                cluster_name: clusterName.get(a.cluster_id) ?? null,
              }
            : { type: 'platform' as const },
          // Raw audit columns — the gateway's @EnrichAuditUsers({ paths: ['data.roles'] })
          // deletes these and replaces them with `audit.created`.
          created_at: a.created_at,
          created_by_id: a.created_by_id,
        })),
        last_granted_at: lastGrantedAt.get(u.id) ?? null,
      };
    });

    return Result.ok({
      paginate: { total, page, perpage, pages: Math.ceil(total / perpage) },
      data,
    });
  }
```

- [ ] **Step 3: Add the message pattern**

In `user_platform_role.controller.ts`, add this handler beside the existing ones. It uses
`handlePaginatedResult`, **not** `handleResult` — `handleResult` would nest the whole
`{ paginate, data }` object under `data` and the gateway would forward an empty page:

```ts
  /**
   * List users holding at least one platform role
   * แสดงรายการผู้ใช้ที่ถือบทบาทแพลตฟอร์มอย่างน้อยหนึ่งรายการ
   * @param payload - Pagination, search, sort and advance filter / พารามิเตอร์การแบ่งหน้าและตัวกรอง
   * @returns Paginated privilege holders / ผู้ถือสิทธิ์แบบแบ่งหน้า
   */
  @MessagePattern({ cmd: 'user-platform-roles.list-users', service: 'user-platform-roles' })
  async listUsers(@Payload() payload: MicroservicePayload) {
    this.logger.debug(
      { function: 'listUsers', payload },
      UserPlatformRoleController.name,
    );

    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.userPlatformRoleService.listPlatformUsers({
        page: payload.page,
        perpage: payload.perpage,
        search: payload.search,
        sort: payload.sort,
        advance: payload.advance,
      }),
    );
    return this.handlePaginatedResult(result);
  }
```

If `MicroservicePayload` lacks `page` / `perpage` / `search` / `sort` / `advance`, read how
another paginated micro-business controller reads them (e.g.
`grep -rn "handlePaginatedResult" apps/micro-business/src/authen | head -3`) and follow
that same access pattern rather than widening the shared interface.

- [ ] **Step 4: Write the spec for `listPlatformUsers`, watch it fail, then confirm it passes**

Write these cases into `user_platform_role.service.spec.ts`, following the file's existing
style (mocked `PRISMA_SYSTEM`, no live DB). Write them **before** pasting in the
implementation from Steps 1–2 and run them once to watch them fail — a test that has never
failed has not been shown to test anything.

Cover:
- returns `{ paginate: { total: 0, page, perpage, pages: 0 }, data: [] }` and makes no
  further queries when `groupBy` returns no holders
- excludes users with no live assignment (the whole point of the endpoint)
- `advance` of `{"where":{"cluster_id":null}}` filters to platform-wide assignments —
  assert `groupBy` was called with `cluster_id: null`, not with the key absent
- `advance` of `{"where":{"platform_role_id":{"in":["r1"]}}}` narrows which users are
  returned but the returned rows still carry **all** of each user's roles
- a malformed `advance` string filters nothing instead of throwing
- default sort is `last_granted_at` descending; `username:asc` sorts by username
- `total` counts every matching holder, not just the current page's rows
- each role carries raw `created_at` / `created_by_id` (the gateway's enricher needs them)

- [ ] **Step 5: Verify it compiles and the existing suites still pass**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/micro-business/tsconfig.json
bunx jest apps/micro-business/src/authen/user_platform_role/
```

Expected: no type errors; both existing suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/micro-business/src/authen/user_platform_role/
git commit -m "feat(user-platform-role): เพิ่ม query รายชื่อผู้ถือสิทธิ์แพลตฟอร์ม

groupBy หา holder + เวลาที่ให้สิทธิ์ล่าสุดในคิวรีเดียว แล้วเรียง/แบ่งหน้าที่
ระดับผู้ใช้ ทำให้เรียงตาม last_granted_at ได้ทั้งชุดไม่ใช่แค่ในหน้าเดียว

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Atomic bulk assign

**Files:**
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts`
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.ts`

**Interfaces:**
- Consumes: `actorUserId` threading from Task 1.
- Produces: message pattern `{ cmd: 'user-platform-roles.assign-bulk', service: 'user-platform-roles' }` accepting `{ user_id, data: { role_ids, scope }, actor_user_id }`, returning `Result.ok({ count: number })` — Task 4 calls this.

- [ ] **Step 1: Add `assignBulk` to the service**

```ts
interface AssignBulkInput {
  role_ids: string[];
  scope: { type: 'platform' } | { type: 'cluster'; cluster_id: string };
}
```

```ts
  /**
   * Assign several platform roles at one scope in a single statement — all or nothing
   * กำหนดบทบาทแพลตฟอร์มหลายรายการในขอบเขตเดียวด้วยคำสั่งเดียว — สำเร็จทั้งหมดหรือไม่ทำเลย
   * @param userId - Grantee user ID / ID ผู้รับสิทธิ์
   * @param input - Role ids and the shared scope / รายการบทบาทและขอบเขตร่วม
   * @param actorUserId - Acting admin's user ID / ID ผู้ดูแลที่กระทำ
   * @returns Number of assignments created / จำนวนการกำหนดบทบาทที่สร้าง
   */
  @TryCatch
  async assignBulk(
    userId: string,
    input: AssignBulkInput,
    actorUserId?: string,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'assignBulk', userId, input },
      UserPlatformRoleService.name,
    );

    const roleIds = [...new Set(input.role_ids ?? [])];
    if (roleIds.length === 0) {
      return Result.errorFromCatalog(ERROR_CATALOG.USER_PLATFORM_ROLE_ROLE_NOT_FOUND);
    }

    const clusterId =
      input.scope.type === 'cluster' ? input.scope.cluster_id : null;

    const roles = await this.prismaSystem.tb_platform_role.findMany({
      where: { id: { in: roleIds }, deleted_at: null },
      select: { id: true, name: true },
    });

    if (roles.length !== roleIds.length) {
      const found = new Set(roles.map((r) => r.id));
      const missing = roleIds.filter((id) => !found.has(id));
      return Result.errorFromCatalog(
        ERROR_CATALOG.USER_PLATFORM_ROLE_ROLE_NOT_FOUND,
        { roles: missing.join(', ') },
      );
    }

    const existing = await this.prismaSystem.tb_user_tb_platform_role.findMany({
      where: {
        user_id: userId,
        platform_role_id: { in: roleIds },
        cluster_id: clusterId,
        deleted_at: null,
      },
      select: { platform_role_id: true },
    });

    if (existing.length > 0) {
      const nameById = new Map(roles.map((r) => [r.id, r.name]));
      const dupes = existing.map(
        (e) => nameById.get(e.platform_role_id) ?? e.platform_role_id,
      );
      return Result.errorFromCatalog(
        ERROR_CATALOG.USER_PLATFORM_ROLE_ASSIGNMENT_EXISTS,
        { roles: dupes.join(', ') },
      );
    }

    // createMany is one multi-row INSERT, so it is atomic without an explicit
    // transaction — nothing is written if any row is rejected.
    //
    // Caveat, stated rather than papered over: the duplicate check above is a
    // read-then-write, and the unique index user_platform_role_deleted_at_u includes
    // deleted_at, which is NULL for live rows. Postgres treats NULLs as distinct in a
    // unique index by default, so that index does NOT block two concurrent identical
    // grants. Two admins double-submitting the same grant in the same instant can
    // create duplicate live rows. Removing one still works, and the UI shows both.
    const created = await this.prismaSystem.tb_user_tb_platform_role.createMany({
      data: roleIds.map((roleId) => ({
        user_id: userId,
        platform_role_id: roleId,
        cluster_id: clusterId,
        created_at: new Date(),
        created_by_id: actorUserId ?? null,
      })),
    });

    return Result.ok({ count: created.count });
  }
```

- [ ] **Step 2: Add the message pattern**

```ts
  /**
   * Assign several platform roles to a user at one scope
   * กำหนดบทบาทแพลตฟอร์มหลายรายการให้ผู้ใช้ในขอบเขตเดียว
   * @param payload - Contains user_id, data (role_ids + scope) and actor_user_id / ประกอบด้วย user_id, data และ actor_user_id
   * @returns Assignment result / ผลลัพธ์การกำหนดบทบาท
   */
  @MessagePattern({ cmd: 'user-platform-roles.assign-bulk', service: 'user-platform-roles' })
  async assignBulk(@Payload() payload: MicroservicePayload) {
    this.logger.debug(
      { function: 'assignBulk', payload },
      UserPlatformRoleController.name,
    );

    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.userPlatformRoleService.assignBulk(
        payload.user_id,
        payload.data,
        payload.actor_user_id,
      ),
    );
    return this.handleResultCreate(result);
  }
```

- [ ] **Step 3: Write the spec for `assignBulk`, watch it fail, then confirm it passes**

Add to `user_platform_role.service.spec.ts`, written before the implementation and run once
to watch it fail. Cover:
- empty `role_ids` returns `USER_PLATFORM_ROLE_ROLE_NOT_FOUND` and writes nothing
- a role id that does not exist (or is soft-deleted) returns
  `USER_PLATFORM_ROLE_ROLE_NOT_FOUND` naming the missing ids, and `createMany` is never called
- a role already assigned **at that scope** returns `USER_PLATFORM_ROLE_ASSIGNMENT_EXISTS`
  naming the role, and `createMany` is never called — this is the all-or-nothing guarantee
  the dialog depends on
- the same role already assigned at a *different* scope does **not** block the write
- duplicate ids within one request are collapsed before writing
- on success, `createMany` receives one row per role with `created_by_id` set to the actor
  and `cluster_id` null for platform scope

- [ ] **Step 4: Verify**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/micro-business/tsconfig.json
bunx jest apps/micro-business/src/authen/user_platform_role/
```

Expected: no type errors; every suite passes.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/user_platform_role/
git commit -m "feat(user-platform-role): assign หลายบทบาทแบบ atomic

ตรวจบทบาทที่หายและที่ซ้ำก่อน แล้ว createMany ครั้งเดียว — ตัวใดตัวหนึ่ง
ไม่ผ่านคือไม่เขียนอะไรเลย จึงไม่มีสถานะสำเร็จบางส่วนให้ UI ต้องอธิบาย

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Gateway routes

**Files:**
- Create: `apps/backend-gateway/src/common/dto/user-platform-role/user-platform-role.assign-bulk.dto.ts`
- Modify: `apps/backend-gateway/src/common/dto/user-platform-role/index.ts`
- Modify: `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.service.ts`
- Modify: `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.controller.ts`

**Interfaces:**
- Consumes: the two message patterns from Tasks 2 and 3, and `actorUserId` from Task 1.
- Produces: `GET /api-system/platform/users` and `POST /api-system/platform/users/:user_id/roles/bulk` — Tasks 6–9 consume these.

- [ ] **Step 1: Create the bulk DTO**

`apps/backend-gateway/src/common/dto/user-platform-role/user-platform-role.assign-bulk.dto.ts`:

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * Request body schema for assigning several platform roles to a user at one shared scope
 * สคีมาเนื้อหาคำขอสำหรับกำหนดบทบาทแพลตฟอร์มหลายรายการให้ผู้ใช้ในขอบเขตร่วมเดียว
 */
export const UserPlatformRoleAssignBulkSchema = z.object({
  role_ids: z.array(z.string().uuid()).min(1).max(50),
  scope: z.discriminatedUnion('type', [
    z.object({ type: z.literal('platform') }),
    z.object({ type: z.literal('cluster'), cluster_id: z.string().uuid() }),
  ]).openapi({
    example: { type: 'platform' },
    description: 'Scope applied to every role in this request: platform-wide or one cluster',
  }),
});

export type IUserPlatformRoleAssignBulk = z.infer<typeof UserPlatformRoleAssignBulkSchema>;

/**
 * NestJS DTO class derived from UserPlatformRoleAssignBulkSchema for runtime Zod validation
 * คลาส DTO ของ NestJS ที่ได้จาก UserPlatformRoleAssignBulkSchema สำหรับตรวจสอบ Zod แบบ runtime
 */
export class UserPlatformRoleAssignBulkDto extends createZodDto(UserPlatformRoleAssignBulkSchema) {}
```

Add to `apps/backend-gateway/src/common/dto/user-platform-role/index.ts`:

```ts
export * from './user-platform-role.assign-bulk.dto';
```

- [ ] **Step 2: Add the two proxy methods to the gateway service**

In `user-platform-roles.service.ts`:

```ts
  /**
   * List users holding at least one platform role
   * แสดงรายการผู้ใช้ที่ถือบทบาทแพลตฟอร์มอย่างน้อยหนึ่งรายการ
   * @param query - Pagination, search, sort and advance filter / พารามิเตอร์การแบ่งหน้าและตัวกรอง
   * @returns Paginated privilege holders / ผู้ถือสิทธิ์แบบแบ่งหน้า
   */
  async listUsers(query: {
    page?: number;
    perpage?: number;
    search?: string;
    sort?: string;
    advance?: string;
  }): Promise<unknown> {
    this.logger.debug(
      { function: 'listUsers', query },
      UserPlatformRolesService.name,
    );

    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'user-platform-roles.list-users', service: 'user-platform-roles' },
      { ...query, ...getGatewayRequestContext() },
    );

    const response = await firstValueFrom(res);

    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }

    // Forward paginate alongside data — Result.ok(response.data) alone would drop the
    // pagination envelope and the table would never advance past page 1.
    return Result.ok({ data: response.data, paginate: response.paginate });
  }

  /**
   * Assign several platform roles to a user at one shared scope
   * กำหนดบทบาทแพลตฟอร์มหลายรายการให้ผู้ใช้ในขอบเขตร่วมเดียว
   * @param userId - Grantee user ID / ID ผู้รับสิทธิ์
   * @param data - Role ids and shared scope / รายการบทบาทและขอบเขตร่วม
   * @param actorUserId - Acting admin's user ID / ID ผู้ดูแลที่กระทำ
   * @returns Assignment result / ผลลัพธ์การกำหนดบทบาท
   */
  async assignBulk(
    userId: string,
    data: UserPlatformRoleAssignBulkDto,
    actorUserId?: string,
  ): Promise<unknown> {
    this.logger.debug(
      { function: 'assignBulk', userId, data },
      UserPlatformRolesService.name,
    );

    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'user-platform-roles.assign-bulk', service: 'user-platform-roles' },
      { user_id: userId, data, actor_user_id: actorUserId, ...getGatewayRequestContext() },
    );

    const response = await firstValueFrom(res);

    if (
      response.response.status !== HttpStatus.CREATED &&
      response.response.status !== HttpStatus.OK
    ) {
      return Result.fromMicroserviceError(response);
    }

    return Result.ok(response.data);
  }
```

Import `UserPlatformRoleAssignBulkDto` from `@/common` at the top.

Also add `actorUserId?: string` as a trailing parameter to the existing `assign` and
`remove` methods in this file, forwarding it as `actor_user_id` in each `send` payload —
the same one-line addition shown above.

- [ ] **Step 3: Add the routes to the gateway controller**

In `user-platform-roles.controller.ts`, add `Query` and `Req` to the `@nestjs/common`
import and `Request` to the `express` import, then add the list route **above** the
existing `@Get(':user_id/roles')` so a literal path is never shadowed by the param route:

```ts
  /**
   * List users holding at least one platform role
   * แสดงรายการผู้ใช้ที่ถือบทบาทแพลตฟอร์มอย่างน้อยหนึ่งรายการ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param page - Page number / หมายเลขหน้า
   * @param perpage - Rows per page / จำนวนแถวต่อหน้า
   * @param search - Search term matched against username and email / คำค้นหา
   * @param sort - Sort string "field:asc|desc" / สตริงการเรียง
   * @param advance - JSON filter string / สตริง JSON สำหรับตัวกรอง
   * @returns Paginated privilege holders / ผู้ถือสิทธิ์แบบแบ่งหน้า
   */
  @Get()
  @UseGuards(new AppIdGuard('user-platform.list'), PlatformPermissionGuard)
  @RequirePlatformPermission('user_platform.read')
  @EnrichAuditUsers({ paths: ['data.roles'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List users holding platform roles',
    description:
      'Returns users who hold at least one platform role, with their assignments nested. Users with no platform role are excluded.\n\nแสดงรายการผู้ใช้ที่ถือบทบาทแพลตฟอร์มอย่างน้อยหนึ่งรายการ',
    operationId: 'platformRbacUserRole_listUsers',
  })
  @ApiStdResponse(undefined, { description: 'Privilege holders retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  async listUsers(
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('perpage') perpage?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('advance') advance?: string,
  ): Promise<void> {
    this.logger.debug(
      { function: 'listUsers', page, perpage, search, sort, advance },
      UserPlatformRolesController.name,
    );

    const result = await this.userPlatformRolesService.listUsers({
      page: page ? Number(page) : undefined,
      perpage: perpage ? Number(perpage) : undefined,
      search,
      sort,
      advance,
    });
    this.respond(res, result);
  }
```

Then the bulk route:

```ts
  /**
   * Assign several platform roles to a user at one shared scope
   * กำหนดบทบาทแพลตฟอร์มหลายรายการให้ผู้ใช้ในขอบเขตร่วมเดียว
   * @param req - Express request carrying the authenticated user / คำขอที่มีผู้ใช้ที่ยืนยันตัวตนแล้ว
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param userId - Grantee user ID / ID ผู้รับสิทธิ์
   * @param body - Role ids and shared scope / รายการบทบาทและขอบเขตร่วม
   * @returns Assignment result / ผลลัพธ์การกำหนดบทบาท
   */
  @Post(':user_id/roles/bulk')
  @UseGuards(new AppIdGuard('user-platform-role.assign-bulk'), PlatformPermissionGuard)
  @RequirePlatformPermission('user_platform.manage')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign several platform roles to a user',
    description:
      'Assigns every listed role at one shared scope in a single atomic write. If any role is unknown or already assigned at that scope, nothing is written.\n\nกำหนดบทบาทหลายรายการในขอบเขตเดียวแบบ atomic',
    operationId: 'platformRbacUserRole_assignBulk',
  })
  @ApiParam({
    name: 'user_id',
    description: 'Unique identifier of the user (UUID v4)',
    example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d',
  })
  @ApiBody({ type: UserPlatformRoleAssignBulkDto })
  @ApiStdResponse(UserPlatformRoleMutationResponseDto, { status: 201, description: 'Roles assigned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  @ApiResponse({ status: 409, description: 'One or more roles are already assigned at this scope' })
  async assignBulk(
    @Req() req: Request,
    @Res() res: Response,
    @Param('user_id', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: UserPlatformRoleAssignBulkDto,
  ): Promise<void> {
    this.logger.debug(
      { function: 'assignBulk', userId, body },
      UserPlatformRolesController.name,
    );

    const actorUserId = (req.user as { user_id?: string } | undefined)?.user_id;
    const result = await this.userPlatformRolesService.assignBulk(userId, body, actorUserId);
    this.respond(res, result, HttpStatus.CREATED);
  }
```

Apply the same `@Req() req: Request` + `actorUserId` addition to the existing `assign` and
`remove` handlers so single-role grants are attributed too.

- [ ] **Step 4: Verify compilation and that the gateway still boots**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/backend-gateway/tsconfig.json
bunx jest apps/backend-gateway/src/platform/user-platform-roles/
```

Then confirm the module still resolves its providers. `PlatformPermissionGuard` crashes the
gateway at boot when a module does not register both `BUSINESS_SERVICE` and
`PlatformPermissionService`; unit tests do not catch it. This module already registers both
(`user-platform-roles.module.ts`) — verify nothing was dropped:

```bash
grep -n "PlatformPermissionService\|BUSINESS_SERVICE" apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.module.ts
```

Expected: both names present.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/
git commit -m "feat(platform): เพิ่ม route ทะเบียนผู้ถือสิทธิ์ + bulk assign

GET /api-system/platform/users ใช้ user_platform.read (ไม่ใช่ user.read —
support_staff ถือ user.read โดยไม่มีสิทธิ์เห็นหน้านี้) และ enrich ที่ path
data.roles เพราะ envelope ของ route แบบแบ่งหน้าคือ { data, paginate }

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Regenerate the API catalog and deploy to DEV

**Files:**
- Modify: `apps/backend-gateway/src/common/generated/app-api-catalog.generated.ts` (generated — never hand-edited)

- [ ] **Step 1: Regenerate**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
```

- [ ] **Step 2: Confirm both new names landed**

```bash
grep -rn "user-platform.list\|user-platform-role.assign-bulk" apps/backend-gateway/src/common/generated/
```

Expected: both appear in `APP_API_CATALOG` and in `APP_API_CATALOG_GROUPS`.

- [ ] **Step 3: Commit and push**

```bash
git add apps/backend-gateway/src/common/generated/
git commit -m "chore(catalog): regenerate หลังเพิ่ม AppIdGuard 2 ชื่อ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feature/user-platform-registry
```

- [ ] **Step 4: STOP — hand off to the user**

Open the PR, then tell the user the backend must be **merged and deployed to DEV** before
the frontend work can be verified. Do not start Task 6 expecting a working endpoint; Tasks
6–10 can be written against the contract, but Task 11 (browser verification) is blocked
until DEV has the new routes.

---

# FRONTEND — `carmen-platform`

### Task 6: Types and service

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/userPlatformService.ts`

**Interfaces:**
- Consumes: the endpoints from Task 4.
- Produces: `PlatformUserRow`, `PlatformUserRoleAssignment`, and `userPlatformService.getAll` / `.assignBulk` — Tasks 7–10 all use these exact names.

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, below the existing `UserRoleAssignment` interface (around line
454), add:

```ts
/** Scope of a platform-role assignment as returned by the registry endpoint, with the cluster's display name resolved server-side. */
export type PlatformUserScope =
  | { type: 'platform' }
  | { type: 'cluster'; cluster_id: string; cluster_name?: string | null };

export interface PlatformUserRoleAssignment {
  id: string;
  role_id: string;
  role_name?: string | null;
  scope: PlatformUserScope;
  // The gateway's @EnrichAuditUsers rewrites created_at/created_by_id into this shape.
  // `audit.created.name` is absent when the grant predates actor recording, and is the
  // literal "Unknown" when an id was recorded but no longer resolves to a user.
  audit?: Audit;
}

export interface PlatformUserRow {
  user_id: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  is_active: boolean;
  roles: PlatformUserRoleAssignment[];
  last_granted_at?: string | null;
}
```

- [ ] **Step 2: Create the service**

`src/services/userPlatformService.ts`:

```ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type {
  PaginateParams,
  PlatformUserRow,
  PlatformUserScope,
  ApiListResponse,
} from '../types';

const defaultSearchFields = ['username', 'email'];

const userPlatformService = {
  /** Users holding at least one platform role. Users with none are excluded server-side. */
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<PlatformUserRow>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter)
        ? (paginate.filter as Record<string, unknown>)
        : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/platform/users?${q.toQueryString()}`);
    return response.data;
  },

  /** Grant several roles at one shared scope. Atomic — the backend writes all or none. */
  assignBulk: async (
    userId: string,
    payload: { role_ids: string[]; scope: PlatformUserScope },
  ) => {
    const response = await api.post(
      `/api-system/platform/users/${userId}/roles/bulk`,
      payload,
    );
    return response.data;
  },
};

export default userPlatformService;
```

- [ ] **Step 3: Verify**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b feature/user-platform-registry
bun run typecheck && bun run lint
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/userPlatformService.ts
git commit -m "feat(user-platform): เพิ่ม type และ service ของทะเบียนผู้ถือสิทธิ์

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Registry-shaped summary band

The current band splits users into "with platform roles" vs "none". Once every row has a
role, "none" is always zero and the bar is always full — it stops carrying information.

**Files:**
- Rewrite: `src/pages/userPlatformManagement/PlatformAccessSummary.tsx`
- Modify: `src/pages/userPlatformManagement/PlatformAccessSummary.test.tsx`

**Interfaces:**
- Consumes: `PlatformUserRow` from Task 6.
- Produces: `summarizeRegistry(rows: PlatformUserRow[], total: number): RegistrySummary` and `<PlatformAccessSummary summary loading error onRetry onShowInactive />` — Task 8 renders this.

- [ ] **Step 1: Rewrite the component**

Replace the whole file with:

```tsx
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { AlertTriangle } from 'lucide-react';
import type { PlatformUserRow } from '../../types';

export interface RegistrySummary {
  /** Privilege holders across the whole registry, from the endpoint's paginate.total. */
  holders: number;
  /** Holders on this page with at least one platform-wide role. */
  platformWide: number;
  /** Holders on this page whose roles are all cluster-scoped. */
  clusterOnly: number;
  /** Role assignments across this page. */
  assignments: number;
  /** Holders on this page who cannot sign in but still hold privilege. */
  inactive: number;
}

/**
 * Roll the loaded page into registry counts. `total` comes from the endpoint's
 * paginate envelope so the headline holder count reflects the whole registry, while the
 * breakdown describes the rows actually in hand — the two are labelled differently in the
 * UI rather than being silently mixed.
 */
export function summarizeRegistry(rows: PlatformUserRow[], total: number): RegistrySummary {
  let platformWide = 0;
  let clusterOnly = 0;
  let assignments = 0;
  let inactive = 0;

  for (const row of rows) {
    assignments += row.roles.length;
    if (!row.is_active) inactive += 1;
    if (row.roles.some((r) => r.scope.type === 'platform')) platformWide += 1;
    else if (row.roles.length > 0) clusterOnly += 1;
  }

  return { holders: total, platformWide, clusterOnly, assignments, inactive };
}

interface PlatformAccessSummaryProps {
  summary: RegistrySummary | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Applies the inactive filter. The warning is an entry point, not just a tint. */
  onShowInactive?: () => void;
}

export function PlatformAccessSummary({
  summary,
  loading,
  error = false,
  onRetry = () => {},
  onShowInactive,
}: PlatformAccessSummaryProps) {
  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message="Couldn't load the registry summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-28" />
          <Skeleton className="h-14 min-w-[14rem] flex-1" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="border-border sm:border-r sm:pr-8">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {summary.holders}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">
              {summary.holders === 1 ? 'holder' : 'holders'}
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Platform-wide</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.platformWide}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Cluster-scoped</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.clusterOnly}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Assignments</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.assignments}</dd>
            </div>
          </dl>

          {summary.inactive > 0 && (
            <button
              type="button"
              onClick={onShowInactive}
              className="text-warning ml-auto inline-flex items-center gap-2 rounded-md border border-warning/40 px-3 py-1.5 text-sm hover:bg-warning/10"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {summary.inactive} inactive {summary.inactive === 1 ? 'holder' : 'holders'} still hold access
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
```

The page-scoped counts are labelled plainly ("Platform-wide", "Cluster-scoped") and the
whole-registry count is the big number. Do not present a page-scoped count as a
registry-wide one.

- [ ] **Step 2: Update the existing test file**

Read `PlatformAccessSummary.test.tsx`. It tests `summarizeUserPlatform`, which no longer
exists. Rewrite its assertions against `summarizeRegistry` with the new shape — for
example, a row holding one platform role and one cluster role counts once in
`platformWide`, contributes 2 to `assignments`, and 0 to `clusterOnly`. Keep the same
number of existing cases and add cases for the new fields: `platformWide`, `clusterOnly`,
`assignments`, and `inactive`, plus the case where `total` (registry-wide) differs from
`rows.length` (this page).

- [ ] **Step 3: Verify**

```bash
bun run typecheck && bun run lint
bun run test -- src/pages/userPlatformManagement/PlatformAccessSummary.test.tsx
```

Expected: clean, and the suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/userPlatformManagement/
git commit -m "refactor(user-platform): band สรุปแบบทะเบียนสิทธิ์

with-roles/none ไม่มีความหมายเมื่อทุกแถวมี role อยู่แล้ว เปลี่ยนเป็นแยกตาม
ขอบเขตอำนาจ และทำคำเตือน inactive ให้กดกรองได้แทนที่จะเป็นแค่ตัวเลขสีส้ม

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Scope rail and role chips

Small, self-contained presentation pieces, split out so the page file stays readable.

**Files:**
- Create: `src/pages/userPlatformManagement/roleChips.tsx`

**Interfaces:**
- Consumes: `PlatformUserRoleAssignment` from Task 6.
- Produces: `hasPlatformWide(roles)`, `<ScopeRail platformWide />`, `<RoleChips roles />` — Task 9 uses all three.

- [ ] **Step 1: Create the file**

```tsx
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import type { PlatformUserRoleAssignment } from '../../types';

/** True when any assignment is platform-wide — the widest blast radius a holder can have. */
export function hasPlatformWide(roles: PlatformUserRoleAssignment[]): boolean {
  return roles.some((r) => r.scope.type === 'platform');
}

const scopeLabel = (scope: PlatformUserRoleAssignment['scope']): string =>
  scope.type === 'platform'
    ? 'Platform'
    : scope.cluster_name || scope.cluster_id;

/**
 * Leading-edge bar encoding how far a holder's privilege reaches. It is an accelerator for
 * scanning, never the only carrier of the fact — the scope name is written beside it in
 * RoleChips, so the rail is safe for anyone who cannot distinguish the two treatments.
 */
export function ScopeRail({ platformWide }: { platformWide: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'w-[3px] shrink-0 self-stretch rounded-full',
        platformWide ? 'bg-primary' : 'border border-border',
      )}
    />
  );
}

/** Assignments grouped by scope, widest first, scope named once per group. */
export function RoleChips({ roles }: { roles: PlatformUserRoleAssignment[] }) {
  if (roles.length === 0) return <span className="text-muted-foreground text-sm">-</span>;

  const groups = new Map<string, PlatformUserRoleAssignment[]>();
  for (const role of roles) {
    const key = scopeLabel(role.scope);
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }

  // Platform-wide first; remaining clusters alphabetical so the order is stable
  // across renders and pages.
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Platform') return -1;
    if (b === 'Platform') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-1">
      {ordered.map(([scope, items]) => (
        <div key={scope} className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs whitespace-nowrap">{scope}</span>
          <span className="text-muted-foreground/50 text-xs">·</span>
          {items.map((role) => (
            <Badge key={role.id} variant="secondary" className="text-xs">
              {role.role_name || role.role_id}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `roleChips.test.tsx`, watch it fail, then confirm it passes**

Cover: `hasPlatformWide` is true when any assignment is platform-wide and false for a
cluster-only holder; `RoleChips` renders one group per scope with Platform first and
clusters alphabetical after it; a cluster with no resolved `cluster_name` falls back to its
id rather than rendering blank; an empty roles array renders `-`.

- [ ] **Step 3: Verify**

```bash
bun run typecheck && bun run lint
bun run test -- src/pages/userPlatformManagement/roleChips.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/userPlatformManagement/roleChips.tsx src/pages/userPlatformManagement/roleChips.test.tsx
git commit -m "feat(user-platform): scope rail + role chips จัดกลุ่มตามขอบเขต

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Grant access dialog

**Files:**
- Create: `src/pages/userPlatformManagement/GrantAccessDialog.tsx`

**Interfaces:**
- Consumes: `userPlatformService.assignBulk` (Task 6), `<UserPicker>` (`src/components/UserPicker.tsx`).
- Produces: `<GrantAccessDialog open onOpenChange onGranted />` — Task 10 renders it.

- [ ] **Step 1: Create the dialog**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { UserPicker } from '../../components/UserPicker';
import userPlatformService from '../../services/userPlatformService';
import roleService from '../../services/roleService';
import clusterService from '../../services/clusterService';
import { parseApiError } from '../../utils/errorParser';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { UserOption, PlatformUserScope } from '../../types';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful grant so the page can refetch. */
  onGranted: () => void;
}

export const GrantAccessDialog: React.FC<GrantAccessDialogProps> = ({
  open, onOpenChange, onGranted,
}) => {
  const [user, setUser] = useState<UserOption | null>(null);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState<'platform' | 'cluster'>('platform');
  const [clusterId, setClusterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflictRoleIds, setConflictRoleIds] = useState<string[]>([]);

  // A ref, not state: Radix's DismissableLayer invokes onEscapeKeyDown through a callback
  // that does not reliably see this component's latest render, so a state value read
  // inside that closure can be stale. `.current` is dereferenced live at call time.
  const pickerOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setUser(null);
    setSelectedRoleIds([]);
    setScopeType('platform');
    setClusterId('');
    setConflictRoleIds([]);
    (async () => {
      try {
        const r = await roleService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = r.data || r;
        setRoleOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* the dialog still works with an empty list; the toast on submit explains */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = c.data || c;
        setClusterOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* same */ }
    })();
  }, [open]);

  const toggleRole = (id: string) => {
    setConflictRoleIds([]);
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('Select a user'); return; }
    if (selectedRoleIds.length === 0) { toast.error('Select at least one role'); return; }
    if (scopeType === 'cluster' && !clusterId) { toast.error('Select a cluster'); return; }

    setSaving(true);
    setConflictRoleIds([]);
    try {
      const scope: PlatformUserScope =
        scopeType === 'cluster' ? { type: 'cluster', cluster_id: clusterId } : { type: 'platform' };
      await userPlatformService.assignBulk(user.id, { role_ids: selectedRoleIds, scope });
      toast.success('Access granted');
      onOpenChange(false);
      onGranted();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      // Nothing was written, so the dialog stays open with what was typed intact.
      const named = roleOptions
        .filter((r) => message.includes(r.name))
        .map((r) => r.id);
      setConflictRoleIds(named);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => { if (pickerOpenRef.current) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Grant platform access</DialogTitle>
          <DialogDescription>
            Assign platform roles to a user. Every role in this request gets the same scope.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant_user">User</Label>
            <UserPicker
              id="grant_user"
              ariaLabel="User to grant access to"
              value={user}
              onChange={setUser}
              onDropdownOpenChange={(o) => { pickerOpenRef.current = o; }}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {roleOptions.length === 0 ? (
                <p className="text-muted-foreground p-2 text-sm">No platform roles available.</p>
              ) : roleOptions.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className={conflictRoleIds.includes(role.id) ? 'text-destructive' : ''}>
                    {role.name}
                  </span>
                  {conflictRoleIds.includes(role.id) && (
                    <span className="text-destructive text-xs">Already granted</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant_scope">Scope</Label>
            <select
              id="grant_scope"
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as 'platform' | 'cluster');
                setClusterId('');
                setConflictRoleIds([]);
              }}
              disabled={saving}
              className={selectClassName}
            >
              <option value="platform">Platform-wide</option>
              <option value="cluster">A specific cluster</option>
            </select>
          </div>

          {scopeType === 'cluster' && (
            <div className="space-y-2">
              <Label htmlFor="grant_cluster">Cluster</Label>
              <select
                id="grant_cluster"
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setConflictRoleIds([]); }}
                disabled={saving}
                className={selectClassName}
              >
                <option value="">Select cluster…</option>
                {clusterOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <ShieldCheck className="mr-2 h-4 w-4" />}
            {saving ? 'Granting…' : 'Grant access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 2: Write `GrantAccessDialog.test.tsx`, watch it fail, then confirm it passes**

React Testing Library + `@testing-library/user-event`, explicit `vitest` imports, no
snapshots. `vi.mock` `userPlatformService`, `roleService`, `clusterService`, and
`../../components/UserPicker` (stub it as a button that calls `onChange` with a fixed
`UserOption`). Cover:
- submitting with no user selected shows an error and never calls `assignBulk`
- submitting with a user but no role selected shows an error and never calls `assignBulk`
- choosing "A specific cluster" without picking one blocks submission
- a successful grant calls `assignBulk` with every checked role id and the shared scope,
  then calls `onGranted`
- a 409 leaves the dialog open, marks the conflicting role "Already granted", and does not
  call `onGranted` — nothing was written, so nothing should look written

- [ ] **Step 3: Verify**

```bash
bun run typecheck && bun run lint
bun run test -- src/pages/userPlatformManagement/GrantAccessDialog.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/userPlatformManagement/GrantAccessDialog.tsx src/pages/userPlatformManagement/GrantAccessDialog.test.tsx
git commit -m "feat(user-platform): dialog ให้สิทธิ์ — คน + หลาย role + scope เดียว

Escape guard ใช้ ref เพราะ callback ของ Radix อ่าน closure เก่าได้ใน React 19

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Rebuild the management page

**Files:**
- Rewrite: `src/pages/UserPlatformManagement.tsx`
- Modify: `src/pages/UserPlatformManagement.test.tsx`
- Modify: `src/pages/UserPlatformEdit.tsx` (one sentence of copy)

**Interfaces:**
- Consumes: everything from Tasks 6–9.

- [ ] **Step 1: Rewrite the page**

Keep the existing page's overall skeleton — `Layout`, `PageHeader`, summary band, a `Card`
holding search + filter Sheet + `DataTable`, and the `DevDebugSheet` — and replace the data
layer and columns. Concretely:

**Delete** both N+1 loops: the `rolesCount` state and its `Promise.all` in `fetchUsers`,
and the entire `loadSummary` callback with its `perpage: -1` sweep. The registry endpoint
returns roles inline and `paginate.total` for the headline count.

**State:**

```tsx
  const [rows, setRows] = useState<PlatformUserRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PlatformUserRow | null>(null);

  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('search_user_platform') || '');
  const [roleFilter, setRoleFilter] = useState<string[]>(() => getStoredJSON<string[]>('role_filters_user_platform', []));
  const [scopeFilter, setScopeFilter] = useState<string>(() => localStorage.getItem('scope_filter_user_platform') || '');
  const [statusFilter, setStatusFilter] = useState<string[]>(() => getStoredJSON<string[]>('status_filters_user_platform', []));
```

`scopeFilter` is `''` (any), `'platform'`, or a cluster id.

**Advance builder** — keep the existing `buildAdvance` shape, extended:

```tsx
  const buildAdvance = (roles: string[], scope: string, statuses: string[]) => {
    const where: Record<string, unknown> = {};
    if (roles.length > 0) where.platform_role_id = { in: roles };
    if (scope === 'platform') where.cluster_id = null;
    else if (scope) where.cluster_id = { in: [scope] };
    if (statuses.length === 1) where.is_active = statuses[0] === 'true';
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };
```

`cluster_id: null` is deliberate and must not be dropped by an `if (value)` guard — null is
how the endpoint selects platform-wide assignments.

**Fetch:**

```tsx
  const fetchRows = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await userPlatformService.getAll(params);
      setRawResponse(data);
      const items = Array.isArray(data?.data) ? data.data : [];
      setRows(items);
      setTotalRows(data?.paginate?.total ?? items.length);
      setError('');
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      setError(message);
      setRows([]);
      setTotalRows(0);
      toast.error('Failed to load platform users', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);
```

**Summary:**

```tsx
  const summary = useMemo(() => summarizeRegistry(rows, totalRows), [rows, totalRows]);
```

with `<PlatformAccessSummary summary={summary} loading={loading} error={!!error} onRetry={() => fetchRows(paginate)} onShowInactive={() => handleStatusFilter('false')} />`.

**Columns** (wrapped in `useMemo`, no `#` column — `DataTable` adds one):

```tsx
  const columns = useMemo<ColumnDef<PlatformUserRow, unknown>[]>(() => [
    {
      accessorKey: 'username',
      header: 'User',
      meta: { card: 'title' },
      cell: ({ row }) => {
        const r = row.original;
        const name = [r.firstname, r.lastname].filter(Boolean).join(' ');
        return (
          <div className="flex items-stretch gap-3">
            <ScopeRail platformWide={hasPlatformWide(r.roles)} />
            <div className="min-w-0">
              <Link
                to={`/platform/user-platform/${r.user_id}`}
                className="font-medium text-primary hover:underline"
              >
                {name || r.username || '-'}
              </Link>
              {!r.is_active && (
                <Badge variant="secondary" className="ml-2 text-xs">Inactive</Badge>
              )}
              <div className="text-muted-foreground truncate text-xs">{r.email || '-'}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'roles',
      header: 'Roles & scope',
      enableSorting: false,
      cell: ({ row }) => <RoleChips roles={row.original.roles} />,
    },
    {
      accessorKey: 'last_granted_at',
      id: 'last_granted_at',
      header: 'Granted',
      meta: { headerClassName: 'w-44' },
      cell: ({ row }) => {
        const roles = row.original.roles;
        // The grantor shown belongs to the most recent grant, which is the one the
        // "Granted" date refers to. Per-role attribution lives on the detail page.
        const newest = roles.reduce<typeof roles[number] | undefined>((acc, r) => {
          const at = r.audit?.created?.at;
          if (!at) return acc;
          return !acc?.audit?.created?.at || at > acc.audit.created.at ? r : acc;
        }, undefined);
        const by = newest?.audit?.created?.name;
        return (
          <div className="text-muted-foreground space-y-0.5 text-[11px] leading-tight">
            <div>{fmtDateTime(row.original.last_granted_at ?? undefined)}</div>
            <div>{by ? `by ${by}` : 'by —'}</div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-20', cellClassName: 'text-center p-0', card: 'actions' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              aria-label={`Actions for ${row.original.username || 'user'}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => navigate(`/platform/user-platform/${row.original.user_id}`)}
              className="cursor-pointer"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Manage roles
            </DropdownMenuItem>
            <Can permission="user_platform.manage">
              <DropdownMenuItem
                onClick={() => setRevokeTarget(row.original)}
                className="cursor-pointer text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke all access
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate]);
```

Keep the existing `fmtDateTime` and `getStoredJSON` helpers from the current file.

**Revoke-all handler** — the backend has no bulk-remove route, so this is a sequential loop
over `userRoleService.remove`, and it reports honestly if part of it fails:

```tsx
  const handleRevokeAll = async () => {
    if (!revokeTarget) return;
    const failed: string[] = [];
    for (const role of revokeTarget.roles) {
      try {
        await userRoleService.remove(revokeTarget.user_id, role.id);
      } catch {
        failed.push(role.role_name || role.role_id);
      }
    }
    if (failed.length === 0) toast.success('Access revoked');
    else toast.error(`Could not revoke: ${failed.join(', ')}`);
    setRevokeTarget(null);
    fetchRows(paginate);
  };
```

with the confirm dialog:

```tsx
  <ConfirmDialog
    open={!!revokeTarget}
    onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
    title="Revoke all platform access"
    description={
      revokeTarget
        ? `Remove all ${revokeTarget.roles.length} role assignment${revokeTarget.roles.length === 1 ? '' : 's'} from ${revokeTarget.username || revokeTarget.email}? They will no longer appear in this registry.`
        : ''
    }
    confirmText="Revoke all"
    confirmVariant="destructive"
    onConfirm={handleRevokeAll}
  />
```

**Header actions:**

```tsx
  actions={
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || rows.length === 0}>
        <Download className="mr-2 h-4 w-4" />
        Export
      </Button>
      <Can permission="user_platform.manage">
        <Button size="sm" onClick={() => setShowGrant(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Grant access
        </Button>
      </Can>
    </div>
  }
```

Subtitle becomes `"Users holding platform roles"`. Keep the search placeholder exactly
`"Search users..."` — it is still accurate and the E2E page object matches on it, so
changing it would break Task 12 for no gain.

**Export** — one row per assignment, since a spreadsheet cannot filter a cell holding
several roles:

```tsx
  const handleExport = () => {
    const flat = rows.flatMap((r) =>
      r.roles.map((role) => ({
        username: r.username ?? '',
        email: r.email ?? '',
        is_active: r.is_active ? 'Active' : 'Inactive',
        role: role.role_name ?? role.role_id,
        scope: role.scope.type === 'platform'
          ? 'Platform'
          : (role.scope.cluster_name || role.scope.cluster_id),
        granted_at: role.audit?.created?.at ?? '',
        granted_by: role.audit?.created?.name ?? '',
      })),
    );
    const csv = generateCSV(flat, [
      { key: 'username', label: 'Username' },
      { key: 'email', label: 'Email' },
      { key: 'is_active', label: 'Status' },
      { key: 'role', label: 'Role' },
      { key: 'scope', label: 'Scope' },
      { key: 'granted_at', label: 'Granted at' },
      { key: 'granted_by', label: 'Granted by' },
    ]);
    downloadCSV(csv, `user-platform-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };
```

**Filter Sheet** — keep the existing Status section verbatim and add a Role section
(multi-select buttons over roles fetched with `roleService.getAll({ perpage: 200, sort: 'name:asc' })`)
and a Scope section (a `<select>` with `Any scope` / `Platform-wide` / each cluster).
Every change writes to `localStorage` and resets `page` to 1, exactly as `handleStatusFilter`
already does. `activeFilterCount` becomes
`(roleFilter.length > 0 ? 1 : 0) + (scopeFilter ? 1 : 0) + (statusFilter.length > 0 ? 1 : 0)`.

**Empty state** copy: `emptyTitle="No one holds platform roles yet"`,
`emptyDescription="Grant access to give someone a platform role."`, with the Grant access
button as `addAction`.

Render `<GrantAccessDialog open={showGrant} onOpenChange={setShowGrant} onGranted={() => fetchRows(paginate)} />`.

Keep `useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() })` and the
`DevDebugSheet`, updating its `endpoint` prop to `"GET /api-system/platform/users"`.

- [ ] **Step 2: Add the one-sentence copy change to the edit page**

In `src/pages/UserPlatformEdit.tsx`, the remove-role `ConfirmDialog`'s `description` should
say what happens when it is the last one. Replace the `description` prop with:

```tsx
              description={`Are you sure you want to remove the role "${deleteRoleAssignment?.role_name || deleteRoleAssignment?.role_id}" from this user?${roleAssignments.length === 1 ? ' This is their last platform role — they will no longer appear in the User Platform registry.' : ''}`}
```

- [ ] **Step 3: Update the existing page test**

Read `src/pages/UserPlatformManagement.test.tsx` (398 lines). It mocks `userService` and
`userRoleService`; the page now calls `userPlatformService`. Rework the mocks and fixtures
to the new service and the `PlatformUserRow` shape, keeping the same set of behaviors under
test (renders rows, links to the detail page, search debounce, filter badges, CSV filename,
empty state). Follow the existing file's approach: `vi.mock` the shell (`Layout`, `Can`) and
the services, keep routing real via `MemoryRouter`. Add cases for what this task
introduces: the scope rail distinguishes platform-wide from cluster-only holders, the
role/scope filters serialize into `advance` (including `cluster_id: null` for
platform-wide), the CSV exports one row per assignment, and `Revoke all` confirms before
calling remove.

- [ ] **Step 4: Verify the whole suite**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: all clean, all suites green. If any other suite fails, it is a real regression
from this change — fix it rather than skipping it.

- [ ] **Step 5: Commit**

```bash
git add src/pages/
git commit -m "feat(user-platform): เปลี่ยนหน้าเป็นทะเบียนผู้ถือสิทธิ์

ลบ N+1 ทั้งสองชุด (ตาราง + summary) เหลือ request เดียวต่อการโหลด, กรองตาม
role/scope/สถานะที่ฝั่งเซิร์ฟเวอร์, และเพิ่ม Grant access + Revoke all

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Verify against DEV in the browser

**Blocked until the backend branch is merged and deployed to DEV.**

- [ ] **Step 1: Run the dev server against DEV**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run dev:dev
```

- [ ] **Step 2: Walk the page at `http://localhost:3304/platform/user-platform`**

Check each, and report what actually happened rather than what was expected:

- The registry lists only privilege holders. On DEV that is **2 rows**, not 39.
- The Network panel shows **one** request to `/api-system/platform/users` per load — not a burst of `…/roles` calls.
- The scope rail is solid on holders with a platform-wide role, outlined on cluster-only holders.
- `Granted by` shows a name for grants made after this deploy, and `—` for older ones.
- Role filter, Scope filter and Status filter each narrow the list, and their badges clear correctly.
- Grant access adds a row; granting a role the user already has at that scope leaves the dialog open, marks the role, and writes nothing.
- Revoke all removes the row from the registry.
- The page has no horizontal scrollbar at 1280px, and at 375px the mobile card layout is usable.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/user-platform-registry
```

Open the PR describing the measured before/after (39 rows and ~78 requests → 2 rows and 1
request), and note that the backend must already be on DEV.

---

## Self-Review

**Spec coverage.** Registry endpoint → Task 2 + 4. Bulk assign → Task 3 + 4. Actor
recording → Task 1 + 4. Catalog regeneration → Task 5. Service + types → Task 6. Summary
band → Task 7. Scope rail + chips → Task 8. Grant dialog → Task 9. Table, filters, export,
empty states, revoke-all, edit-page copy → Task 10. Browser verification → Task 11. The
spec's out-of-scope items (super-admin `created_by_id`, backfilling grantors, per-role
scope in one submission) have no tasks, correctly.

**Naming consistency.** `listPlatformUsers` (service) → `user-platform-roles.list-users`
(message pattern) → `listUsers` (gateway service and controller) → `getAll` (frontend
service) is a deliberate chain, each name matching its layer's convention; each is stated
in the Interfaces block of the task that produces it. `summarizeRegistry`, `RegistrySummary`,
`hasPlatformWide`, `ScopeRail`, `RoleChips`, `PlatformUserRow`, `PlatformUserRoleAssignment`,
and `PlatformUserScope` are used identically wherever they appear.

**Known risk carried into execution.** `MicroservicePayload` may not declare `page`,
`perpage`, `search`, `sort`, `advance`, or `actor_user_id`. Task 1 Step 3 and Task 2 Step 3
each say to check and follow the existing pattern rather than assuming, because widening a
shared interface affects every micro-business controller.

---

# E2E — `carmen-platform-e2e`

### Task 12: Update and extend the Playwright suite

**Blocked until the backend is on DEV and Task 10 is merged**, same as Task 11 — these
tests drive the real page over HTTP.

**Files:**
- Modify: `pages/UserPlatformManagementPage.ts`
- Modify: `tests/user-platform/user-platform-list.spec.ts`
- Read (may need small edits): `pages/UserPlatformEditPage.ts`, `tests/user-platform/user-platform-config.spec.ts`
- Create: `tests/user-platform/user-platform-grant.spec.ts`

**Interfaces:**
- Consumes: the rebuilt page from Task 10 and the endpoints from Task 4.

- [ ] **Step 1: Branch, in the E2E repo specifically**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
git checkout main && git pull
git checkout -b feature/user-platform-registry
```

This repo defaults to `main`. Do not skip this step.

- [ ] **Step 2: Establish what the page actually renders before changing selectors**

Run the frontend and open the page rather than trusting the existing page object's
comments — several are now stale, and one may always have been wrong:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
bun run test:headed -- tests/user-platform/user-platform-list.spec.ts
```

Record, from the real DOM:
- whether the username cell is an `<a>` or a `<button>`. The page object's doc comment
  claims "a BUTTON in the Username cell (not an `<a>`)" and `openUser` clicks
  `row.locator('button').first()`, but the page source used a `<Link>` both before and
  after the redesign. If it is an `<a>`, that `button` locator now resolves to the row's
  `⋮` actions trigger — fix `openUser` and `openFirstNonLoginUser` to click the link.
- whether the E2E login user (`TEST_CREDENTIALS.email`) holds a platform role, and so
  appears in the registry at all.

- [ ] **Step 3: Update the page object to the registry**

In `pages/UserPlatformManagementPage.ts`:

- `apiPath` → `'/api-system/platform/users'`. The inherited `waitForTableData` waits on
  this request; leaving `/api-system/user` means it waits for a call the page no longer
  makes and times out.
- `emptyStateText` → `'No one holds platform roles'`
- Keep `searchPlaceholder: 'Search users'` — Task 10 pins that placeholder.
- `addLabel` → `'Grant access'`, and **delete** the doc-comment paragraph asserting the
  page has no Add button. It has one now, and the inherited `clickAdd` is the right way to
  open the grant dialog.
- Rewrite the class doc comment to describe a privilege registry listing only holders,
  not a directory of every user.
- Add a getter for the grant dialog and one for the summary band's inactive warning:

```ts
  /** The Grant access dialog, open after clickAdd(). */
  get grantDialog() {
    return this.page.getByRole('dialog', { name: 'Grant platform access' });
  }

  /** Summary-band warning button; absent when no inactive holder holds access. */
  get inactiveWarning() {
    return this.page.getByRole('button', { name: /inactive holder/i });
  }
```

- [ ] **Step 4: Fix the existing list spec**

`tests/user-platform/user-platform-list.spec.ts` case `TC-UP-010001` asserts row count > 0
and that no Add button exists. Both are now wrong:

- The registry lists only privilege holders. Do **not** assert a non-empty table
  unconditionally — that couples the suite to whoever happens to hold a role on the target
  environment. Assert instead that the page reached a settled state: either the table has
  rows **or** the empty state is visible. Use `.first()` on the `or()` locator, per this
  repo's selector-ambiguity convention.
- Replace the "no Add button by design" assertion with its opposite: the Grant access
  button is visible. Update that case's `expected` annotation text to match — a stale
  annotation is worse than none, because the CSV export presents it as the spec.
- Keep the search / filter / export assertions.

For `TC-UP-010002` (row click opens the per-user config page), the fallback
`openUser('test@test.com')` assumed every user was listed. If Step 2 showed the login user
is not a holder, that fallback now fails. Change it to `test.skip()` with an explicit
message when `openFirstNonLoginUser()` returns null — skipping with a stated reason is
honest; clicking a row that may not exist is a flake.

Then read `tests/user-platform/user-platform-config.spec.ts` and
`pages/UserPlatformEditPage.ts`. The per-user page is unchanged apart from one confirm
sentence, so these likely pass untouched — but if that spec reaches the config page by way
of the list, it inherits the same "user may not be listed" problem. Fix it the same way if
so; leave it alone if not.

- [ ] **Step 5: Add the grant-flow spec**

Create `tests/user-platform/user-platform-grant.spec.ts` following this repo's structure:
`test.describe`, a page object in `beforeEach`, and the full `annotation` block
(`caseId`, `priority`, `testType`, `precondition`, one `step` per action, `expected`) that
every other spec in this suite carries — the run's CSV export is generated from those
annotations, so a spec without them is invisible in the report. Use the next free
`TC-UP-01xxxx` ids after the existing ones.

Cover, read-only first:

1. **Grant dialog opens and validates** (P1, Smoke) — `clickAdd()`, assert the dialog is
   visible with its user picker, role list, and scope select; submit with nothing filled;
   assert an error toast and that the dialog stays open. Writes nothing, so it is safe on
   any environment.
2. **Scope select reveals the cluster picker** (P2, Functional) — choose "A specific
   cluster"; assert the cluster select appears; choose "Platform-wide"; assert it
   disappears.
3. **Registry excludes non-holders** (P1, Functional) — every visible row shows at least
   one role chip. This is the redesign's whole premise, and it is checkable without
   writing anything.

Do **not** write a test that grants a real role to the E2E login user. That account's
platform roles power the entire suite; the existing page object comments say so
explicitly. If a write-path test is wanted later it needs its own disposable user and a
guaranteed cleanup, which is its own piece of work — note that in the spec file as a
comment rather than improvising it here.

- [ ] **Step 6: Verify**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
bun run typecheck
bun run test -- tests/user-platform/
```

Use `bun run test`, never `bun test` — the latter invokes Bun's own runner, which shadows
the script and fails on Playwright's `test.use()`. Report the actual pass/fail counts. If a
test fails because the DEV data has no privilege holders, say so plainly rather than
loosening the assertion until it passes.

- [ ] **Step 7: Commit**

```bash
git add pages/UserPlatformManagementPage.ts tests/user-platform/
git commit -m "test(user-platform): ปรับ E2E ให้ตรงกับทะเบียนผู้ถือสิทธิ์

หน้าเปลี่ยนจากไดเรกทอรีผู้ใช้เป็นทะเบียนผู้ถือสิทธิ์ — apiPath, empty state
และข้อความยืนยันว่า 'ไม่มีปุ่ม Add' ใช้ไม่ได้อีก และการยืนยันว่าตารางต้องไม่ว่าง
ก็ผูกกับว่าใครบังเอิญถือ role อยู่บน environment นั้น

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
