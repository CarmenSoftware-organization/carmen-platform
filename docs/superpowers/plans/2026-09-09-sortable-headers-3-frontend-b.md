# Sortable Column Headers — Plan 3 of 3: Frontend bucket B (opens the columns Plan 2 made sortable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The remaining twelve data columns become clickable sort headers, sending the exact keys the backend now accepts, and the change is proven on DEV before production.

**Architecture:** Column-def edits only — drop `enableSorting: false`, add an `accessorFn` to display columns so TanStack turns the header into a button. No new components. Ships only after Plan 2 is live on DEV.

**Tech Stack:** React 18, TypeScript, TanStack Table via `src/components/ui/data-table.tsx`, Bun.

**Spec:** `docs/superpowers/specs/2026-09-09-sortable-column-headers-design.md` — Part 1a rows marked bucket B, Part 3.

## Global Constraints

- **Precondition:** Plan 2 merged and proven on DEV (its Task 10 Step 3). Opening a column early yields 500/422 on every click.
- Owner preference: skip automated test steps; `bun run typecheck` and `bun run lint` after every task; `bun run test` once before the PR.
- Never modify `src/components/ui/*`.
- Sort key = the column `id` (or `accessorKey`). They must match Plan 2 exactly: `user_name`, `bu_code`, `element_id`, `app_name`, `access`, `severity`, `target`, `tags`, `updated_at`, `permission_count`, `bu_count`, `role_count`, `status`.
- Branch: continue on `feature/sortable-column-headers` after Plan 1's PR merged (`git fetch origin && git rebase origin/main`), or a fresh `feature/sortable-column-headers-b` from `main` if the first branch was deleted on merge.
- Commit trailer: `Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`.
- Verified while planning: `StatusFilterValue = 'active' | 'superseded' | 'scheduled' | 'expired' | 'cancelled'`; the User Platform column id `'roles'` appears once (line 332).

## File Structure

| File | Columns |
|---|---|
| `src/pages/ActivityEventManagement.tsx` | User, BU, Element, App |
| `src/pages/ApplicationManagement.tsx` | Access |
| `src/pages/broadcastManagement/broadcastColumns.tsx` | Severity |
| `src/pages/NewsManagement.tsx` | Target, Tags, Updated |
| `src/pages/RoleManagement.tsx` | Permissions |
| `src/pages/UserManagement.tsx` | BU |
| `src/pages/UserPlatformManagement.tsx` | Roles/Scope |
| `src/pages/licenses/PurchaseLicenseTable.tsx` | Status |

---

### Task 1: Activity Events, Applications, Broadcast, News

**Files:**
- Modify: `src/pages/ActivityEventManagement.tsx:153-197`
- Modify: `src/pages/ApplicationManagement.tsx:324-338`
- Modify: `src/pages/broadcastManagement/broadcastColumns.tsx:83-100`
- Modify: `src/pages/NewsManagement.tsx:395-455`

- [ ] **Step 1: Activity Events — delete `enableSorting: false` on four columns**

The columns `user_name`, `bu_code`, `element_id`, `app_name` all have `accessorKey`, so deleting the line is enough. Backend keys are the same strings (Plan 2 Task 7).

- [ ] **Step 2: Applications — Access**

In the `id: 'access'` column, replace `enableSorting: false,` with:
```ts
      // ค่าที่ accessor คืนไม่ถูกใช้เรียง (server-side) แต่ต้องมีเพื่อให้ TanStack เปิดปุ่มที่หัวคอลัมน์
      // backend เรียง allow_all ก่อน แล้วตามจำนวน API ที่ยังไม่ถูกลบ (application.service.ts `access`)
      accessorFn: (row) => (row.allow_all ? Number.MAX_SAFE_INTEGER : (row.api_names?.length ?? 0)),
```

- [ ] **Step 3: Broadcast — Severity**

In `broadcastColumns.tsx`, the `id: 'severity'` column: replace `enableSorting: false,` with:
```ts
      // server-side: broadcast-admin.service.ts เรียงเป็น bucket CRITICAL → WARNING → INFO → MAINTENANCE → ว่าง
      accessorFn: (row) => row.severity ?? '',
```

- [ ] **Step 4: News — Target, Tags, Updated**

`id: 'target'`: replace `enableSorting: false,` with
```ts
      // Global (อาร์เรย์ว่าง) มาก่อนตอน asc แล้วตามจำนวน BU — นิยามเดียวกับ news.service.ts `target`
      accessorFn: (row) => row.business_unit_ids?.length ?? 0,
```
`id: 'tags'`: replace `enableSorting: false,` with
```ts
      accessorFn: (row) => row.tags?.length ?? 0,
```
`id: 'updated_at'`: replace `enableSorting: false,` with
```ts
      accessorKey: 'updated_at',
```
(keep `id: 'updated_at'` so the wire key stays `updated_at`).

- [ ] **Step 5: Static checks, commit**

```bash
bun run typecheck && bun run lint
git add src/pages/ActivityEventManagement.tsx src/pages/ApplicationManagement.tsx src/pages/broadcastManagement/broadcastColumns.tsx src/pages/NewsManagement.tsx
git commit -m "feat(tables): open sort on Activity Events user/BU/element/app, Applications access, Broadcast severity, News target/tags/updated

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 2: Roles, Users, User Platform, License Status

**Files:**
- Modify: `src/pages/RoleManagement.tsx:273-282`
- Modify: `src/pages/UserManagement.tsx:482-500`
- Modify: `src/pages/UserPlatformManagement.tsx:331-339`
- Modify: `src/pages/licenses/PurchaseLicenseTable.tsx:40` (rank const) and `:513-527` (column)

- [ ] **Step 1: Roles — Permissions**

`id: 'permission_count'`: replace `enableSorting: false,` with
```ts
      accessorFn: (row) => row.permission_count ?? 0,
```

- [ ] **Step 2: Users — BU**

`id: "bu_count"`: replace `enableSorting: false,` with
```ts
        // เรียงตาม total (ตัวเลขหลัง /) — backend ใช้ _count ของ relation เดียวกับที่ประกอบ business_unit
        accessorFn: (row) => row.business_unit?.length ?? 0,
```

- [ ] **Step 3: User Platform — Roles/Scope**

The column at line 332: change `id: 'roles'` → `id: 'role_count'` and replace `enableSorting: false,` with
```ts
      accessorFn: (row) => row.roles?.length ?? 0,
```

- [ ] **Step 4: License purchase tables — Status**

Add next to `STATUS_VARIANT` (module scope, ~line 40):
```ts
/** ลำดับเดียวกับ bucket ฝั่ง backend — ใช้แค่ให้ accessorFn มีค่า ไม่ได้ใช้เรียงจริง · superseded อยู่กับ active
 *  เพราะ backend ไม่แยก (ใบที่ถูกแทนที่ยังอยู่ในช่วงวันของตัวเอง) */
const STATUS_SORT_RANK: Record<StatusFilterValue, number> = {
  active: 0, superseded: 0, scheduled: 1, expired: 2, cancelled: 3,
};
```
In the `id: 'status'` column, replace the comment `// คำนวณฝั่ง FE จากวันที่ ไม่ใช่คอลัมน์จริงบน backend (controller ruling R21) — เรียงไม่ได้` and `enableSorting: false,` with:
```ts
        // เรียงได้แล้ว (2026-09-09): backend คำนวณสถานะจากวันที่ด้วยกติกาเดียวกับ utils/buLicense.ts และ
        // แบ่งหน้าเป็น bucket active → scheduled → expired → cancelled (business-unit-license.service.ts
        // และพี่น้อง) — ค่าที่ accessor คืนไม่ถูกใช้เรียง แต่ต้องมีเพื่อเปิดปุ่มที่หัวคอลัมน์
        accessorFn: (row) => STATUS_SORT_RANK[row.status],
```
The FE `withTiebreaker` will send `status:asc,id:asc`; Plan 2's `takeSortKey` reads only the first key.

- [ ] **Step 5: Static checks, commit**

```bash
bun run typecheck && bun run lint
git add src/pages/RoleManagement.tsx src/pages/UserManagement.tsx src/pages/UserPlatformManagement.tsx src/pages/licenses/PurchaseLicenseTable.tsx
git commit -m "feat(tables): open sort on Roles permissions, Users BU, User Platform roles, License status

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 3: Verify against DEV, PR, production

**Files:** none.

- [ ] **Step 1: Full suite**

Run: `bun run test` — all green.

- [ ] **Step 2: Browser check against the DEV backend**

Run `bun run dev:dev` (local UI, DEV backend). For each column below, click the header twice and confirm (a) the arrow flips asc → desc, (b) the network request carries the expected `sort=`, (c) the rows reorder, (d) page 2 has no row from page 1:
- `/activity-events`: User, BU, Element, App
- `/applications`: Access — allow-all apps first on desc
- `/broadcasts`: Severity — CRITICAL first on asc, rows without severity last
- `/news`: Target (Global first on asc), Tags, Updated; also confirm Status and Published now reorder (they were no-ops before Plan 2)
- `/roles`: Permissions
- `/users`: BU
- `/user-platform`: Roles/Scope
- `/licenses` seat, BU-quota and interface tabs: Status — with and without a status filter chip active
If `computer left_click` does not register on a header, use `th.querySelector('button').click()` through the JavaScript tool.

- [ ] **Step 3: PR + merge (auto-deploys DEV) + verify on the DEV host, then production**

```bash
git push -u origin <branch>
gh pr create --title "feat(tables): open sort on every backend-derived column (backend PR merged)" --body-file "$SCRATCH/pr3.md"
gh pr merge --auto --squash
```
After merge, repeat Step 2's spot checks on `http://dev.blueledgers.com:9902` (http, not https). Then ship production: `git push origin main:vercel`, and confirm the Vercel deployment for that commit succeeded before reporting done. Do not touch the `DEV`/`UAT` branches. End the PR body with `https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`.
