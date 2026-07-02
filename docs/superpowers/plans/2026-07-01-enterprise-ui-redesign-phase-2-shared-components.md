# Enterprise UI Redesign — Phase 2 (Shared Components & Consistency) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-page copy-pasted UI (dev-debug FAB+`<pre>`, search highlight, page headers, read-only fields) with four tested shared components, and replace raw-color/oversized-type usage with design tokens — so the app is consistent and DRY. Still on Fluent under the hood (de-Fluent is Phase 3).

**Architecture:** Build four small, tested components in `src/components/` (`PageHeader`, `SearchInput`, `ReadOnlyField`) and `src/components/ui/` (`DevDebugSheet` + `JsonViewer`), each with one clear responsibility. Then adopt them across the standard Management/Edit pages and Dashboard, and do two cross-cutting cleanups (status tokens, typography). This componentize-and-tokenize pass touches each page once; Phase 4 then handles only the bespoke page layouts.

**Tech Stack:** React 19 + TS (Vite 8), Tailwind 3.4 (HSL tokens), Fluent-backed shadcn-shaped primitives (`ui/*`), lucide-react, sonner, Vitest + React Testing Library + `@testing-library/user-event`. Bun.

**Spec:** `docs/superpowers/specs/2026-07-01-enterprise-ui-redesign-design.md` (Section 4). **Builds on Phase 1** (branch `redesign/enterprise-ui`, HEAD `8de4bf5`): enterprise tokens + status tokens (`success`/`warning`/`info`) already exist; glass/mesh/gradient already removed.

## Global Constraints

- **Node 20.x**; **Bun** (`bun run …`).
- **Build gate:** `CI=true bun run build` exit 0 (warnings-as-errors). **Test gate:** `bun run test` all pass (Phase 1 left 105 passing).
- **TDD for the four components** (they carry real logic): write the failing RTL/unit test first, watch it fail, implement, watch it pass. Co-locate `*.test.tsx` beside source. Explicit imports `import { describe, it, expect, vi } from 'vitest'` — **no globals**. Assert behavior/roles/text, **no snapshots**. (See CLAUDE.md "Unit & Component Tests".)
- **Adoption tasks change markup, not behavior:** preserve every prop, handler, route, key, state, and data flow. A page's data-fetching / pagination / validation / `doc_version` logic must be byte-unchanged.
- **Colors via tokens only** — never raw `bg-green-*`/`text-red-*`/`bg-yellow-*`/`amber-*`/`bg-gray-900`. Use `<Badge variant="success|warning|info|destructive|secondary">`, the status utilities (`bg-success` etc.), `text-muted-foreground`, `bg-muted`.
- **Dev-only code** stays wrapped in `import.meta.env.DEV` (now inside `DevDebugSheet`).
- **Do NOT modify** the existing `src/components/ui/*` Fluent primitives' internals (that's Phase 3). New components may be *added* under `ui/`.
- **Do NOT** add dependencies (Radix/CVA are Phase 3).
- **Enterprise type scale (this phase):** page title `text-xl font-semibold tracking-tight` (down from `text-2xl sm:text-3xl font-bold`); smallest text `text-xs` (eliminate `text-[10px]`).
- **Canonical references:** Management `src/pages/ClusterManagement.tsx`; Edit `src/pages/ClusterEdit.tsx` (multi-tab debug); Dashboard `src/pages/Dashboard.tsx` (single-data debug).

---

## File Structure (Phase 2)

Create:
- `src/components/ui/json-viewer.tsx` + `.test.tsx` — token-based `<pre>` JSON block.
- `src/components/ui/dev-debug-sheet.tsx` + `.test.tsx` — dev-only amber FAB + Sheet, single-data or tabbed, owns copy state; wraps `JsonViewer`.
- `src/components/SearchInput.tsx` + `.test.tsx` — search `Input` with icon + clear button + token active-state.
- `src/components/PageHeader.tsx` + `.test.tsx` — title/subtitle/actions/back header at the enterprise type scale.
- `src/components/ReadOnlyField.tsx` + `.test.tsx` — the read-only value div.

Modify (adoption + cleanup): the 11 Management pages, 9 Edit pages, `Dashboard.tsx`, `Login.tsx`, and pages holding raw-color/`text-[10px]` (enumerated per task).

Verification per component task = failing test → passing test → build. Per adoption task = grep gate (old pattern gone) + build + tests.

---

### Task 1: `JsonViewer` component

**Files:**
- Create: `src/components/ui/json-viewer.tsx`
- Test: `src/components/ui/json-viewer.test.tsx`

**Interfaces:**
- Produces: `export function JsonViewer(props: { data: unknown; className?: string }): JSX.Element` — renders a `<pre>` with `JSON.stringify(data, null, 2)`, token-styled (`bg-muted text-foreground`, `text-xs`, `font-mono`), scrollable.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/json-viewer.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JsonViewer } from './json-viewer';

describe('JsonViewer', () => {
  it('renders pretty-printed JSON of the data', () => {
    render(<JsonViewer data={{ a: 1, b: 'x' }} />);
    const pre = screen.getByText(/"a": 1/);
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveTextContent('"b": "x"');
  });

  it('uses token classes, not hardcoded gray', () => {
    render(<JsonViewer data={{}} />);
    const pre = document.querySelector('pre')!;
    expect(pre.className).toContain('bg-muted');
    expect(pre.className).not.toContain('bg-gray-900');
    expect(pre.className).not.toContain('text-[10px]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/ui/json-viewer.test.tsx`
Expected: FAIL — module `./json-viewer` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ui/json-viewer.tsx
import { cn } from '../../lib/utils';

export function JsonViewer({ data, className }: { data: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        'text-xs bg-muted text-foreground p-3 sm:p-4 rounded-md overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)] font-mono',
        className,
      )}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/ui/json-viewer.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/json-viewer.tsx src/components/ui/json-viewer.test.tsx
git commit -m "feat: add JsonViewer (token-based JSON debug block)"
```

---

### Task 2: `DevDebugSheet` component

**Files:**
- Create: `src/components/ui/dev-debug-sheet.tsx`
- Test: `src/components/ui/dev-debug-sheet.test.tsx`

**Interfaces:**
- Consumes: `JsonViewer` (Task 1); `Sheet*` from `./sheet`; `Button` from `./button`; `Badge` from `./badge`; icons `Code, Copy, Check` from `lucide-react`.
- Produces:
  ```ts
  export interface DevDebugTab { key: string; label: string; data: unknown }
  export function DevDebugSheet(props: {
    title: string;
    endpoint?: string;
    data?: unknown;          // single-data variant
    tabs?: DevDebugTab[];    // tabbed variant (takes precedence)
  }): JSX.Element | null
  ```
  Renders `null` unless `import.meta.env.DEV` AND there is something to show (`data` truthy, or `tabs` with ≥1 entry whose `data` is truthy). Otherwise renders the fixed amber FAB (bottom-right) + a `Sheet` containing a header (`title` + `DEV` badge + optional `endpoint`), a Copy-JSON button (owns its own `copied` state, 2s reset, copies the active data), and a `JsonViewer`. When `tabs` given, renders a token-styled tab bar (active tab uses `border-primary text-foreground`, not amber) and shows the active tab's data.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/dev-debug-sheet.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevDebugSheet } from './dev-debug-sheet';

describe('DevDebugSheet (import.meta.env.DEV is true under vitest)', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders nothing when there is no data', () => {
    const { container } = render(<DevDebugSheet title="X" data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the sheet from the FAB and shows the JSON', async () => {
    const user = userEvent.setup();
    render(<DevDebugSheet title="Cluster Data" endpoint="/api-system/clusters" data={{ id: 7 }} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    expect(await screen.findByText('Cluster Data')).toBeInTheDocument();
    expect(screen.getByText(/"id": 7/)).toBeInTheDocument();
  });

  it('copies the active data as JSON', async () => {
    const user = userEvent.setup();
    render(<DevDebugSheet title="X" data={{ id: 7 }} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ id: 7 }, null, 2));
  });

  it('switches tabs and shows that tab’s data', async () => {
    const user = userEvent.setup();
    render(<DevDebugSheet title="Edit" tabs={[
      { key: 'a', label: 'Cluster', data: { which: 'a' } },
      { key: 'b', label: 'Users', data: { which: 'b' } },
    ]} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    expect(await screen.findByText(/"which": "a"/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Users' }));
    expect(screen.getByText(/"which": "b"/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/ui/dev-debug-sheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Use the button label `aria-label="Open debug panel"` so `getByRole('button', {name:/debug/i})` matches. Model the FAB/Sheet markup on the current Dashboard/ClusterManagement debug (amber FAB classes stay — amber is the intentional dev-tool signal, not app status), but the tab bar and `<pre>` use tokens.

```tsx
// src/components/ui/dev-debug-sheet.tsx
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './sheet';
import { Button } from './button';
import { Badge } from './badge';
import { JsonViewer } from './json-viewer';
import { Code, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DevDebugTab { key: string; label: string; data: unknown }

export function DevDebugSheet({
  title, endpoint, data, tabs,
}: { title: string; endpoint?: string; data?: unknown; tabs?: DevDebugTab[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeKey, setActiveKey] = useState(tabs?.[0]?.key);

  if (!import.meta.env.DEV) return null;

  const hasTabs = !!tabs && tabs.length > 0;
  const activeTab = hasTabs ? (tabs!.find(t => t.key === activeKey) ?? tabs![0]) : undefined;
  const activeData = hasTabs ? activeTab?.data : data;
  const hasSomething = hasTabs ? tabs!.some(t => t.data != null) : data != null;
  if (!hasSomething) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(activeData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          aria-label="Open debug panel"
          className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
        >
          <Code className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" size="medium" className="w-full overflow-y-auto p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Code className="h-4 w-4 sm:h-5 sm:w-5" />
            {title}
            <Badge variant="outline" className="text-xs">DEV</Badge>
          </SheetTitle>
          {endpoint && <SheetDescription className="text-xs sm:text-sm">{endpoint}</SheetDescription>}
        </SheetHeader>
        <div className="mt-3 sm:mt-4 space-y-3">
          {hasTabs && (
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {tabs!.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveKey(t.key)}
                  className={cn(
                    'px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                    (activeTab?.key === t.key)
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </Button>
          </div>
          <JsonViewer data={activeData} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/ui/dev-debug-sheet.test.tsx`
Expected: PASS (4/4). If the Fluent `Sheet` renders content lazily and a query fails, prefer `findBy*` (already used) — do not change the component to satisfy a test-only timing issue without cause.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dev-debug-sheet.tsx src/components/ui/dev-debug-sheet.test.tsx
git commit -m "feat: add DevDebugSheet (shared dev debug FAB + sheet, single/tabbed)"
```

---

### Task 3: Adopt `DevDebugSheet` on single-data pages

Replace the hand-rolled dev FAB + Sheet + `<pre className="… bg-gray-900 …">` block (and its `debugOpen`/`copied`/`handleCopyJson` local state) with `<DevDebugSheet title=… endpoint=… data={rawResponse} />` on every single-data-debug page.

**Files (single-data debug — the 11 Management pages + Dashboard):**
`src/pages/ClusterManagement.tsx`, `BusinessUnitManagement.tsx`, `UserManagement.tsx`, `RoleManagement.tsx`, `ApplicationManagement.tsx`, `NewsManagement.tsx`, `ReportTemplateManagement.tsx`, `UserPlatformManagement.tsx`, `SuperAdminManagement.tsx`, `TenantMigrationManagement.tsx`, `PrintTemplateMappingManagement.tsx`, `Dashboard.tsx`, plus `Profile.tsx`, `PermissionCatalog.tsx`, `BroadcastCompose.tsx` if they carry the single-data pattern.

**Interfaces:**
- Consumes: `DevDebugSheet` (Task 2).

- [ ] **Step 1: Establish the worklist**

Run: `grep -rln "bg-amber-500" src/pages` and `grep -rln "bg-gray-900" src/pages`
These are the debug-FAB/`<pre>` pages. Multi-tab Edit pages (Task 4) are handled separately — this task is the single-`data` ones.

- [ ] **Step 2: Per page, replace the debug block**

For each single-data page:
1. `import { DevDebugSheet } from '../components/ui/dev-debug-sheet';`
2. Delete the entire `{import.meta.env.DEV && … <Sheet>…</Sheet>}` debug JSX block (FAB + Sheet + tabs bar + `<pre>`).
3. Replace with (keep the same DEV+data guard semantics — `DevDebugSheet` self-gates, so just render it):
   ```tsx
   <DevDebugSheet title="Cluster Data" endpoint="GET /api-system/clusters" data={rawResponse} />
   ```
   Use the page's existing debug title/endpoint text and its `rawResponse` (or equivalent) variable.
4. Remove now-unused locals: the `debugOpen`/`setDebugOpen` state, the `copied`/`setCopied` state, and the `handleCopyJson` helper — **only if** they are used solely by the removed debug block (grep the file for each identifier first; if used elsewhere, leave it). Remove now-unused imports (`Sheet*`, `Code`, `Copy`, `Check`) the same way.

- [ ] **Step 3: Assert the old pattern is gone from these pages**

Run: `grep -rn "bg-gray-900\|bg-amber-500" src/pages` — expect only Edit pages that Task 4 will convert still match (Management/Dashboard should be clean). Re-run after Task 4 for a fully empty result.

- [ ] **Step 4: Build + test**

Run: `CI=true bun run build` (exit 0) and `bun run test` (all pass).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: adopt DevDebugSheet on Management pages + Dashboard"
```

---

### Task 4: Adopt `DevDebugSheet` (tabbed) on multi-tab Edit pages

**Files (multi-tab debug Edit pages):** `src/pages/ClusterEdit.tsx` (cluster/bu/users), and any other Edit page whose debug Sheet has a `debugTab` state — find them: `grep -rln "debugTab" src/pages`. Also convert single-`<pre>` Edit-page debug blocks the same way as Task 3 (single `data`) where there is no tab state.

**Interfaces:**
- Consumes: `DevDebugSheet`, `DevDebugTab` (Task 2).

- [ ] **Step 1: Per tabbed Edit page, replace the debug block**

Replace the FAB + Sheet + amber tab-bar + per-tab `<pre>` with:
```tsx
<DevDebugSheet
  title="Cluster Debug"
  tabs={[
    { key: 'cluster', label: 'Cluster', data: rawResponse },
    { key: 'bu', label: 'Business Units', data: rawBuResponse },
    { key: 'users', label: 'Users', data: rawUsersResponse },
  ]}
/>
```
Map each existing tab to a `DevDebugTab` using the page's existing raw-response variables and labels. Remove now-unused `debugTab`/`setDebugTab`, `debugOpen`, `copied`, `handleCopyJson`, and the `Sheet*`/`Code`/`Copy`/`Check` imports (grep-guard each, as in Task 3).

- [ ] **Step 2: Assert clean**

Run: `grep -rn "bg-gray-900\|bg-amber-500\|debugTab" src/pages` — expect **no matches** (Task 3 + Task 4 together removed every hand-rolled debug block).

- [ ] **Step 3: Build + test**

Run: `CI=true bun run build` (exit 0), `bun run test` (all pass).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: adopt tabbed DevDebugSheet on Edit pages"
```

---

### Task 5: `SearchInput` component

**Files:**
- Create: `src/components/SearchInput.tsx`
- Test: `src/components/SearchInput.test.tsx`

**Interfaces:**
- Consumes: `Input` from `./ui/input`; `Search`, `X` from `lucide-react`.
- Produces:
  ```ts
  export function SearchInput(props: {
    value: string;
    onValueChange: (v: string) => void;
    onClear?: () => void;
    placeholder?: string;
    className?: string;
  }): JSX.Element
  ```
  Left `Search` icon (`pl-9`), right clear `X` button (`pr-9`) shown only when `value` non-empty (calls `onClear ?? (() => onValueChange(''))`), and a subtle **token** active-state when `value` is non-empty (`border-ring`) — **no** `bg-yellow-400`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/SearchInput.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('emits typed value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="" onValueChange={onValueChange} placeholder="Search…" />);
    await user.type(screen.getByPlaceholderText('Search…'), 'a');
    expect(onValueChange).toHaveBeenCalledWith('a');
  });

  it('shows a clear button only when there is a value, and clears', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<SearchInput value="" onValueChange={onValueChange} />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    rerender(<SearchInput value="abc" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('uses a token active-state, not raw yellow', () => {
    render(<SearchInput value="abc" onValueChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input.className).not.toContain('yellow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `bun run test src/components/SearchInput.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/SearchInput.tsx
import { Input } from './ui/input';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export function SearchInput({
  value, onValueChange, onClear, placeholder = 'Search…', className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pl-9 pr-9', value ? 'border-ring' : '')}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => (onClear ? onClear() : onValueChange(''))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — `bun run test src/components/SearchInput.test.tsx` → PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/SearchInput.tsx src/components/SearchInput.test.tsx
git commit -m "feat: add SearchInput (icon + clear + token active state)"
```

---

### Task 6: Adopt `SearchInput` on the 9 Management pages

**Files:** the 9 pages using `bg-yellow-400/20 border-yellow-400/50` — find them: `grep -rln "bg-yellow-400" src/pages` (expected: `UserManagement`, `ClusterManagement`, `RoleManagement`, `BusinessUnitManagement`, `NewsManagement`, `ApplicationManagement`, `ReportTemplateManagement`, `TenantMigrationManagement`, `UserPlatformManagement`).

**Interfaces:** Consumes `SearchInput` (Task 5).

- [ ] **Step 1: Per page, replace the hand-rolled search Input**

Swap the existing search block (the wrapping `relative` div + `Search` icon + `Input` with the `pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 …' : ''}` className + any clear button) for:
```tsx
<SearchInput
  value={searchTerm}
  onValueChange={setSearchTerm}
  placeholder="Search clusters…"
  className="flex-1"   /* preserve the wrapper's layout class if it had one */
/>
```
Keep the page's `searchTerm` state and its existing debounce effect untouched (the component is controlled). Preserve the exact placeholder text the page used. Remove now-unused `Search`/`X` imports if nothing else uses them.

- [ ] **Step 2: Assert clean**

Run: `grep -rn "bg-yellow-400" src` — expect **no matches**.

- [ ] **Step 3: Build + test** — `CI=true bun run build` (exit 0), `bun run test` (pass).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: adopt SearchInput on Management pages (drop raw-yellow highlight)"
```

---

### Task 7: `PageHeader` component

**Files:**
- Create: `src/components/PageHeader.tsx`
- Test: `src/components/PageHeader.test.tsx`

**Interfaces:**
- Consumes: `Link` from `react-router-dom`; `ArrowLeft` from `lucide-react`; `Button` from `./ui/button`.
- Produces:
  ```ts
  export function PageHeader(props: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    backTo?: string;
  }): JSX.Element
  ```
  A responsive header row: optional back link (`ArrowLeft`, to `backTo`), the title as `<h1 className="text-xl font-semibold tracking-tight">`, optional subtitle (`text-sm text-muted-foreground`), and `actions` right-aligned. Must be tested inside a `MemoryRouter` (uses `Link`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/PageHeader.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PageHeader', () => {
  it('renders the title as an h1 at the enterprise scale', () => {
    wrap(<PageHeader title="Cluster Management" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cluster Management' });
    expect(h1.className).toContain('text-xl');
    expect(h1.className).toContain('font-semibold');
    expect(h1.className).not.toContain('text-3xl');
  });

  it('renders subtitle, actions, and a back link when given', () => {
    wrap(<PageHeader title="Edit" subtitle="update the cluster" backTo="/clusters" actions={<button>Save</button>} />);
    expect(screen.getByText('update the cluster')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/clusters');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/PageHeader.tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

export function PageHeader({
  title, subtitle, actions, backTo,
}: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; backTo?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to={backTo}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
```
Note: if `Button asChild` is not supported by the current Fluent-backed `Button`, render the back link as a plain `<Link>` styled like a ghost icon button instead — verify against `src/components/ui/button.tsx`/`fluent-button.tsx` while implementing and adapt (keep the `aria-label="Back"` and `href`).

- [ ] **Step 4: Run test to verify it passes** — PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/components/PageHeader.tsx src/components/PageHeader.test.tsx
git commit -m "feat: add PageHeader (enterprise title scale + back/subtitle/actions)"
```

---

### Task 8: Adopt `PageHeader` across Management + Edit pages

**Files:** every page rendering `<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">` — find them: `grep -rln "text-2xl sm:text-3xl font-bold" src/pages` (the 11 Management + 9 Edit pages; Dashboard/Login/Landing are bespoke — leave for Phase 4).

**Interfaces:** Consumes `PageHeader` (Task 7).

- [ ] **Step 1: Per page, replace the header block**

Replace the header row (the `<h1 …>` + its sibling subtitle `<p>` + the actions container) with a single `<PageHeader>`:
- Management: `<PageHeader title="Cluster Management" subtitle="…" actions={<>…Export CSV / Add…</>} />` — move the existing Export/Add buttons verbatim into `actions`.
- Edit: `<PageHeader title={isNew ? 'New Cluster' : formData.name} subtitle="…" backTo="/clusters" actions={<>…Edit/Save/Cancel…</>} />` — move the existing back button target into `backTo` and the Edit/Save/Cancel buttons into `actions`; delete the old inline back `<Link>`/`<Button>`.
Preserve all button handlers, `disabled`, and conditional rendering exactly.

- [ ] **Step 2: Assert clean**

Run: `grep -rn "text-2xl sm:text-3xl font-bold" src/pages` — expect only the bespoke pages (Login/Landing) if any; Management/Edit should be gone. (Dashboard's title is handled in Phase 4.)

- [ ] **Step 3: Build + test** — `CI=true bun run build` (exit 0), `bun run test` (pass; update any page test asserting the old `text-3xl` heading to the new `PageHeader` heading, keeping the assertion meaningful).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: adopt PageHeader across Management + Edit pages"
```

---

### Task 9: `ReadOnlyField` component + adoption on Edit pages

**Files:**
- Create: `src/components/ReadOnlyField.tsx` + `src/components/ReadOnlyField.test.tsx`
- Modify: Edit pages using the inline read-only div — find them: `grep -rln "bg-muted/50 px-3 py-1 text-sm items-center" src/pages`.

**Interfaces:**
- Produces: `export function ReadOnlyField(props: { value?: React.ReactNode; className?: string }): JSX.Element` — renders `<div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{value || '-'}</div>`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ReadOnlyField.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadOnlyField } from './ReadOnlyField';

describe('ReadOnlyField', () => {
  it('shows the value', () => {
    render(<ReadOnlyField value="ACME" />);
    expect(screen.getByText('ACME')).toBeInTheDocument();
  });
  it('falls back to a dash when empty', () => {
    render(<ReadOnlyField value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ReadOnlyField.tsx
import { cn } from '../lib/utils';

export function ReadOnlyField({ value, className }: { value?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center', className)}>
      {value || '-'}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (2/2).

- [ ] **Step 5: Adopt on Edit pages**

Replace each inline `<div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{X || '-'}</div>` with `<ReadOnlyField value={X} />`. Keep any extra classes on the original div via the `className` prop. Import `ReadOnlyField` per page. Do not alter which value each field shows or the edit/read-only conditional around it.

- [ ] **Step 6: Assert + build + test**

Run: `grep -rn "bg-muted/50 px-3 py-1 text-sm items-center" src/pages` — expect no matches. Then `CI=true bun run build` (exit 0) and `bun run test` (pass).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add ReadOnlyField and adopt it across Edit pages"
```

---

### Task 10: Status tokens — Login alert, raw green/blue, chart palette

**Files:** `src/pages/Login.tsx` (error box), `src/pages/UserEdit.tsx:~787` (`text-blue-600 border-blue-300`), `src/pages/PermissionCatalog.tsx:~170` + `src/pages/Profile.tsx:~718` (`text-green-400`), `src/pages/Dashboard.tsx:61,300-302` (raw chart hsl literals). Also sweep: `grep -rnE "text-(red|green|blue|yellow)-[0-9]|bg-(red|green|blue|yellow)-[0-9]" src/pages`.

**Interfaces:** Uses the status tokens registered in Phase 1 (`--success/--warning/--info`, Tailwind `success`/`warning`/`info`) and existing `Badge` variants; `destructive` token for errors.

- [ ] **Step 1: Login error → token classes**

In `src/pages/Login.tsx`, replace the `text-red-700 bg-red-100 border-red-300` / `text-red-600 bg-red-50 border-red-200` error box with a token-based alert: a `div` using `border-destructive/50 bg-destructive/10 text-destructive` (keep the "Access Denied" bold heading logic; just swap the raw reds for `destructive` token utilities). Do not add a new component; a styled `div` is fine.

- [ ] **Step 2: Replace remaining raw status colors**

- `UserEdit.tsx` `text-blue-600 border-blue-300` → `text-info border-info/40` (info token).
- `PermissionCatalog.tsx` / `Profile.tsx` `text-green-400` → `text-success`.
- Any status badge still using raw palette → `<Badge variant="success|warning|destructive|secondary">`.

- [ ] **Step 3: Dashboard chart palette → token-derived constants**

In `src/pages/Dashboard.tsx`, replace the raw literals `hsl(142,76%,45%)` / `hsl(45,93%,58%)` / `hsl(348,83%,58%)` (the `COLORS` array line 61 and the three `<Bar fill=…>` at 300-302) with a small palette reading the CSS vars, e.g.:
```ts
const CHART = { active: 'hsl(var(--success))', inactive: 'hsl(var(--warning))', deleted: 'hsl(var(--destructive))' };
```
and use `CHART.active/inactive/deleted` for the bars and the donut `COLORS`.

- [ ] **Step 4: Assert + build + test**

Run: `grep -rnE "text-(red|green|blue)-[0-9]|bg-(red|green)-[0-9]" src/pages` — expect no matches (yellow already gone in Task 6; any remaining must be justified/tokenized). Then `CI=true bun run build` (exit 0), `bun run test` (pass).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace raw status colors with tokens (login alert, badges, charts)"
```

---

### Task 11: Typography — eliminate `text-[10px]`, fix low-contrast labels

**Files:** every file with `text-[10px]` — `grep -rln "text-\[10px\]" src` (29 files); the low-contrast muted labels `text-muted-foreground/70` in `src/components/Sidebar.tsx:177,300` and `/60` in `src/pages/ApplicationEdit.tsx:~577`.

- [ ] **Step 1: Replace `text-[10px]` → `text-xs`**

Sweep-replace `text-[10px]` with `text-xs` across `src`. Where a site pairs `text-[10px] sm:text-xs`, collapse to just `text-xs`. Do not change any other class on those elements.

- [ ] **Step 2: Fix low-contrast muted labels**

`Sidebar.tsx` group labels `text-muted-foreground/70` → `text-muted-foreground`; `ApplicationEdit.tsx` `text-muted-foreground/60` → `text-muted-foreground`.

- [ ] **Step 3: Assert + build + test**

Run: `grep -rn "text-\[10px\]" src` → no matches; `grep -rn "text-muted-foreground/[0-9]" src` → no matches. Then `CI=true bun run build` (exit 0), `bun run test` (pass).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: normalize sub-xs text to text-xs; fix low-contrast muted labels"
```

---

### Task 12: Phase 2 verification

**Files:** none (verification), unless a test needs updating.

- [ ] **Step 1: Build green** — `CI=true bun run build` → exit 0, no warnings.

- [ ] **Step 2: Tests** — `bun run test` → all pass (Phase 1's 105 + the new component tests: JsonViewer 2, DevDebugSheet 4, SearchInput 3, PageHeader 2, ReadOnlyField 2 = +13 → expect ~118). If any page test broke on adopted markup, update the assertion to the new component (keep it meaningful); commit as `test: update page assertions for shared components`.

- [ ] **Step 3: Consistency sweep**

Run:
```bash
grep -rnE "bg-gray-900|bg-amber-500|debugTab|bg-yellow-400|text-\[10px\]|text-muted-foreground/[0-9]|text-2xl sm:text-3xl font-bold|bg-muted/50 px-3 py-1 text-sm items-center" src/pages && echo "FOUND — investigate" || echo "clean (pages)"
```
Expected: `clean (pages)` (bespoke Dashboard/Login/Landing headers handled in Phase 4 — if a match is only in those three, note it, don't fix here).

- [ ] **Step 4: Report readiness**

Human visual check (light/dark + mobile/desktop) for a Management page, an Edit page, and the dev debug sheet. Do NOT push/merge (user handles branches).

---

## Roadmap — Phases 3–4 (unchanged; each gets its own plan)

- **Phase 3 — Fluent → shadcn/Radix** (spec §7): add Radix/CVA/tailwindcss-animate, reimplement the 14 primitives + Sidebar + table, remove `FluentProvider`, drop `@fluentui/*`. Also do the P3 docs-sync (CLAUDE.md component-library lines + `magicui/` structure note).
- **Phase 4 — Bespoke page layouts** (spec §9): Dashboard (flat stat cards, chart polish, header via PageHeader), Login, Landing, Profile (dup-h1 fix), Changelog, BroadcastCompose, PermissionCatalog — apply flat treatment + adopt the shared components where these pages diverge from the standard patterns.

---

## Self-Review

**Spec coverage (Section 4):** `<DevDebugSheet>`/`<JsonViewer>` → Tasks 1–4; `<SearchInput>` → 5–6; `<PageHeader>` → 7–8; `<ReadOnlyField>` → 9; status-token replacement (141 sites incl. login alert, badges, charts, amber FAB via DevDebugSheet, yellow via SearchInput) → Tasks 3/4/6/10; typography (`text-[10px]` ×66, low-contrast labels) → 11. ✓

**Placeholder scan:** every component task carries complete code + real RTL tests; adoption tasks carry the exact transformation + enumerated `grep` worklist + grep gate. No "TBD"/"add tests"/"similar to Task N". ✓

**Type/name consistency:** `JsonViewer({data,className})` consumed by `DevDebugSheet`; `DevDebugSheet`/`DevDebugTab` consumed by Tasks 3–4; `SearchInput({value,onValueChange,onClear})` consumed by Task 6; `PageHeader({title,subtitle,actions,backTo})` by Task 8; `ReadOnlyField({value,className})` by Task 9. Status utilities (`success`/`warning`/`info`, `destructive`) match the Phase-1 tokens. ✓

**Known adaptation flagged for implementers:** `Button asChild` may not be supported by the Fluent-backed `Button` — Task 7 tells the implementer to verify and fall back to a styled `<Link>`. Fluent `Sheet` lazy rendering — Task 2 tests use `findBy*`. These are the two integration risks; both are called out at their task.
