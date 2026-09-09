# Sortable Column Headers — Plan 1 of 3: Frontend bucket A (no backend dependency)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every column whose value is already on the page sorts on header click — the four raw `<Table>` edit-page sections, Tenant Migration's derived columns, two server-side columns the backend already sorts, and one bug where a non-sortable column is clickable.

**Architecture:** Move the existing in-memory sort helper to `src/utils/tableSort.ts`, add one shared `<SortableTableHead>` that draws the same arrows `DataTable` draws, and wire it into the four raw tables. `DataTable` pages only change column defs (`enableSorting` / `accessorFn`).

**Tech Stack:** React 18, TypeScript, TanStack Table (via `src/components/ui/data-table.tsx`), lucide-react icons, Bun.

**Spec:** `docs/superpowers/specs/2026-09-09-sortable-column-headers-design.md` — Part 1 only. Plans 2 (backend) and 3 (frontend bucket B) follow.

## Global Constraints

- Owner preference: **skip automated test steps** (no new `*.test.ts(x)`; do not run vitest per task). Static checks are mandatory: `bun run typecheck` and `bun run lint` after every task. Existing tests must still pass before merge (`bun run test` once, in Task 7).
- Never modify `src/components/ui/*` primitives. `SortableTableHead` lives in `src/components/`, not `src/components/ui/`.
- A TanStack display column (`id` + `cell`) needs an `accessorFn` or its header never becomes a button, even with `enableSorting: true`.
- Do **not** open any column whose sort key the backend does not know yet (`user_name`, `bu_code`, `element_id`, `app_name`, `access`, `severity`, `target`, `tags`, `updated_at` on News, `permission_count`, `bu_count`, `role_count`, license `status`). Those belong to Plan 3.
- Work on branch `feature/sortable-column-headers` (already exists, holds the spec). Commit after each task with the trailer `Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`.
- Edit files with Bash (`sed`, heredoc, or a short script) rather than editor tooling when commit cleanliness matters — the editor's format-on-save pollutes diffs.

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/tableSort.ts` (moved from `src/pages/clusterEdit/tableSort.ts`) | Pure sort state helpers: `SortState`, `cycleSort`, `compareValues`, `sortRows`. No React. |
| `src/utils/tableSort.test.ts` (moved with it) | Existing tests; import path unchanged (`./tableSort`). |
| `src/components/SortableTableHead.tsx` (new) | A `<TableHead>` whose content is a sort button with `ArrowUp` / `ArrowDown` / `ArrowUpDown`. Presentation only. |
| `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx` | Replace hand-rolled buttons with `SortableTableHead`; add Status. |
| `src/pages/clusterEdit/sections/UsersSection.tsx` | Add `sort` state + `SortableTableHead` on Name, Role, Status. |
| `src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx` | Add `sort` state + `SortableTableHead` on Name, Email, Username, BU Role, BU Status; keep the current fixed order as the unsorted order. |
| `src/pages/businessUnitEdit/sections/ConfigurationSection.tsx` | Add `sort` state + `SortableTableHead` on Key, Label, Type (read-only view only). |
| `src/pages/TenantMigrationManagement.tsx` | `accessorFn` on Status and Last checked. |
| `src/pages/clusterAdmin/BusinessUnitList.tsx` | Drop `enableSorting: false` on HQ. |
| `src/pages/broadcastManagement/broadcastColumns.tsx` | Drop the `enableSorting: false` override on Created; fix the stale comment. |
| `src/pages/cronjobs/CronJobManagement.tsx` | Add `enableSorting: false` on `bu`. |

---

### Task 1: Move `tableSort.ts` to `src/utils` and add `SortableTableHead`

**Files:**
- Move: `src/pages/clusterEdit/tableSort.ts` → `src/utils/tableSort.ts`
- Move: `src/pages/clusterEdit/tableSort.test.ts` → `src/utils/tableSort.test.ts`
- Modify: `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx:16` (import path only in this task)
- Create: `src/components/SortableTableHead.tsx`

**Interfaces:**
- Produces: `src/utils/tableSort.ts` exports unchanged — `type SortDir = 'asc' | 'desc'`, `interface SortState { key: string; dir: SortDir }`, `cycleSort(current: SortState | null, key: string): SortState | null`, `compareValues(a: unknown, b: unknown): number`, `sortRows<T>(rows: T[], state: SortState | null, accessor: (row: T, key: string) => unknown): T[]`.
- Produces: `SortableTableHead` props — `{ sortKey: string; sort: SortState | null; onSort: (key: string) => void; className?: string; children: React.ReactNode }`. Clicking calls `onSort(sortKey)`; the caller does `setSort((s) => cycleSort(s, key))`.

- [ ] **Step 1: Move the helper and its test with `git mv`**

```bash
git mv src/pages/clusterEdit/tableSort.ts src/utils/tableSort.ts
git mv src/pages/clusterEdit/tableSort.test.ts src/utils/tableSort.test.ts
```

- [ ] **Step 2: Fix the one page import**

```bash
grep -n "tableSort" src/utils/tableSort.test.ts
sed -i '' "s#from '../tableSort'#from '../../../utils/tableSort'#" src/pages/clusterEdit/sections/BusinessUnitsSection.tsx
```
Expected: the test file imports `./tableSort` (unchanged, still resolves); the section now imports `'../../../utils/tableSort'`.

- [ ] **Step 3: Create `src/components/SortableTableHead.tsx`**

```tsx
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from './ui/table';
import type { SortState } from '../utils/tableSort';

export interface SortableTableHeadProps {
  /** Key passed back to `onSort`; compared against `sort.key` to pick the arrow. */
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  className?: string;
  children: ReactNode;
}

/**
 * A `<TableHead>` whose label is a sort toggle, for the raw `<Table>` sections that do not go
 * through `DataTable`. Draws the same three arrows `data-table.tsx` draws so the two table
 * families read identically: neutral `ArrowUpDown` when inactive, `ArrowUp`/`ArrowDown` in the
 * primary colour when this column is the active sort. State lives with the caller
 * (`useState<SortState | null>` + `cycleSort`), so a section can also sort its rows in memory
 * with `sortRows` from the same module.
 */
export function SortableTableHead({ sortKey, sort, onSort, className, children }: SortableTableHeadProps) {
  const active = sort?.key === sortKey ? sort.dir : null;
  return (
    <TableHead
      className={className}
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {children}
        {active === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 text-primary" />
        ) : active === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}
```

- [ ] **Step 4: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/utils/tableSort.ts src/utils/tableSort.test.ts src/pages/clusterEdit/tableSort.ts src/pages/clusterEdit/tableSort.test.ts src/pages/clusterEdit/sections/BusinessUnitsSection.tsx src/components/SortableTableHead.tsx
git commit -m "refactor(table): move tableSort to utils and add SortableTableHead for raw tables

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 2: Cluster › Business Units section — use `SortableTableHead`, add Status

**Files:**
- Modify: `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx:2` (icon import), `:114-130` (header row)

**Interfaces:**
- Consumes: `SortableTableHead` from Task 1; `cycleSort`, `sortRows`, `SortState` from `src/utils/tableSort`. The module-level `accessor` already maps `code`, `name`, `status` (`is_active ? 1 : 0`) — no change to it.

- [ ] **Step 1: Swap imports**

Replace line 2 `import { RefreshCw, Pencil, ChevronsUpDown } from 'lucide-react';` with:
```ts
import { RefreshCw, Pencil } from 'lucide-react';
```
Add after the `AuditMeta` import:
```ts
import { SortableTableHead } from '../../../components/SortableTableHead';
```

- [ ] **Step 2: Replace the header cells**

Replace the `{(['code', 'name'] as const).map((key) => ( ... ))}` block (the `TableHead` with the inline `<button>` and `ChevronsUpDown`) and the following `<TableHead className="w-32">{t('common.status.label')}</TableHead>` with:

```tsx
                {/* Code is a 5-character chip, so it takes a fixed lane. Left to share the
                   auto layout it was handed 230px for 40px of content and pushed the name —
                   the thing you actually read the row by — a hand's width to the right, so
                   the row scanned as three islands instead of one line. Name keeps the
                   slack: its second line (the audit trail) is what genuinely wants it. */}
                <SortableTableHead sortKey="code" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-32">
                  {t('common.field.code')}
                </SortableTableHead>
                <SortableTableHead sortKey="name" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-96">
                  {t('common.field.name')}
                </SortableTableHead>
                {/* กว้างคงที่: ปล่อยให้ยืด แล้วคอลัมน์ชื่อจะถูกบีบขณะที่ช่องว่างไปกองอยู่
                    ระหว่างสถานะกับปุ่มแก้ไข · active (1) มาก่อน inactive (0) เมื่อเรียง desc */}
                <SortableTableHead sortKey="status" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-32">
                  {t('common.status.label')}
                </SortableTableHead>
```

Leave the two trailing `<TableHead aria-hidden="true" />` and `<TableHead className="w-12" />` as they are. `TableHead` stays imported because those two still use it.

- [ ] **Step 3: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: clean (lint flags `ChevronsUpDown` if the import was not removed).

- [ ] **Step 4: Commit**

```bash
git add src/pages/clusterEdit/sections/BusinessUnitsSection.tsx
git commit -m "feat(cluster): sortable Code/Name/Status headers on the Business Units section

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 3: Cluster › Users section — sort by Name, Role, Status

**Files:**
- Modify: `src/pages/clusterEdit/sections/UsersSection.tsx:1-20` (imports), `:44-64` (state + `rows`), `:143-145` (header cells)

**Interfaces:**
- Consumes: `SortableTableHead`, `cycleSort`, `sortRows`, `SortState`. `displayName(u)` already exists at module level.

- [ ] **Step 1: Imports**

After `import { InlineCell } from '../InlineCell';` add:
```ts
import { SortableTableHead } from '../../../components/SortableTableHead';
import { cycleSort, sortRows, type SortState } from '../../../utils/tableSort';
```

- [ ] **Step 2: Module-level accessor (after `displayName`)**

```ts
// คีย์ที่หัวคอลัมน์ส่งมา → ค่าที่ใช้เรียง · role ส่งค่าดิบ (admin < user) ซึ่งเรียงตรงกับป้ายทั้งสองภาษา
// · status: active (1) ก่อน inactive (0) เมื่อ desc
const sortAccessor = (u: ClusterUser, key: string): unknown => {
  if (key === 'name') return displayName(u);
  if (key === 'role') return u.role ?? 'user';
  if (key === 'status') return u.is_active !== false ? 1 : 0;
  return '';
};
```

- [ ] **Step 3: State and `rows`**

After `const [confirmRemoveOne, setConfirmRemoveOne] = useState<ClusterUser | null>(null);` add:
```ts
  const [sort, setSort] = useState<SortState | null>(null);
```
Change the `rows` memo so the filtered array is sorted before return, and add `sort` to its deps:
```ts
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = users.filter((u) => {
      if (term) {
        const hay = `${displayName(u)} ${u.email ?? ''} ${u.username ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      const active = u.is_active !== false;
      if (activeOnly && !active) return false;
      if (inactiveOnly && active) return false;
      return true;
    });
    return sortRows(filtered, sort, sortAccessor);
  }, [users, search, activeOnly, inactiveOnly, sort]);
```

- [ ] **Step 4: Header cells**

Replace
```tsx
                <TableHead className="w-96">{t('common.field.name')}</TableHead>
                <TableHead className="w-40">{t('pages.clusters.columnRole')}</TableHead>
                <TableHead className="w-28 text-center">{t('common.status.label')}</TableHead>
```
with
```tsx
                <SortableTableHead sortKey="name" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-96">
                  {t('common.field.name')}
                </SortableTableHead>
                <SortableTableHead sortKey="role" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-40">
                  {t('pages.clusters.columnRole')}
                </SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={(k) => setSort((s) => cycleSort(s, k))} className="w-28 text-center">
                  {t('common.status.label')}
                </SortableTableHead>
```
The explanatory comment block above the Name head stays where it is.

- [ ] **Step 5: Static checks, then commit**

Run: `bun run typecheck && bun run lint`
```bash
git add src/pages/clusterEdit/sections/UsersSection.tsx
git commit -m "feat(cluster): sortable Name/Role/Status headers on the Users section

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 4: BU Users card — sortable headers, existing order kept as default

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx:1` (React import), imports, `:34-46` (state), `:88-108` (header + row source)

**Interfaces:**
- Consumes: `SortableTableHead`, `cycleSort`, `sortRows`, `SortState`. Row type is the element type of `users.buUsers` (fields used: `firstname`, `middlename`, `lastname`, `email`, `username`, `role`, `is_active`).

- [ ] **Step 1: Imports**

Change line 1 to `import React, { useMemo, useState } from 'react';`. After the `roleLabels` import add:
```ts
import { SortableTableHead } from '../../components/SortableTableHead';
import { cycleSort, sortRows, type SortState } from '../../utils/tableSort';
```

- [ ] **Step 2: Module-level helpers (above the component)**

```ts
type BuUserRow = ReturnType<typeof useBusinessUnitUsers>['buUsers'][number];

const fullName = (u: BuUserRow): string =>
  [u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ').toLowerCase();

/** ลำดับเดิมของตาราง (ชื่อ → อีเมล → username) ใช้เมื่อยังไม่กดหัวคอลัมน์ใด */
const defaultOrder = (a: BuUserRow, b: BuUserRow): number => {
  const nameA = fullName(a);
  const nameB = fullName(b);
  if (nameA !== nameB) return nameA.localeCompare(nameB);
  const emailA = (a.email || '').toLowerCase();
  const emailB = (b.email || '').toLowerCase();
  if (emailA !== emailB) return emailA.localeCompare(emailB);
  return (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase());
};

const sortAccessor = (u: BuUserRow, key: string): unknown => {
  if (key === 'name') return fullName(u);
  if (key === 'email') return u.email ?? '';
  if (key === 'username') return u.username ?? '';
  if (key === 'role') return u.role ?? '';
  if (key === 'status') return u.is_active ? 1 : 0;
  return '';
};
```

- [ ] **Step 3: State + memo inside the component (after `showUsernameColumn`)**

```ts
  const [sort, setSort] = useState<SortState | null>(null);
  const onSort = (k: string) => setSort((s) => cycleSort(s, k));
  // เรียงตามค่าเริ่มต้นก่อนเสมอ แล้วค่อยทับด้วยหัวคอลัมน์ที่กด — Array.prototype.sort เป็น stable
  // sort จึงคงลำดับชื่อ→อีเมลไว้เป็น tie-break ให้แถวที่ค่าเท่ากัน
  const sortedUsers = useMemo(
    () => sortRows([...users.buUsers].sort(defaultOrder), sort, sortAccessor),
    [users.buUsers, sort],
  );
```

- [ ] **Step 4: Header cells and row source**

Replace the header row body:
```tsx
                <TableHead className="w-10 text-center">#</TableHead>
                <SortableTableHead sortKey="name" sort={sort} onSort={onSort}>{t('common.field.name')}</SortableTableHead>
                <SortableTableHead sortKey="email" sort={sort} onSort={onSort}>{t('common.field.email')}</SortableTableHead>
                {showUsernameColumn && (
                  <SortableTableHead sortKey="username" sort={sort} onSort={onSort}>{t('common.field.username')}</SortableTableHead>
                )}
                <SortableTableHead sortKey="role" sort={sort} onSort={onSort}>{t('common.label.buRole')}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={onSort} className="text-center">
                  {t('pages.businessUnits.buStatusLabel')}
                </SortableTableHead>
                {canEdit && <TableHead className="w-10" />}
```
Replace `{[...users.buUsers].sort((a, b) => { ... }).map((u, idx) => (` (the whole inline comparator, lines ~100-108) with:
```tsx
              {sortedUsers.map((u, idx) => (
```

- [ ] **Step 5: Static checks, then commit**

Run: `bun run typecheck && bun run lint`
```bash
git add src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx
git commit -m "feat(bu): sortable headers on the Users card, default order unchanged

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 5: BU Configuration section (read-only view) — sort by Key, Label, Type

**Files:**
- Modify: `src/pages/businessUnitEdit/sections/ConfigurationSection.tsx:1` (React import), imports, component body, `:96-99` (header), `:102` (row source)

**Interfaces:**
- Consumes: `SortableTableHead`, `cycleSort`, `sortRows`, `SortState`; `BusinessUnitConfig` from `src/types` (fields `key`, `label`, `datatype`, `value`).

- [ ] **Step 1: Imports**

Line 1 → `import React, { useMemo, useState } from 'react';`. After the `SectionFieldProps` import add:
```ts
import { SortableTableHead } from '../../../components/SortableTableHead';
import { cycleSort, sortRows, type SortState } from '../../../utils/tableSort';
```

- [ ] **Step 2: Accessor above the component**

```ts
const sortAccessor = (item: BusinessUnitConfig, key: string): unknown => {
  if (key === 'key') return item.key ?? '';
  if (key === 'label') return item.label ?? '';
  if (key === 'datatype') return item.datatype ?? '';
  return '';
};
```

- [ ] **Step 3: State inside the component (after `const { t } = useI18n();`)**

```ts
  const [sort, setSort] = useState<SortState | null>(null);
  const onSort = (k: string) => setSort((s) => cycleSort(s, k));
  // เฉพาะมุมมองอ่านอย่างเดียว — ตอนแก้ไขแถวผูกกับ index ของ formData.config จึงห้ามเรียง
  const viewRows = useMemo(() => sortRows(formData.config, sort, sortAccessor), [formData.config, sort]);
```

- [ ] **Step 4: Header + rows in the read-only branch**

```tsx
                  <TableRow>
                    <SortableTableHead sortKey="key" sort={sort} onSort={onSort}>{t('pages.businessUnits.configKeyLabel')}</SortableTableHead>
                    <SortableTableHead sortKey="label" sort={sort} onSort={onSort}>{t('pages.businessUnits.configLabelField')}</SortableTableHead>
                    <SortableTableHead sortKey="datatype" sort={sort} onSort={onSort}>{t('common.field.type')}</SortableTableHead>
                    <TableHead>{t('pages.businessUnits.configValueLabel')}</TableHead>
                  </TableRow>
```
and `{formData.config.map((item, index) => (` → `{viewRows.map((item, index) => (` (the `key={index}` stays; rows are read-only here).

- [ ] **Step 5: Static checks, then commit**

Run: `bun run typecheck && bun run lint`
```bash
git add src/pages/businessUnitEdit/sections/ConfigurationSection.tsx
git commit -m "feat(bu): sortable Key/Label/Type headers on the read-only Configuration table

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 6: `DataTable` pages — Tenant Migration, HQ, Broadcast Created, Cron BU fix

**Files:**
- Modify: `src/pages/TenantMigrationManagement.tsx:61-68` (rank), `:403-458` (columns)
- Modify: `src/pages/clusterAdmin/BusinessUnitList.tsx:258-264`
- Modify: `src/pages/broadcastManagement/broadcastColumns.tsx:143-155`
- Modify: `src/pages/cronjobs/CronJobManagement.tsx:220-224`

**Interfaces:**
- Consumes: `rowStatusOf(rs)` (exported from `TenantMigrationManagement.tsx:61`, returns `RowStatus = 'up_to_date' | 'pending' | 'error' | 'unknown'`), `rowState` (page state keyed by BU id, `lastChecked?: string` formatted `HH:mm:ss`). The `columns` memo deps at `:492` already include `rowState`.

- [ ] **Step 1: Tenant Migration — Status column**

Add a module-level rank right after `rowStatusOf`:
```ts
// ลำดับสถานะสำหรับเรียงคอลัมน์: ปัญหาก่อน (error) → ค้าง → ไม่รู้ → ทันสมัย — asc คือ "ต้องดูก่อน"
const STATUS_RANK: Record<RowStatus, number> = { error: 0, pending: 1, unknown: 2, up_to_date: 3 };
```
In the `status` column def, replace `enableSorting: false,` with:
```ts
      accessorFn: (row) => STATUS_RANK[rowStatusOf(rowState[row.id])],
```

- [ ] **Step 2: Tenant Migration — Last checked column**

Replace `enableSorting: false,` in the `last_checked` column with:
```ts
      // 'HH:mm:ss' เรียงเป็นสตริงได้ตรงตามเวลา; แถวที่ยังไม่เคยเช็คไปหัวด้วย '' ตอน asc
      accessorFn: (row) => rowState[row.id]?.lastChecked ?? '',
```

- [ ] **Step 3: HQ column (cluster-admin BU list)**

In `src/pages/clusterAdmin/BusinessUnitList.tsx`, the `accessorKey: 'is_hq'` column: delete the line `enableSorting: false,`. Backend `listBusinessUnit` passes the caller's `orderBy` through and `is_hq` is a real column, so `sort=is_hq:desc` works today.

- [ ] **Step 4: Broadcast Created column**

In `src/pages/broadcastManagement/broadcastColumns.tsx`, replace the comment block at lines 143-150 and the `{ ...createdColumn, enableSorting: false, meta: ... }` entry with:
```ts
    // ใช้ของกลาง (normalizeAudit รองรับ created_by แบบ object { id, name } ของ BroadcastListItem)
    // คง headerClassName/cellClassName/card: 'hidden' ไว้ — คอลัมน์นี้ไม่เคยแสดงบนการ์ดมือถือ ·
    // เรียงได้: รายการฝั่ง admin อยู่ที่ broadcast-admin.service.ts ซึ่งมี whitelist
    // created_at/scheduled_at/end_at/title และ created_at เป็น default อยู่แล้ว (comment เดิมชี้ไปที่
    // broadcast.service.ts ซึ่งเป็น feed ฝั่งผู้รับ ไม่ใช่ endpoint ของหน้านี้)
    {
      ...createdColumn,
      meta: { ...createdColumn.meta, headerClassName: 'w-32', cellClassName: 'w-32', card: 'hidden' },
    },
```

- [ ] **Step 5: Cron Jobs BU column — make it inert**

In `src/pages/cronjobs/CronJobManagement.tsx`, inside the `id: 'bu'` column add after the `accessorFn` line:
```ts
      // accessorFn อยู่เพื่อการ์ดมือถือ/ค้นหา แต่ทำให้ TanStack ถือว่าเรียงได้ — ต้องปิดชัด ๆ
      enableSorting: false,
```

- [ ] **Step 6: Static checks, then commit**

Run: `bun run typecheck && bun run lint`
```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/clusterAdmin/BusinessUnitList.tsx src/pages/broadcastManagement/broadcastColumns.tsx src/pages/cronjobs/CronJobManagement.tsx
git commit -m "feat(tables): open sort on Tenant Migration status/last-checked, BU HQ, Broadcast Created; close Cron BU

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 7: Verify in the browser and open the PR

**Files:** none modified.

- [ ] **Step 1: Full suite once**

Run: `bun run test`
Expected: all green (the moved `tableSort.test.ts` included).

- [ ] **Step 2: Start the dev server and click every new header**

Run: `bun run dev:localhost` (port 3304; only one dev server can run at a time). With the Chrome tools, visit and click each header twice, watching the rows reorder and the arrow go asc → desc → neutral:
- `/clusters/<id>/edit` › Business Units tab: Code, Name, Status
- `/clusters/<id>/edit` › Users tab: Name, Role, Status
- `/business-units/<id>/edit` › Users card: Name, Email, (Username if shown), BU Role, BU Status — with no header active the order must equal the pre-change order (name → email → username)
- `/business-units/<id>/edit` › Configuration in read-only mode: Key, Label, Type
- `/tenant-migration`: Status, Last checked (after "Check all" so `lastChecked` is populated)
- cluster-admin BU list (`/cluster-admin/<id>/business-units`): HQ — the network request carries `sort=is_hq:desc` and the response reorders
- `/broadcasts`: Created — the network request carries `sort=created_at:asc`
- `/cronjobs`: Business Unit header shows **no** arrow and is not a button

If a header click does not register through `computer left_click`, run `th.querySelector('button').click()` through the JavaScript tool before concluding it is broken.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/sortable-column-headers
gh pr create --title "feat(tables): sortable headers on raw edit-page tables + open already-supported columns" --body-file "$SCRATCH/pr1.md"
gh pr merge --auto --squash
```
PR body: list the eight surfaces from Step 2 and note that bucket B columns wait for the backend PR (Plan 2). End the body with `https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`. `gh pr create` with a heredoc body trips the gate hook — write the body to the scratchpad and use `--body-file`. Do not wait on CI in a loop; `--auto` merges when checks pass.
