# Report Form Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/report-form-groups` "Form Groups" config page that groups form-type report templates by `report_group`, lets an admin switch the per-group default (radio + confirm, unset-then-set), toggle a template active/inactive inline, add a template pre-scoped to a group, and open any template in the existing Edit page.

**Architecture:** A configuration page (card-per-group, no server DataTable) that fetches all form templates once and groups them client-side. The default swap is a two-write orchestration (unset old → set new) behind a service helper. A presentational `GroupCard` renders each group; the page owns fetch, grouping, the confirm dialog, and all write handlers. A shared constant module holds the fixed group codes; the Edit page reuses it and gains `location.state` pre-fill for the "+ Add" flow.

**Tech Stack:** React 19 + TypeScript (strict), react-router-dom v6, Tailwind + shadcn/ui primitives, axios service layer, sonner toasts, lucide-react icons.

## Global Constraints

- **No automated tests this build** (per repo CLAUDE.md rule 3): do NOT create `*.test.tsx` files. Verify each task with `bunx tsc --noEmit` (type + unused-symbol gate) and manual checks; run `CI=true bun run build` as the final gate. Tests are added only if the user asks in that turn.
- **Base path** for all report-template calls: `/api-system/report-templates` (absolute `baseURL`, never proxied).
- **Response unwrap:** `response.data?.data ?? response.data ?? response`; list items may be a bare array or nested under `.data`.
- **doc_version** (CLAUDE.md rule 17): send the token only when the loaded record carried one (`getDocVersion(record) != null`). Never store it in form state. `409` conflict → `notifyVersionConflict()` + refetch.
- **Backend update semantics:** PUT preserves fields omitted from the payload (documented in `ReportTemplateEdit.tsx` submit comment). Partial writes `{ is_default }` / `{ is_active }` are safe.
- **Naming:** groups are shown by **bare code** (PR, PO, …). No human-readable labels.
- **Never** use `alert()`/`window.confirm()` (use `toast.*` + `ConfirmDialog`); status via `<Badge variant="success"|"secondary">`, never raw green.
- **Fixed group codes** (canonical order): `PR, PO, GRN, SR, CN, SI, SO, IA, PC, SC, RFP, EOP`.

---

## File Structure

| File | Responsibility |
|---|---|
| 🆕 `src/constants/reportGroups.ts` | Single source of the 12 fixed group codes + type. Imported by the page and the Edit page. |
| 🆕 `src/pages/reportFormGroups/GroupCard.tsx` | Presentational card for one group: default radios, rows, badges, Edit/Add/⋯ actions. No fetch, no writes. |
| 🆕 `src/pages/ReportFormGroupManagement.tsx` | Orchestrator: fetch-all, client grouping (`useMemo`), toolbar, confirm dialog, set-default/toggle-active handlers, debug sheet. |
| ✏️ `src/services/reportTemplateService.ts` | Add `setGroupDefault({ current, target })` (unset→set orchestration). |
| ✏️ `src/pages/ReportTemplateEdit.tsx` | Import codes from the new module; seed `formData` from `location.state` on the new path. |
| ✏️ `src/App.tsx` | Lazy import + route `/report-form-groups`. |
| ✏️ `src/components/Layout.tsx` | Nav item "Form Groups" in the `Content` group. |

---

### Task 1: Shared group-code constant + rewire Edit page

**Files:**
- Create: `src/constants/reportGroups.ts`
- Modify: `src/pages/ReportTemplateEdit.tsx:38-40` (remove local const), `src/pages/ReportTemplateEdit.tsx:29` (add import)

**Interfaces:**
- Produces: `export const FORM_REPORT_GROUPS` (readonly tuple of 12 codes) and `export type FormReportGroupCode = typeof FORM_REPORT_GROUPS[number]`.

- [ ] **Step 1: Create the constant module**

Create `src/constants/reportGroups.ts`:

```ts
// Fixed report-group codes for form-type report templates. The stored
// report_group value === the bare code. This order is the canonical display
// order for the Form Groups page and the Edit-page select. Legacy report_group
// values present in data but absent here are handled by the page at runtime,
// not by this list.
export const FORM_REPORT_GROUPS = [
  'PR', 'PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'IA', 'PC', 'SC', 'RFP', 'EOP',
] as const;

export type FormReportGroupCode = (typeof FORM_REPORT_GROUPS)[number];
```

- [ ] **Step 2: Remove the duplicate const from the Edit page**

In `src/pages/ReportTemplateEdit.tsx`, delete these lines (currently 37-40):

```tsx
// Report Group choices when template_type === 'form'. Stored value === the code.
const FORM_REPORT_GROUPS = [
  'PR', 'PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'IA', 'PC', 'SC', 'RFP', 'EOP',
] as const;
```

- [ ] **Step 3: Import the shared const in the Edit page**

In `src/pages/ReportTemplateEdit.tsx`, add after the existing import block (e.g. after line 29, `import { HIT_SLOP_44 } from '../lib/hitSlop';`):

```tsx
import { FORM_REPORT_GROUPS } from '../constants/reportGroups';
```

The existing usages — `FORM_REPORT_GROUPS.includes(formData.report_group as typeof FORM_REPORT_GROUPS[number])` and `FORM_REPORT_GROUPS.map(...)` — are unchanged and still type-check against the imported tuple.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors (a pure move; no behavior change).

- [ ] **Step 5: Commit**

```bash
git add src/constants/reportGroups.ts src/pages/ReportTemplateEdit.tsx
git commit -m "refactor(report-templates): extract FORM_REPORT_GROUPS to shared constant"
```

---

### Task 2: `setGroupDefault` service helper

**Files:**
- Modify: `src/services/reportTemplateService.ts` (add a method to the `reportTemplateService` object, after `update`, before `delete`)

**Interfaces:**
- Consumes: existing `api` (axios), `/api-system/report-templates/:id` PUT.
- Produces: `reportTemplateService.setGroupDefault({ current, target }): Promise<void>` where
  `current: { id: string; doc_version?: number } | null` and `target: { id: string; doc_version?: number }`.

- [ ] **Step 1: Add the helper method**

In `src/services/reportTemplateService.ts`, insert this method inside the `reportTemplateService` object, immediately after the `update` method (after its closing `},` near line 77):

```ts
  /**
   * Switch the default form template within a report_group. Enforces the
   * "at most one default per group" invariant client-side by UNSETTING the
   * current default before SETTING the new one — the DB partial unique index
   * would reject two live defaults, so ordering here is load-bearing.
   *
   * Both writes are partial PUTs: the backend preserves fields omitted from an
   * update payload (see ReportTemplateEdit submit comment), so sending only
   * { is_default, doc_version } leaves the rest of each record intact.
   */
  setGroupDefault: async ({
    current,
    target,
  }: {
    current: { id: string; doc_version?: number } | null;
    target: { id: string; doc_version?: number };
  }): Promise<void> => {
    if (current && current.id === target.id) return;
    if (current) {
      await api.put(`/api-system/report-templates/${current.id}`, {
        is_default: false,
        ...(current.doc_version != null ? { doc_version: current.doc_version } : {}),
      });
    }
    await api.put(`/api-system/report-templates/${target.id}`, {
      is_default: true,
      ...(target.doc_version != null ? { doc_version: target.doc_version } : {}),
    });
  },
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/reportTemplateService.ts
git commit -m "feat(report-templates): add setGroupDefault unset-then-set helper"
```

---

### Task 3: `GroupCard` presentational component

**Files:**
- Create: `src/pages/reportFormGroups/GroupCard.tsx`

**Interfaces:**
- Consumes: `ReportTemplate` (from `reportTemplateService`).
- Produces: `export const GroupCard: React.FC<GroupCardProps>` and `export interface GroupCardProps` with fields:
  `code: string`, `templates: ReportTemplate[]` (pre-filtered + pre-sorted default-first), `canWrite: boolean`, `canCreate: boolean`, `busy: boolean`,
  `onRequestDefault: (target: ReportTemplate) => void`, `onToggleActive: (t: ReportTemplate) => void`, `onAdd: (code: string) => void`.

- [ ] **Step 1: Create the component**

Create `src/pages/reportFormGroups/GroupCard.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import type { ReportTemplate } from '../../services/reportTemplateService';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { EmptyState } from '../../components/EmptyState';
import { Plus, Pencil, MoreHorizontal, FileText, AlertTriangle } from 'lucide-react';

export interface GroupCardProps {
  code: string;
  /** Already filtered (search/active) and sorted (default first, then name). */
  templates: ReportTemplate[];
  canWrite: boolean;
  canCreate: boolean;
  busy: boolean;
  onRequestDefault: (target: ReportTemplate) => void;
  onToggleActive: (t: ReportTemplate) => void;
  onAdd: (code: string) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  code,
  templates,
  canWrite,
  canCreate,
  busy,
  onRequestDefault,
  onToggleActive,
  onAdd,
}) => {
  const hasDefault = templates.some((t) => t.is_default);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Badge variant="outline" className="font-mono">{code}</Badge>
          <span className="text-xs font-normal text-muted-foreground">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </span>
        </CardTitle>
        {canCreate && (
          <Button variant="outline" size="sm" onClick={() => onAdd(code)}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No form templates"
            description={`No form templates in ${code} yet.`}
          />
        ) : (
          <div className="space-y-1">
            {!hasDefault && (
              <div
                role="status"
                className="mb-2 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                No default set — pick one.
              </div>
            )}
            {templates.map((t) => {
              const disableRadio = !canWrite || !t.is_active || busy;
              const lockDeactivate = t.is_default && t.is_active;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <label
                    className="flex items-center"
                    title={!t.is_active ? 'Activate the template to make it the default' : undefined}
                  >
                    <input
                      type="radio"
                      name={`default-${code}`}
                      className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      checked={!!t.is_default}
                      disabled={disableRadio}
                      onChange={() => onRequestDefault(t)}
                      aria-label={`Set ${t.name} as default for ${code}`}
                    />
                  </label>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                  </div>

                  <Badge variant={t.is_active ? 'success' : 'secondary'}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant={t.is_standard ? 'default' : 'outline'}>
                    {t.is_standard ? 'Standard' : 'Custom'}
                  </Badge>

                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/report-templates/${t.id}/edit`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Link>
                  </Button>

                  {canWrite && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${t.name}`}
                          disabled={busy}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={lockDeactivate}
                          onClick={() => onToggleActive(t)}
                        >
                          {t.is_active ? 'Deactivate' : 'Activate'}
                          {lockDeactivate ? ' (default)' : ''}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (The component is not yet imported anywhere; tsc validates it in isolation.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/reportFormGroups/GroupCard.tsx
git commit -m "feat(report-templates): add GroupCard for Form Groups page"
```

---

### Task 4: `ReportFormGroupManagement` page

**Files:**
- Create: `src/pages/ReportFormGroupManagement.tsx`

**Interfaces:**
- Consumes: `reportTemplateService.getAll` / `.update` / `.setGroupDefault` (Task 2), `GroupCard` (Task 3), `FORM_REPORT_GROUPS` (Task 1), `getDocVersion` / `isVersionConflict` / `notifyVersionConflict`, `getErrorDetail` / `devLog`, `useAuth().hasPermission`.
- Produces: `export default ReportFormGroupManagement` (consumed by Task 5 route).

- [ ] **Step 1: Create the page**

Create `src/pages/ReportFormGroupManagement.tsx`:

```tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { FORM_REPORT_GROUPS } from '../constants/reportGroups';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { GroupCard } from './reportFormGroups/GroupCard';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

interface GroupView {
  code: string;
  isLegacy: boolean;
  rows: ReportTemplate[];
}

interface PendingDefault {
  code: string;
  target: ReportTemplate;
  current: ReportTemplate | null;
}

const NONE_CODE = '(none)';

const ReportFormGroupManagement: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('report_template.update');
  const canCreate = hasPermission('report_template.create');

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [pendingDefault, setPendingDefault] = useState<PendingDefault | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const response: any = await reportTemplateService.getAll({
        perpage: -1,
        sort: 'name:asc',
        advance: JSON.stringify({ where: { template_type: 'form', deleted_at: null } }),
      });
      setRawResponse(response);
      const inner = response.data?.data ?? response.data ?? response;
      const items = Array.isArray(inner) ? inner : (inner?.data ?? []);
      setTemplates(Array.isArray(items) ? items : []);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load form templates: ' + getErrorDetail(err));
      devLog('Error fetching form templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const groups = useMemo<GroupView[]>(() => {
    const q = search.trim().toLowerCase();
    const rowVisible = (code: string, t: ReportTemplate) => {
      if (activeOnly && !t.is_active) return false;
      if (!q) return true;
      return code.toLowerCase().includes(q) || (t.name ?? '').toLowerCase().includes(q);
    };
    const sortRows = (rows: ReportTemplate[]) =>
      [...rows].sort((a, b) => {
        if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });

    const byGroup = new Map<string, ReportTemplate[]>();
    for (const t of templates) {
      const code = t.report_group || NONE_CODE;
      const bucket = byGroup.get(code);
      if (bucket) bucket.push(t);
      else byGroup.set(code, [t]);
    }

    const fixedCodes = FORM_REPORT_GROUPS as readonly string[];
    const build = (code: string, isLegacy: boolean): GroupView => ({
      code,
      isLegacy,
      rows: sortRows((byGroup.get(code) ?? []).filter((t) => rowVisible(code, t))),
    });

    // Fixed 12 always render when there is no query; under a query, keep only
    // groups whose code matches or that still have matching rows.
    const fixed = fixedCodes
      .map((c) => build(c, false))
      .filter((g) => (!q ? true : g.code.toLowerCase().includes(q) || g.rows.length > 0));

    // Legacy groups exist only because they hold data; show them when they have
    // at least one visible row.
    const legacy = Array.from(byGroup.keys())
      .filter((c) => !fixedCodes.includes(c))
      .sort((a, b) => a.localeCompare(b))
      .map((c) => build(c, true))
      .filter((g) => g.rows.length > 0);

    return [...fixed, ...legacy];
  }, [templates, search, activeOnly]);

  const requestDefault = (target: ReportTemplate) => {
    const code = target.report_group || NONE_CODE;
    const current =
      templates.find(
        (t) => (t.report_group || NONE_CODE) === code && t.is_default && t.id !== target.id,
      ) ?? null;
    setPendingDefault({ code, target, current });
  };

  const confirmDefault = async () => {
    if (!pendingDefault) return;
    const { code, target, current } = pendingDefault;
    setBusyGroup(code);
    try {
      await reportTemplateService.setGroupDefault({
        current: current ? { id: current.id, doc_version: getDocVersion(current) } : null,
        target: { id: target.id, doc_version: getDocVersion(target) },
      });
      toast.success(`Set "${target.name}" as default for ${code}`);
      setPendingDefault(null);
      await fetchAll();
    } catch (err: unknown) {
      if (isVersionConflict(err)) notifyVersionConflict();
      else toast.error('Failed to set default: ' + getErrorDetail(err));
      setPendingDefault(null);
      await fetchAll();
    } finally {
      setBusyGroup(null);
    }
  };

  const toggleActive = async (t: ReportTemplate) => {
    const code = t.report_group || NONE_CODE;
    const version = getDocVersion(t);
    setBusyGroup(code);
    try {
      await reportTemplateService.update(t.id, {
        is_active: !t.is_active,
        ...(version != null ? { doc_version: version } : {}),
      });
      toast.success(t.is_active ? `Deactivated "${t.name}"` : `Activated "${t.name}"`);
      await fetchAll();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchAll();
      } else {
        toast.error('Failed to update: ' + getErrorDetail(err));
      }
    } finally {
      setBusyGroup(null);
    }
  };

  const handleAdd = (code?: string) => {
    navigate('/report-templates/new', {
      state: { template_type: 'form', ...(code && code !== NONE_CODE ? { report_group: code } : {}) },
    });
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Form Groups"
          subtitle="Manage the default form template for each report group"
          actions={
            <Can permission="report_template.create">
              <Button size="sm" onClick={() => handleAdd()}>
                <Plus className="mr-2 h-4 w-4" />
                New Form Template
              </Button>
            </Can>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group code or template name…"
                className="pl-9"
                aria-label="Search form groups"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active only
            </label>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No groups match your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <GroupCard
                key={g.code}
                code={g.code}
                templates={g.rows}
                canWrite={canWrite}
                canCreate={canCreate}
                busy={busyGroup === g.code}
                onRequestDefault={requestDefault}
                onToggleActive={toggleActive}
                onAdd={handleAdd}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDefault}
        onOpenChange={(v) => {
          if (!v) setPendingDefault(null);
        }}
        title="Set default form template"
        description={
          pendingDefault
            ? `Set "${pendingDefault.target.name}" as the default for ${pendingDefault.code}?` +
              (pendingDefault.current ? ` Replaces "${pendingDefault.current.name}".` : '')
            : ''
        }
        confirmText="Set default"
        onConfirm={confirmDefault}
      />

      <DevDebugSheet title="Form Groups — raw" data={rawResponse} />
    </Layout>
  );
};

export default ReportFormGroupManagement;
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReportFormGroupManagement.tsx
git commit -m "feat(report-templates): add Form Groups management page"
```

---

### Task 5: Route + nav wiring (makes the page reachable)

**Files:**
- Modify: `src/App.tsx` (lazy import near line 22-23; route near the report-template routes, ~line 173)
- Modify: `src/components/Layout.tsx` (icon import line 6; `allNavItems` Content group, after line 58)

**Interfaces:**
- Consumes: `ReportFormGroupManagement` default export (Task 4).

- [ ] **Step 1: Lazy-import the page in App.tsx**

In `src/App.tsx`, add beside the other report-template lazy imports (after line 23, `const ReportTemplateEdit = lazy(...)`):

```tsx
const ReportFormGroupManagement = lazy(() => import("./pages/ReportFormGroupManagement"));
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add this `<Route>` immediately before the `/report-templates` route (before line 173, the `<Route path="/report-templates" ...>` block). Placing the static path before the list route keeps routing order clear:

```tsx
            <Route
              path="/report-form-groups"
              element={
                <PrivateRoute requiredPermission="report_template.read">
                  <ReportFormGroupManagement />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 3: Add the nav item**

In `src/components/Layout.tsx`, extend the icon import on line 6 to include `LayoutGrid`:

```tsx
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Newspaper, Megaphone, AppWindow, ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid } from 'lucide-react';
```

Then add the nav item to `allNavItems`, directly after the `/report-templates` entry (line 58), keeping it in the `Content` group:

```tsx
    { path: '/report-form-groups', label: 'Form Groups', icon: LayoutGrid, permission: 'report_template.read', group: 'Content' },
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Run: `bun start` (dev server on :3304). As a user with `report_template.read`:
- "Form Groups" appears in the sidebar under **Content**; click it → route `/report-form-groups` loads.
- Expected: all 12 fixed group cards render (empty ones show "No form templates"); groups holding form templates list their rows with the default row's radio selected; a group with templates but no default shows the amber "No default set" banner.
- Type a group code (e.g. `PR`) in search → only matching groups remain; clear it → all 12 return.
- Toggle "Active only" → inactive templates disappear.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat(report-templates): route + nav for Form Groups page"
```

---

### Task 6: Pre-fill the Edit page from `location.state` (completes "+ Add")

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx` (import line 2; add a module-level seed helper near `initialFormData`; `useLocation()` + two `useState` initializers around lines 100-105)

**Interfaces:**
- Consumes: navigation state `{ template_type?: 'form' | 'list'; report_group?: string }` set by the Form Groups page Add buttons (Task 4).

- [ ] **Step 1: Import `useLocation`**

In `src/pages/ReportTemplateEdit.tsx`, change the router import (line 2) from:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
```
to:
```tsx
import { useParams, useNavigate, useLocation } from 'react-router-dom';
```

- [ ] **Step 2: Add a module-level seed helper**

In `src/pages/ReportTemplateEdit.tsx`, add this function immediately after the `initialFormData` object literal (after its closing `};`, currently line 89):

```tsx
// When navigated to the "new" route with pre-fill state (from the Form Groups
// page "+ Add"), seed the form with the given template_type / report_group.
// Direct visits to /report-templates/new (no state) keep the plain defaults.
function seedInitialFormData(
  isNew: boolean,
  state: unknown,
): ReportTemplateFormData {
  const st = (state ?? null) as { template_type?: 'form' | 'list'; report_group?: string } | null;
  if (!isNew || !st) return initialFormData;
  return {
    ...initialFormData,
    ...(st.template_type ? { template_type: st.template_type } : {}),
    ...(st.report_group ? { report_group: st.report_group } : {}),
  };
}
```

- [ ] **Step 3: Seed the form state**

In `src/pages/ReportTemplateEdit.tsx`, add `const location = useLocation();` right after `const isNew = !id;` (line 102), then change the two form-state initializers (lines 104-105) from:

```tsx
  const [formData, setFormData] = useState<ReportTemplateFormData>(initialFormData);
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(initialFormData);
```
to:
```tsx
  const [formData, setFormData] = useState<ReportTemplateFormData>(() => seedInitialFormData(isNew, location.state));
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(() => seedInitialFormData(isNew, location.state));
```

(Lazy initializers run once on mount, so the seed is applied only on first render — later state edits are untouched. The existing `fetchTemplate` path for `:id/edit` still overwrites `formData` from the server and is unaffected.)

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Run: `bun start`. As a user with `report_template.create`:
- On `/report-form-groups`, click **Add** on the `PO` card → lands on `/report-templates/new` with **Template Type = Form** and **Report Group = PO** already selected (Report Group renders as the form-mode `<select>` on PO).
- Click the header **New Form Template** → lands on New with Template Type = Form and Report Group empty.
- Visit `/report-templates/new` directly (type the URL) → both fields empty (defaults), confirming no regression.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx
git commit -m "feat(report-templates): pre-fill new template from Form Groups Add"
```

---

### Final gate: full build

- [ ] **Step 1: Run the production build (lint + build)**

Run: `CI=true bun run build`
Expected: build succeeds; no TypeScript, unused-import (TS6133), or eslint-as-error failures. Fix any reported issue and amend the relevant task's commit.

- [ ] **Step 2 (optional): Backend contract checks flagged in the spec**

Before relying on the page in a real environment, confirm against Scalar swagger (`/swagger` on the backend):
- `/api-system/report-templates` honours `perpage: -1` (returns all rows). If not, change the page's `getAll` call to a large fixed `perpage` (e.g. `1000`).
- The default partial unique index is scoped to *live* rows (`is_active` AND `is_default`) per `report_group`, confirming unset-then-set is sufficient and the "inactive can't be default" radio guard is correct.

---

## Self-Review

**Spec coverage:**
- Route/nav/permission (`report_template.read`) → Task 5. ✔
- Group roster: fixed 12 always + legacy appended A→Z → Task 4 `groups` useMemo. ✔
- Code-only labels → GroupCard renders `<Badge>{code}` only. ✔
- Data: single `getAll` (`perpage:-1`, `template_type:'form'`, `deleted_at:null`) + client grouping + refetch after writes → Task 4. ✔
- Toolbar: client search (code or name) + Active-only → Task 4. ✔
- States: skeleton / in-card EmptyState / no-default banner / FetchErrorState → Tasks 3 + 4. ✔
- Set default: radio + ConfirmDialog → `setGroupDefault` unset-then-set; 409 + error → refetch → Tasks 2 + 4. ✔
- Actions & gating: set-default & toggle (`report_template.update`), Edit link, Add (`report_template.create`) → Tasks 3 + 4. ✔
- Edge cases: inactive radio disabled + title; deactivate-default disabled item; no-default single set (no unset) → Tasks 3 + 4. ✔
- Add pre-fill via `location.state` → Task 6. ✔
- Shared constant move → Task 1. ✔
- doc_version threading (send-when-present, 409 handling) → Tasks 2 + 4. ✔

**Placeholder scan:** none — every code step carries full source; no TBD/TODO.

**Type consistency:** `setGroupDefault({ current, target })` signature is defined in Task 2 and consumed identically in Task 4; `GroupCard` prop names (`onRequestDefault(target)`, `onToggleActive(t)`, `onAdd(code)`, `busy`, `canWrite`, `canCreate`) match between Task 3 (definition) and Task 4 (usage); `FORM_REPORT_GROUPS` produced in Task 1 is consumed in Tasks 4 and (already) the Edit page; `seedInitialFormData(isNew, state)` defined and used within Task 6.

**No-test policy:** intentional per Global Constraints — verification is `bunx tsc --noEmit` + manual checks + final `CI=true bun run build`, not `*.test.tsx`.
