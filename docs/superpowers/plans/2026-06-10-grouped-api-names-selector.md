# Grouped (by-module) API Names selector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 765-button API Names picker on the Application Edit page with a collapsible accordion grouped by module, with grouping data generated and served by the backend and gracefully derivable on the frontend.

**Architecture:** The backend catalog generator emits a grouped structure alongside the existing flat list; the applications controller returns both. The frontend service reads `groups` when present and otherwise derives them client-side (same `module = prefix-before-first-dot` rule), so the UI works regardless of backend deploy order. The Application Edit page renders an accordion (collapsed by default) with per-module select-all and a filter that auto-expands matches.

**Tech Stack:** Backend — NestJS + a standalone TS generator script run via Bun. Frontend — React 18 + TypeScript (Vite), shadcn/ui, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-10-grouped-api-names-selector-design.md`

> **Testing note (read before starting):** This is the established reality of these repos, not an omission.
> - **Frontend** has **no TS unit-test runner** (Vitest is a pending project item); the only runners are `node --test` for `.mjs` script helpers and Playwright e2e (which needs a live authed backend). Frontend verification gates in this plan are therefore **`CI=true bun run build`** (strict `tsc` typecheck + `vite-plugin-eslint` with warnings-as-errors) plus scripted manual verification at the running dev server.
> - **Backend generator** lives at repo root with no test runner; its verification is **running the generator and asserting the generated output** (deterministic).
> - **Backend controller** verification is **`nest build`** typecheck; the live endpoint is confirmed by the user after their DEV deploy.
> Pure logic is extracted into named functions for clarity even though there is no runner to unit-test them in isolation.

---

## File Structure

**Backend repo (`/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`):**
- Modify: `scripts/generate-app-api-catalog/run.ts` — also build + emit the grouped export.
- Regenerate (do not hand-edit): `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` — gains `APP_API_CATALOG_GROUPS`.
- Modify: `apps/backend-gateway/src/platform/applications/applications.controller.ts` — import + return `groups`; document it in `@ApiResponse`.

**Frontend repo (`/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`):**
- Modify: `src/types/index.ts` — add `ApiCatalogGroup`.
- Create: `src/utils/apiCatalog.ts` — pure helpers `groupApiNames()` + `actionOf()`.
- Modify: `src/services/applicationService.ts` — `getApiCatalog()` returns `{ groups, api_names }` with client-side fallback.
- Modify: `src/pages/ApplicationEdit.tsx` — accordion edit view, grouped read-only view, state + handlers.

> **Sequencing:** Tasks 1–2 (backend) and Tasks 3–8 (frontend) are independent. The frontend works against either the new or old backend response thanks to the Task 4 fallback. If splitting work, the frontend can ship first.

---

## Task 1: Backend generator emits grouped catalog

**Files:**
- Modify: `carmen-turborepo-backend-v2/scripts/generate-app-api-catalog/run.ts`
- Regenerate: `carmen-turborepo-backend-v2/apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

- [ ] **Step 1: Replace the output-building tail of `run.ts`**

Open `scripts/generate-app-api-catalog/run.ts`. Replace everything from `const sorted = Array.from(names).sort();` to the end of the file with:

```ts
const sorted = Array.from(names).sort();

// Group by module = the prefix before the first '.'. A name with no dot forms
// its own single-entry group keyed by the full string. Modules are sorted; each
// group's api_names keep the already-sorted order.
const groupsMap = new Map<string, string[]>();
for (const name of sorted) {
  const dot = name.indexOf('.');
  const moduleName = dot === -1 ? name : name.slice(0, dot);
  const list = groupsMap.get(moduleName) ?? [];
  list.push(name);
  groupsMap.set(moduleName, list);
}
const groups = Array.from(groupsMap.keys())
  .sort()
  .map((moduleName) => ({ module: moduleName, api_names: groupsMap.get(moduleName)! }));

const flatBody = sorted.map((name) => `  '${name}',`).join('\n');
const groupsBody = groups
  .map(
    (g) =>
      `  { module: '${g.module}', api_names: [${g.api_names
        .map((n) => `'${n}'`)
        .join(', ')}] },`,
  )
  .join('\n');

const out = `/**
 * Auto-generated catalog of guarded api_name values. Regenerate with: bun run scripts/generate-app-api-catalog/run.ts
 * catalog ของ api_name ที่ถูกป้องกันซึ่งสร้างอัตโนมัติ สร้างใหม่ด้วย: bun run scripts/generate-app-api-catalog/run.ts
 */
export const APP_API_CATALOG: readonly string[] = [
${flatBody}
] as const;

export const APP_API_CATALOG_GROUPS: readonly { module: string; api_names: readonly string[] }[] = [
${groupsBody}
] as const;
`;

fs.writeFileSync(OUTPUT, out, 'utf-8');
console.log(
  `Wrote ${sorted.length} api_name entries in ${groups.length} modules to ${OUTPUT}`,
);
```

- [ ] **Step 2: Run the generator**

Run (from the backend repo root):
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
```
Expected stdout: a line of the form `Wrote <N> api_name entries in <M> modules to .../app-api-catalog.generated.ts` where both `<N>` and `<M>` are non-zero (at time of writing, ~765 entries / ~120 modules — numbers may differ if guards changed since).

- [ ] **Step 3: Assert the generated output is grouped correctly**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -c "export const APP_API_CATALOG_GROUPS" apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
grep -n "module: 'cluster'" apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
```
Expected: first command prints `1`; second prints a line like
`{ module: 'cluster', api_names: ['cluster.create', 'cluster.delete', ...] }`.
Also confirm `export const APP_API_CATALOG: readonly string[]` is still present (flat list unchanged):
```bash
grep -c "export const APP_API_CATALOG:" apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
```
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add scripts/generate-app-api-catalog/run.ts apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
git commit -m "feat(applications): emit grouped api_name catalog from generator"
```

---

## Task 2: Backend controller returns groups

**Files:**
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/platform/applications/applications.controller.ts`

- [ ] **Step 1: Import the grouped export**

Replace line 46:
```ts
import { APP_API_CATALOG } from './app-api-catalog.generated';
```
with:
```ts
import { APP_API_CATALOG, APP_API_CATALOG_GROUPS } from './app-api-catalog.generated';
```

- [ ] **Step 2: Extend the `@ApiResponse` schema and the response body**

In the `getApiCatalog` handler block, update the `@ApiResponse` `schema.properties` to add `groups`, and update the `respond` call.

Replace this `schema` object:
```ts
    schema: {
      type: 'object',
      properties: {
        api_names: {
          type: 'array',
          items: { type: 'string' },
          example: ['activityLog.findAll', 'application.apiCatalog', 'purchaseRequest.create'],
        },
      },
    },
```
with:
```ts
    schema: {
      type: 'object',
      properties: {
        api_names: {
          type: 'array',
          items: { type: 'string' },
          example: ['activityLog.findAll', 'application.apiCatalog', 'purchaseRequest.create'],
        },
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              api_names: { type: 'array', items: { type: 'string' } },
            },
          },
          example: [
            { module: 'cluster', api_names: ['cluster.create', 'cluster.findAll'] },
          ],
        },
      },
    },
```
Then replace the response line:
```ts
    this.respond(res, { api_names: APP_API_CATALOG });
```
with:
```ts
    this.respond(res, { api_names: APP_API_CATALOG, groups: APP_API_CATALOG_GROUPS });
```

- [ ] **Step 3: Typecheck the gateway build**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bun run build
```
Expected: `nest build` completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/platform/applications/applications.controller.ts
git commit -m "feat(applications): return module groups from api-catalog endpoint"
```

> The live endpoint (`GET /api-system/applications/api-catalog` now returning `groups`) is verified by the user after the DEV deploy. The frontend does not depend on this deploy (Task 4 fallback).

---

## Task 3: Frontend type + pure grouping helpers

**Files:**
- Modify: `carmen-platform/src/types/index.ts`
- Create: `carmen-platform/src/utils/apiCatalog.ts`

- [ ] **Step 1: Add the `ApiCatalogGroup` type**

In `src/types/index.ts`, immediately after the `Application` interface (after its closing `}` on line 57), add:
```ts

// A module group of api_names, e.g. { module: 'cluster', api_names: ['cluster.create', ...] }.
// Returned by the api-catalog endpoint (or derived client-side from a flat api_names list).
export interface ApiCatalogGroup {
  module: string;
  api_names: string[];
}
```

- [ ] **Step 2: Create the pure helpers**

Create `src/utils/apiCatalog.ts`:
```ts
import type { ApiCatalogGroup } from '../types';

/**
 * The module an api_name belongs to: the prefix before the first '.'.
 * A name with no dot is its own module.
 */
export const moduleOf = (apiName: string): string => {
  const dot = apiName.indexOf('.');
  return dot === -1 ? apiName : apiName.slice(0, dot);
};

/**
 * The action portion of an api_name: the text after the first '.'.
 * A name with no dot returns the whole string.
 */
export const actionOf = (apiName: string): string => {
  const dot = apiName.indexOf('.');
  return dot === -1 ? apiName : apiName.slice(dot + 1);
};

/**
 * Group a flat list of api_names by module. Modules are sorted alphabetically;
 * each group's api_names are sorted. Mirrors the backend generator's rule so a
 * client-derived grouping is identical to a server-provided one.
 */
export const groupApiNames = (apiNames: string[]): ApiCatalogGroup[] => {
  const map = new Map<string, string[]>();
  for (const name of apiNames) {
    const mod = moduleOf(name);
    const list = map.get(mod) ?? [];
    list.push(name);
    map.set(mod, list);
  }
  return Array.from(map.keys())
    .sort()
    .map((module) => ({ module, api_names: (map.get(module) ?? []).slice().sort() }));
};
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: build succeeds (no TS/eslint errors). The new file is not yet imported anywhere, which is fine.

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/types/index.ts src/utils/apiCatalog.ts
git commit -m "feat(applications): add ApiCatalogGroup type and grouping helpers"
```

---

## Task 4: Service returns groups with client-side fallback

**Files:**
- Modify: `carmen-platform/src/services/applicationService.ts`

- [ ] **Step 1: Import the type and helper**

At the top of `src/services/applicationService.ts`, update the type import (currently line 3) to add `ApiCatalogGroup`:
```ts
import type { PaginateParams, Application, ApplicationWritePayload, ApiListResponse, ApiCatalogGroup } from '../types';
```
Add a new import line directly below the existing imports:
```ts
import { groupApiNames } from '../utils/apiCatalog';
```

- [ ] **Step 2: Replace `getApiCatalog`**

Replace the entire `getApiCatalog` method (currently lines ~51–59, the comment block + method) with:
```ts
  // Catalog of selectable api_name values. The endpoint returns
  // { api_names: string[], groups?: { module, api_names }[] } (optionally inside the
  // standard { data } envelope). Tolerate a bare string[] too. When the backend has
  // not yet been redeployed with `groups`, derive the same grouping client-side from
  // api_names (identical split rule), so the UI works regardless of deploy order.
  getApiCatalog: async (): Promise<{ groups: ApiCatalogGroup[]; api_names: string[] }> => {
    const response = await api.get('/api-system/applications/api-catalog');
    const body = response.data?.data ?? response.data;

    const api_names: string[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.api_names)
        ? body.api_names
        : [];

    const rawGroups = body?.groups;
    const validGroups: ApiCatalogGroup[] =
      Array.isArray(rawGroups) &&
      rawGroups.every(
        (g: unknown) =>
          !!g &&
          typeof (g as ApiCatalogGroup).module === 'string' &&
          Array.isArray((g as ApiCatalogGroup).api_names),
      )
        ? (rawGroups as ApiCatalogGroup[])
        : groupApiNames(api_names);

    return { groups: validGroups, api_names };
  },
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: build succeeds. (`ApplicationEdit.tsx` still calls `getApiCatalog().then(setCatalog)` where `setCatalog` expects `string[]`, so this will now be a **type error** — that is expected and fixed in Task 5. If the build fails only on `ApplicationEdit.tsx` `setCatalog` type mismatch, proceed to Task 5; do not "fix" it here.)

> Note: if you prefer a green build at every commit, do Task 4 and Task 5 Step 1–2 together before building. Either way, commit after Task 5's build passes. To keep this commit isolated, commit now and accept that the working tree typechecks green only after Task 5.

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/services/applicationService.ts
git commit -m "feat(applications): getApiCatalog returns module groups with fallback"
```

---

## Task 5: ApplicationEdit — catalog state + handlers

**Files:**
- Modify: `carmen-platform/src/pages/ApplicationEdit.tsx`

- [ ] **Step 1: Update imports**

At the top of the file, add the `ChevronRight` and `ChevronDown` icons to the existing lucide-react import (line 14). Change:
```ts
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2, Search } from 'lucide-react';
```
to:
```ts
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2, Search, ChevronRight, ChevronDown } from 'lucide-react';
```
Add these two imports directly below the `Skeleton` import (after line 19):
```ts
import { groupApiNames, actionOf } from '../utils/apiCatalog';
import type { ApiCatalogGroup } from '../types';
```

- [ ] **Step 2: Replace the catalog state**

Replace these two state lines (currently lines 51–52):
```ts
  const [catalog, setCatalog] = useState<string[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
```
with:
```ts
  const [catalogGroups, setCatalogGroups] = useState<ApiCatalogGroup[]>([]);
  const [catalogNames, setCatalogNames] = useState<string[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Update the catalog fetch effect**

Replace the catalog `useEffect` (currently lines 81–85):
```ts
  useEffect(() => {
    applicationService.getApiCatalog()
      .then(setCatalog)
      .catch((err) => { setCatalogFailed(true); devLog('Failed to load api catalog:', err); });
  }, []);
```
with:
```ts
  useEffect(() => {
    applicationService.getApiCatalog()
      .then(({ groups, api_names }) => { setCatalogGroups(groups); setCatalogNames(api_names); })
      .catch((err) => { setCatalogFailed(true); devLog('Failed to load api catalog:', err); });
  }, []);
```

- [ ] **Step 4: Add module handlers**

Directly below the existing `toggleApiName` function (after its closing `};` on line 140), add:
```ts
  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  // Select-all / deselect-all for one module. If every api_name in the module is
  // already selected, remove them all; otherwise add the missing ones.
  const toggleModuleSelection = (groupNames: string[]) => {
    setFormData(prev => {
      const allSelected = groupNames.every(n => prev.api_names.includes(n));
      const api_names = allSelected
        ? prev.api_names.filter(n => !groupNames.includes(n))
        : Array.from(new Set([...prev.api_names, ...groupNames]));
      return { ...prev, api_names };
    });
    setError('');
  };

  const expandAll = (modules: string[]) => setExpandedModules(new Set(modules));
  const collapseAll = () => setExpandedModules(new Set());
```

- [ ] **Step 5: Typecheck**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: build **fails** with errors in the JSX that still references the removed `catalog` variable (the `api_names` render block, lines ~383–412 in the original). This is expected — Task 6 replaces that JSX. Do not patch around it here.

> If you committed Task 4 separately and want a green checkpoint, complete Task 6 before building/committing. The build only returns green after Task 6.

- [ ] **Step 6: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): add grouped catalog state and module handlers"
```

---

## Task 6: ApplicationEdit — accordion edit view

**Files:**
- Modify: `carmen-platform/src/pages/ApplicationEdit.tsx`

- [ ] **Step 1: Replace the editing branch of the api_names selector**

In the `{!formData.allow_all && (...)}` block, find the editing branch. It is the inner `catalogFailed ? (<ChipInput .../>) : (<div className="space-y-2"> ... </div>)` ternary — the non-failed `(...)` arm spans the search input + the `rounded-md border ... max-h-60` catalog box (originally lines ~360–415).

Keep the `catalogFailed ? (<ChipInput ... />)` arm exactly as-is. Replace **only** the `: (` non-failed arm (the entire `<div className="space-y-2">…</div>` that contains the search box and the flat button cloud) with:

```tsx
                    ) : (
                      <div className="space-y-2">
                        {/* Filter + total + expand/collapse-all controls */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="text"
                              value={apiSearch}
                              onChange={(e) => setApiSearch(e.target.value)}
                              placeholder="Filter by module or api_name..."
                              className="pl-9 pr-9"
                              aria-label="Filter API names"
                            />
                            {apiSearch && (
                              <button
                                type="button"
                                onClick={() => setApiSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Clear filter"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {catalogGroups.length === 0 ? (
                          <div className="rounded-md border border-input p-2">
                            <p className="text-sm text-muted-foreground text-center py-4">Loading catalog…</p>
                          </div>
                        ) : (() => {
                          const q = apiSearch.trim().toLowerCase();
                          // A group matches if its module name matches; then only matching
                          // api_names show. If the module name itself matches, show all of it.
                          const visibleGroups = catalogGroups
                            .map((g) => {
                              if (!q) return g;
                              const moduleMatch = g.module.toLowerCase().includes(q);
                              if (moduleMatch) return g;
                              const api_names = g.api_names.filter((n) => n.toLowerCase().includes(q));
                              return api_names.length ? { ...g, api_names } : null;
                            })
                            .filter((g): g is ApiCatalogGroup => g !== null);

                          if (visibleGroups.length === 0) {
                            return (
                              <div className="rounded-md border border-input p-2">
                                <p className="text-sm text-muted-foreground text-center py-4">No API names matching &ldquo;{apiSearch}&rdquo;</p>
                              </div>
                            );
                          }

                          const allVisibleModules = visibleGroups.map((g) => g.module);
                          return (
                            <>
                              <div className="flex items-center justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    expandedModules.size >= visibleGroups.length
                                      ? collapseAll()
                                      : expandAll(allVisibleModules)
                                  }
                                >
                                  {expandedModules.size >= visibleGroups.length ? 'Collapse all' : 'Expand all'}
                                </Button>
                              </div>
                              <div className="rounded-md border border-input max-h-80 overflow-y-auto divide-y">
                                {visibleGroups.map((g) => {
                                  // A search auto-expands matching groups; otherwise honor manual state.
                                  const expanded = q ? true : expandedModules.has(g.module);
                                  const selectedCount = g.api_names.filter((n) => formData.api_names.includes(n)).length;
                                  const allSelected = selectedCount === g.api_names.length;
                                  return (
                                    <div key={g.module}>
                                      <div className="flex items-center gap-2 px-2 py-1.5">
                                        <button
                                          type="button"
                                          onClick={() => toggleModule(g.module)}
                                          className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium"
                                          aria-expanded={expanded}
                                        >
                                          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                          <span className="truncate">{g.module}</span>
                                          <Badge variant={selectedCount > 0 ? 'default' : 'secondary'} className="text-[10px]">
                                            {selectedCount}/{g.api_names.length}
                                          </Badge>
                                        </button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs"
                                          onClick={() => toggleModuleSelection(g.api_names)}
                                        >
                                          {allSelected ? 'None' : 'All'}
                                        </Button>
                                      </div>
                                      {expanded && (
                                        <div className="flex flex-wrap gap-1.5 px-2 pb-2 pl-7">
                                          {g.api_names.map((api) => {
                                            const selected = formData.api_names.includes(api);
                                            return (
                                              <Button
                                                key={api}
                                                type="button"
                                                variant={selected ? 'default' : 'outline'}
                                                size="sm"
                                                className="h-7 text-xs gap-1"
                                                title={api}
                                                onClick={() => toggleApiName(api)}
                                                aria-pressed={selected}
                                              >
                                                {actionOf(api)}
                                                {selected && <X className="h-3 w-3" />}
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )
```

- [ ] **Step 2: Fix the "N selected" footer guard**

The footer line (originally lines ~427–429) reads:
```tsx
                  {editing && !catalogFailed && (
                    <p className="text-xs text-muted-foreground">{formData.api_names.length} selected</p>
                  )}
```
Leave it unchanged — `formData.api_names.length` is still the right total.

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: build **passes** (no TS or eslint errors). The previously-failing references to `catalog` are now gone.

- [ ] **Step 4: Manual verification (dev server)**

Run `bun start` (dev server on :3100), log in, open an existing application at `/applications/<id>/edit`, and click **Edit**. Verify:
- The API Names section shows a filter box + an "Expand all" button + a bordered, scrollable list of module rows (collapsed), each with a `selected/total` badge and an "All" button.
- Clicking a module row's chevron/name expands it to show action-only buttons (e.g. `create`, `findAll`); hovering shows the full `api_name` as a tooltip.
- Clicking an action button toggles it (fills in + shows `X`); the module badge count and the bottom "N selected" both update.
- Clicking **All** on a module selects every action in it; the button flips to **None**; clicking **None** clears them.
- Typing in the filter (e.g. `cluster`) hides non-matching modules and auto-expands matches; typing an action fragment (e.g. `findAll`) shows only matching actions within their modules; clearing the filter restores collapsed state.
- Toggling **Allow all APIs** hides the whole selector; unchecking restores it.
- Save, confirm a success toast, and that the read-only view reflects the selection (Task 7).

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): grouped accordion API Names selector (edit view)"
```

---

## Task 7: ApplicationEdit — grouped read-only view

**Files:**
- Modify: `carmen-platform/src/pages/ApplicationEdit.tsx`

- [ ] **Step 1: Replace the read-only branch of the api_names selector**

Still inside the `{!formData.allow_all && (...)}` block, find the `) : (` arm that renders when **not** `editing` — the original flat-badge block (originally lines ~416–425):
```tsx
                  ) : (
                    formData.api_names.length === 0 ? (
                      <div className={`${readOnlyBox} text-muted-foreground`}>-</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.api_names.map((api) => (
                          <Badge key={api} variant="outline" className="text-xs">{api}</Badge>
                        ))}
                      </div>
                    )
                  )}
```
Replace it with a grouped read-only view:
```tsx
                  ) : (
                    formData.api_names.length === 0 ? (
                      <div className={`${readOnlyBox} text-muted-foreground`}>-</div>
                    ) : (
                      <div className="space-y-3">
                        {groupApiNames(formData.api_names).map((g) => (
                          <div key={g.module} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              {g.module} <span className="text-muted-foreground/60">({g.api_names.length})</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.api_names.map((api) => (
                                <Badge key={api} variant="outline" className="text-xs" title={api}>{actionOf(api)}</Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: build passes (no TS or eslint errors).

- [ ] **Step 3: Manual verification**

On `/applications/<id>/edit` in **view** (not editing) mode, with an application that has several api_names across modules, verify the API Names section shows them grouped under small module subheaders (`module (count)`), each api_name as an outline badge showing the action with the full name on hover. An application with no api_names shows `-`. Toggle Edit and back to confirm both views stay consistent.

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): grouped read-only API Names view"
```

---

## Task 8: Full build + final verification

**Files:** none (verification only)

- [ ] **Step 1: Clean frontend build**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
CI=true bun run build
```
Expected: production build completes with no TypeScript or eslint errors, output emitted to `build/`.

- [ ] **Step 2: Regression sweep at the running app**

`bun start`, then on `/applications/<id>/edit`:
- Create flow: go to `/applications/new`, the accordion appears in edit mode by default; select a few api_names across modules; create; confirm the success toast and redirect to `/applications/<newId>/edit`.
- `catalogFailed` fallback: this only triggers if the catalog request errors; no action needed unless you can simulate it — confirm the code path still renders `<ChipInput>` (unchanged).
- Debug Sheet (dev only): open it and confirm the raw response is shown (unchanged behavior).

- [ ] **Step 3: Confirm no stray references**

Run:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -n "setCatalog\b\|\bcatalog\b" src/pages/ApplicationEdit.tsx
```
Expected: no matches for the old `catalog`/`setCatalog` identifiers (only `catalogGroups`, `catalogNames`, `catalogFailed`, `catalogGroups.length` should remain). `catalogNames` is currently unused by the UI but kept for the "N selected"/future use — if eslint flags it as unused under `CI=true`, either reference it or drop it; the Step 1 build is the source of truth.

> **Decision if `catalogNames` trips no-unused-vars:** drop `catalogNames` state and the `setCatalogNames` call (use only `setCatalogGroups(groups)` in the effect). The total count comes from `formData.api_names.length`, not the catalog, so `catalogNames` is not required. Keep it only if a later need is concrete (YAGNI).

- [ ] **Step 4: Final commit (if Step 3 required an edit)**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/ApplicationEdit.tsx
git commit -m "chore(applications): drop unused catalogNames state"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** Part 1 generator → Task 1; Part 2 controller + OpenAPI → Task 2; Part 3 types + service fallback → Tasks 3–4; Part 4 UI (accordion edit view, per-module select-all, filter auto-expand, expand/collapse-all, grouped read-only) → Tasks 5–7; build/verify → Task 8. Edge cases (dotless name, backend not redeployed, no-match filter, selected-not-in-catalog) covered by `moduleOf`/`groupApiNames` rules + the Task 4 fallback + Task 6 no-match branch; the read-only view renders any selected name regardless of catalog membership.
- **Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output.
- **Type consistency:** `ApiCatalogGroup { module, api_names }` defined in Task 3 and used identically in Tasks 4/6/7; `getApiCatalog(): Promise<{ groups, api_names }>` in Task 4 matches the destructuring in Task 5's effect; helpers `moduleOf`/`actionOf`/`groupApiNames` used with the same signatures throughout.

> **Note on YAGNI:** `catalogNames`/`setCatalogNames` are introduced in Task 5 but the UI total comes from `formData.api_names`. Task 8 Step 3 explicitly resolves whether to keep or drop them based on the lint result, so the plan does not ship dead state silently.
