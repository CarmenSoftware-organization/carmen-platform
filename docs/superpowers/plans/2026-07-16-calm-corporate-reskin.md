# Calm-Corporate Whole-App Reskin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Carmen ops admin dashboard a fresh calm-corporate visual identity across the whole app by reskinning the design-system leverage points (tokens, primitives, shell), so all 30+ pages inherit the new look.

**Architecture:** Change is delivered top-down through shared layers, not per page. Phase 1 retunes CSS tokens (palette, radius, elevation, tabular figures) — every page shifts at once. Phase 2 restyles shared primitives (Badge, Card, DataTable, EmptyState). Phase 3 adds a desktop breadcrumb bar and refines the sidebar active state. Phase 4 verifies the already-good entry/Dashboard pages under the new tokens and runs full regression.

**Tech Stack:** React 19 + TypeScript, Tailwind 3.4 (HSL CSS custom properties), shadcn/ui (Radix + CVA), TanStack Table v8, Vitest + React Testing Library, Bun.

## Global Constraints

- **No new libraries** (project rule #6). Inter is already loaded; no new font.
- **Do not change `src/components/ui/*` prop APIs** (rule #2). Restyle via classes/CVA variants only.
- **No raw green Tailwind for status** — use `Badge` variants (rule #5).
- **Keep Carmen blue exactly:** `--primary: 221 61% 48%` (light) / `217 70% 60%` (dark).
- **Tests:** co-locate `*.test.tsx` beside source; explicit `import { describe, it, expect } from 'vitest'` (no globals); assert behavior/roles/text, not snapshots (rule #18). Don't touch `tsconfig.json` / `vite.config.ts` for test setup.
- **Gate per phase:** `bun run test` green AND `CI=true bun run build` clean (lint + types) before moving to the next phase.
- Package manager: **bun**. Dev server / preview is port `3304`.
- Entry pages (`Login.tsx`, `Landing.tsx`) and `Dashboard.tsx` are already redesigned and on-vibe — they INHERIT new tokens. Do not rewrite them; polish only.

---

## File Structure

**Modified:**
- `src/index.css` — token values (`:root`, `.dark`), radius, elevation tokens, `.tabular-nums` utility, zebra retune.
- `src/components/ui/badge.tsx` — add `warning` + `info` variants.
- `src/components/ui/card.tsx` — elevation + padding recipe.
- `src/components/ui/data-table.tsx` — header/row density + tabular figures on data cells.
- `src/components/EmptyState.tsx` — soft-ring icon well.
- `src/components/Layout.tsx` — desktop breadcrumb bar, content top padding.
- `src/components/Sidebar.tsx` — refined active state.

**Created:**
- `src/components/Breadcrumbs.tsx` — route→crumb pure fn + component.
- `src/components/Breadcrumbs.test.tsx` — unit test for the pure fn.
- `src/components/ui/badge.test.tsx` already exists — extend it.

---

## Phase 1 — Foundation tokens

### Task 1: Refresh palette + radius

Shift the neutral ramp from the generic cool `226`-hue slate to a deliberate, very-low-saturation **warm neutral** (calm corporate, "warm paper + cool ink"), bump radius, keep Carmen blue. Every page re-tints.

**Files:**
- Modify: `src/index.css` (`:root` block ~lines 5–33, `.dark` block ~lines 40–68)

**Interfaces:**
- Produces: token values consumed by every component via `hsl(var(--…))`. No JS surface.

- [ ] **Step 1: Replace the `:root` color + radius tokens**

In `src/index.css`, replace the existing `:root` token lines (keep `--shadow-*`, `--zebra-*`, `--bu-chip-*` for now — Task 2 retunes them) with:

```css
:root {
  --background: 40 9% 97.5%;
  --foreground: 30 7% 12%;
  --card: 0 0% 100%;
  --card-foreground: 30 7% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 30 7% 12%;
  --primary: 221 61% 48%;
  --primary-foreground: 0 0% 100%;
  --secondary: 40 8% 94%;
  --secondary-foreground: 30 10% 20%;
  --muted: 40 8% 95.5%;
  --muted-foreground: 33 5% 43%;
  --accent: 40 8% 94%;
  --accent-foreground: 30 10% 20%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --border: 40 8% 90%;
  --input: 40 8% 87%;
  --ring: 221 61% 48%;
  --radius: 0.5rem;
  --success: 152 40% 36%;
  --success-foreground: 0 0% 100%;
  --warning: 32 90% 44%;
  --warning-foreground: 0 0% 100%;
  --info: 221 61% 48%;
  --info-foreground: 0 0% 100%;
```

(Leave the `--shadow-*`, `--zebra-*`, `--bu-chip-*` lines and the closing `}` untouched below this.)

- [ ] **Step 2: Replace the `.dark` color tokens**

Replace the `.dark` color token lines (keep `--shadow-*`, `--zebra-*`, `--bu-chip-*`) with a softened, faintly-warm neutral dark (avoids the current over-saturated blue-black and avoids brown):

```css
.dark {
  --background: 30 6% 9%;
  --foreground: 40 8% 90%;
  --card: 30 6% 12%;
  --card-foreground: 40 8% 90%;
  --popover: 30 6% 12%;
  --popover-foreground: 40 8% 90%;
  --primary: 217 70% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 30 5% 17%;
  --secondary-foreground: 40 8% 95%;
  --muted: 30 5% 16%;
  --muted-foreground: 35 6% 62%;
  --accent: 30 5% 18%;
  --accent-foreground: 40 8% 95%;
  --destructive: 0 62% 45%;
  --destructive-foreground: 0 0% 100%;
  --border: 30 5% 20%;
  --input: 30 5% 22%;
  --ring: 217 70% 60%;
  --radius: 0.5rem;
  --success: 152 45% 45%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 55%;
  --warning-foreground: 20 14% 8%;
  --info: 217 70% 60%;
  --info-foreground: 0 0% 100%;
```

(`--radius` here is harmless duplication for clarity; `:root` already sets it. Leave `--shadow-*`, `--zebra-*`, `--bu-chip-*` and the closing `}` untouched.)

- [ ] **Step 3: Run the test suite**

Run: `bun run test`
Expected: PASS (498 tests). Palette values are not asserted by any test, so all stay green.

- [ ] **Step 4: Build**

Run: `CI=true bun run build`
Expected: build succeeds, no lint/type errors.

- [ ] **Step 5: Visual smoke**

Run: `bun start` (port 3304), open `/login` and `/dashboard`. Confirm: canvas reads as a warm off-white (not cool gray), cards are clean white, corners are softer (0.5rem), Carmen blue unchanged. Confirm dark mode via sidebar theme toggle looks neutral, not brown or over-blue.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "feat(design): warm-neutral calm-corporate palette + 0.5rem radius"
```

### Task 2: Elevation tokens + tabular figures utility

Whisper-light elevation (canvas-vs-card does the depth work) and tabular numerals for all columnar data.

**Files:**
- Modify: `src/index.css` (`--shadow-*` lines in `:root` and `.dark`; add a utility block)

**Interfaces:**
- Produces: CSS var `--shadow-xs`; utility class `.tabular-nums` (consumed by Task 5).

- [ ] **Step 1: Retune shadow tokens (both themes)**

In `:root`, replace the shadow lines with:

```css
  --shadow-xs: 0 1px 2px rgba(24, 20, 16, 0.04);
  --shadow-sm: 0 1px 2px rgba(24, 20, 16, 0.05);
  --shadow-md: 0 4px 12px rgba(24, 20, 16, 0.06);
```

In `.dark`, replace the shadow lines with:

```css
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45);
```

- [ ] **Step 2: Add the tabular-nums utility**

Append to `src/index.css` (after the `body` rule, before the zebra rules):

```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

- [ ] **Step 3: Retune zebra alpha to the warm neutrals**

In `:root`, replace the `--zebra-even` / `--zebra-hover` / `--zebra-hover-accent` lines with:

```css
  --zebra-even: rgba(24, 20, 16, 0.02);
  --zebra-hover: hsl(221 61% 48% / 0.045);
  --zebra-hover-accent: hsl(221 61% 48% / 0.5);
```

(Leave `.dark` zebra lines as-is — they read fine on the new dark ground.)

- [ ] **Step 4: Test + build**

Run: `bun run test` → PASS.
Run: `CI=true bun run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(design): elevation scale + tabular-nums utility + zebra retune"
```

---

## Phase 2 — Shared primitives

### Task 3: Badge — add `warning` and `info` variants

`Badge` currently exposes only `default/secondary/destructive/outline/success`. Status usage across pages needs `warning` and `info` (rule #5: no raw green/amber classes). Additive — no API break.

**Files:**
- Modify: `src/components/ui/badge.tsx:9-16`
- Test: `src/components/ui/badge.test.tsx` (exists — extend)

**Interfaces:**
- Produces: `<Badge variant="warning" | "info">` renders with `bg-warning` / `bg-info`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/ui/badge.test.tsx`:

```tsx
it('renders warning and info variants with their status backgrounds', () => {
  const { rerender } = render(<Badge variant="warning">At risk</Badge>);
  expect(screen.getByText('At risk')).toHaveClass('bg-warning');
  rerender(<Badge variant="info">Info</Badge>);
  expect(screen.getByText('Info')).toHaveClass('bg-info');
});
```

(If `render`/`screen` aren't imported in the file, add `import { render, screen } from '@testing-library/react';` and `import { describe, it, expect } from 'vitest';` and `import { Badge } from './badge';` — match the file's existing imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/ui/badge.test.tsx`
Expected: FAIL — `warning` variant not defined, element lacks `bg-warning`.

- [ ] **Step 3: Add the variants**

In `src/components/ui/badge.tsx`, extend the `variant` map (after `success`):

```tsx
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        info: 'border-transparent bg-info text-info-foreground',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/ui/badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/badge.test.tsx
git commit -m "feat(ui): add warning + info Badge variants"
```

### Task 4: Card — elevation + calmer padding

Current card is `p-3 shadow-sm` (tight). Calm corporate wants more breathing room and the whisper elevation. Default className only — callers can still override.

**Files:**
- Modify: `src/components/ui/card.tsx:9`
- Test: `src/components/ui/card.test.tsx` (exists)

**Interfaces:**
- Produces: `Card` default surface = white + `--shadow-xs` + border + `p-5` + `gap-4` + `rounded-lg`.

- [ ] **Step 1: Update the Card base className**

Replace line 9 of `src/components/ui/card.tsx`:

```tsx
        'flex flex-col gap-4 rounded-lg border bg-card text-card-foreground p-5 shadow-[var(--shadow-xs)] overflow-hidden',
```

- [ ] **Step 2: Verify existing card test still passes**

Run: `bun run test src/components/ui/card.test.tsx`
Expected: PASS (card test asserts rendering/children/className passthrough, not exact padding).

- [ ] **Step 3: Test + build**

Run: `bun run test` → PASS.
Run: `CI=true bun run build` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): calmer Card padding + whisper elevation"
```

### Task 5: DataTable — density + tabular figures

Make table headers quieter/uppercase and body figures tabular so columns of IDs/dates/counts align. Restyle only — no prop changes.

**Files:**
- Modify: `src/components/ui/data-table.tsx` (header cell `<th>` classes; body cell `<td>` classes; root table wrapper)

**Interfaces:**
- Consumes: `.tabular-nums` (Task 2).
- Produces: no API change.

- [ ] **Step 1: Locate the header + body cell class strings**

Run: `grep -n "thead\|<th\|<td\|className=" src/components/ui/data-table.tsx | head -40`
Identify the header row `th` className and the body `td` className.

- [ ] **Step 2: Restyle header cells**

On the header `th` className, ensure it includes (merge with existing): `text-xs font-medium uppercase tracking-wide text-muted-foreground`. Keep existing padding/sticky classes.

- [ ] **Step 3: Add tabular figures to body cells**

On the body `td` className, append `tabular-nums`. Keep existing padding/truncate classes.

- [ ] **Step 4: Confirm density**

Ensure header/body row vertical padding is comfortable (`py-2.5` header, `py-2` body) — adjust only if currently tighter. Do not change column logic, the auto `#` column, or sticky mechanics.

- [ ] **Step 5: Test + build**

Run: `bun run test` → PASS (DataTable tests assert data/roles/interaction, not classes).
Run: `CI=true bun run build` → clean.

- [ ] **Step 6: Visual smoke**

`bun start` → open `/clusters` (or any Management page). Confirm quiet uppercase headers, aligned numeric/date columns, comfortable rows, zebra + sticky still work.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/data-table.tsx
git commit -m "feat(ui): quieter DataTable headers + tabular figures"
```

### Task 6: EmptyState — soft-ring icon well

Minor: make the empty state feel designed (ringed icon well, tighter type).

**Files:**
- Modify: `src/components/EmptyState.tsx:13`

**Interfaces:**
- Produces: no API change (`icon/title/description/action` unchanged).

- [ ] **Step 1: Update the icon well className**

Replace line 13 of `src/components/EmptyState.tsx`:

```tsx
    <div className="rounded-full bg-muted p-4 mb-4 ring-1 ring-border">
```

- [ ] **Step 2: Test + build**

Run: `bun run test` → PASS.
Run: `CI=true bun run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmptyState.tsx
git commit -m "feat(ui): ringed EmptyState icon well"
```

---

## Phase 3 — App shell

### Task 7: Breadcrumbs — pure fn + component

Desktop admin consoles orient via breadcrumbs. Build a pure route→crumbs function (unit-tested) and a thin presentational component.

**Files:**
- Create: `src/components/Breadcrumbs.tsx`
- Create: `src/components/Breadcrumbs.test.tsx`

**Interfaces:**
- Produces:
  - `crumbsFromPath(pathname: string): { label: string; to?: string }[]` — last crumb has no `to`.
  - `<Breadcrumbs />` (uses `useLocation`, renders `crumbsFromPath`).

- [ ] **Step 1: Write the failing test**

Create `src/components/Breadcrumbs.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { crumbsFromPath } from './Breadcrumbs';

describe('crumbsFromPath', () => {
  it('maps a section list route to a single unlinked crumb', () => {
    expect(crumbsFromPath('/clusters')).toEqual([{ label: 'Clusters' }]);
  });

  it('maps an edit route to Section > Edit with the section linked', () => {
    expect(crumbsFromPath('/clusters/abc-123/edit')).toEqual([
      { label: 'Clusters', to: '/clusters' },
      { label: 'Edit' },
    ]);
  });

  it('maps a new route to Section > New', () => {
    expect(crumbsFromPath('/business-units/new')).toEqual([
      { label: 'Business Units', to: '/business-units' },
      { label: 'New' },
    ]);
  });

  it('handles nested platform routes', () => {
    expect(crumbsFromPath('/platform/roles')).toEqual([
      { label: 'Platform', to: '/platform' },
      { label: 'Roles' },
    ]);
  });

  it('returns an empty list for the dashboard', () => {
    expect(crumbsFromPath('/dashboard')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/Breadcrumbs.test.tsx`
Expected: FAIL — module not found / `crumbsFromPath` undefined.

- [ ] **Step 3: Implement the component**

Create `src/components/Breadcrumbs.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  clusters: 'Clusters',
  'business-units': 'Business Units',
  'tenant-migrations': 'Tenant Migrations',
  users: 'Users',
  'report-templates': 'Report Templates',
  'print-template-mapping': 'Print Mapping',
  news: 'News',
  broadcasts: 'Broadcasts',
  applications: 'Applications',
  platform: 'Platform',
  roles: 'Roles',
  'super-admins': 'Super Admins',
  'user-platform': 'User Platform',
  'sql-workbench': 'SQL Workbench',
  profile: 'Profile',
  changelog: 'Changelog',
  new: 'New',
  edit: 'Edit',
};

const labelFor = (seg: string): string =>
  SEGMENT_LABELS[seg] ??
  seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Segments that are opaque record ids (uuid-ish) carry no label of their own.
const isIdSegment = (seg: string): boolean =>
  !SEGMENT_LABELS[seg] && /\d/.test(seg) && seg.length > 8;

export function crumbsFromPath(pathname: string): Crumb[] {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0 || (segs.length === 1 && segs[0] === 'dashboard')) {
    return [];
  }
  const meaningful = segs.filter((s) => !isIdSegment(s));
  return meaningful.map((seg, i) => {
    const isLast = i === meaningful.length - 1;
    if (isLast) return { label: labelFor(seg) };
    return { label: labelFor(seg), to: `/${meaningful.slice(0, i + 1).join('/')}` };
  });
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = crumbsFromPath(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
          {c.to ? (
            <Link to={c.to} className="text-muted-foreground hover:text-foreground transition-colors">
              {c.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/Breadcrumbs.test.tsx`
Expected: PASS (5 cases).

Note: `/clusters/abc-123/edit` → `abc-123` is dropped by `isIdSegment` (has a digit, len > 8), leaving `['clusters','edit']` → `[{Clusters,/clusters},{Edit}]`, matching the test.

- [ ] **Step 5: Commit**

```bash
git add src/components/Breadcrumbs.tsx src/components/Breadcrumbs.test.tsx
git commit -m "feat(shell): route breadcrumbs (pure fn + component)"
```

### Task 8: Wire breadcrumb bar into Layout + refine sidebar active state

Add a slim sticky desktop top bar hosting the breadcrumb (account/theme stay in the sidebar — no duplication). Refine the sidebar active state to a soft primary-tinted pill.

**Files:**
- Modify: `src/components/Layout.tsx` (import Breadcrumbs; add desktop bar; adjust main padding)
- Modify: `src/components/Sidebar.tsx:86-93` and `:312-319` (active state)
- Test: `src/components/Sidebar.test.tsx`, `src/components/Layout` tests if present

**Interfaces:**
- Consumes: `Breadcrumbs` (Task 7).

- [ ] **Step 1: Check existing shell tests**

Run: `bun run test src/components/Sidebar.test.tsx`
Expected: PASS (baseline before edits).

- [ ] **Step 2: Import Breadcrumbs in Layout**

In `src/components/Layout.tsx`, add after the `Sidebar` import (line 7):

```tsx
import { Breadcrumbs } from './Breadcrumbs';
```

- [ ] **Step 3: Add the desktop breadcrumb bar**

In `src/components/Layout.tsx`, inside the main content `<div>` (after the mobile `<header>` closes at line 158, before `<main>` at line 161), insert:

```tsx
        {/* Desktop breadcrumb bar */}
        <div className="sticky top-0 z-30 hidden h-12 items-center border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
          <Breadcrumbs />
        </div>
```

- [ ] **Step 4: Reduce main top padding (bar now provides spacing)**

Change `<main>` (line 161) from `py-6 sm:py-10` to `py-6 sm:py-8`:

```tsx
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
```

- [ ] **Step 5: Refine sidebar active state (desktop NavLink)**

In `src/components/Sidebar.tsx`, in the `NavLink` component, replace the active/inactive class branch (lines 86–89) with a soft primary-tinted pill:

```tsx
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
```

And in the mobile `<Link>` block, replace the matching active/inactive branch (lines 312–315) with:

```tsx
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
```

(Keep the left accent bar `<div>` — it now sits under a tinted pill, reinforcing the active item.)

- [ ] **Step 6: Update / add the breadcrumb-bar assertion**

If a `Layout` test exists, add a case; otherwise add to `Sidebar.test.tsx` a focused render test is not applicable (breadcrumb is in Layout). Add a case to `src/components/Breadcrumbs.test.tsx` for the component render:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';

it('renders a linked section crumb and a current-page crumb', () => {
  render(
    <MemoryRouter initialEntries={['/clusters/abc-123/edit']}>
      <Breadcrumbs />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/clusters');
  expect(screen.getByText('Edit')).toBeInTheDocument();
});
```

(Add the imports at the top of the test file if not already present.)

- [ ] **Step 7: Run shell tests**

Run: `bun run test src/components/Sidebar.test.tsx src/components/Breadcrumbs.test.tsx`
Expected: PASS. If a Sidebar test asserted the old `bg-secondary` active class, update it to `bg-primary/10` and re-run.

- [ ] **Step 8: Full test + build**

Run: `bun run test` → PASS.
Run: `CI=true bun run build` → clean.

- [ ] **Step 9: Visual smoke**

`bun start` → navigate Dashboard → Clusters → open a cluster edit. Confirm: breadcrumb bar shows on desktop (hidden on mobile, mobile header unchanged), active nav item is a soft blue pill, no duplicate account controls.

- [ ] **Step 10: Commit**

```bash
git add src/components/Layout.tsx src/components/Sidebar.tsx src/components/Breadcrumbs.test.tsx
git commit -m "feat(shell): desktop breadcrumb bar + softer sidebar active state"
```

---

## Phase 4 — Inherited-page verification + regression

### Task 9: Verify entry/Dashboard under new tokens + full regression

Entry pages and Dashboard already inherit the new palette. Verify contrast/legibility, apply only micro-polish if something reads wrong, then run the whole suite + a clean production build.

**Files:**
- Possibly modify (only if a contrast/spacing issue is found): `src/pages/Login.tsx`, `src/pages/Landing.tsx`, `src/pages/Dashboard.tsx`

**Interfaces:** none.

- [ ] **Step 1: Visual audit of inherited pages**

`bun start`. Check `/`, `/login`, `/dashboard` in BOTH light and dark:
- Login brand panel: `text-primary-foreground/60` labels still legible on the (unchanged) primary-blue panel — yes, primary unchanged.
- Landing hero `text-primary/[0.04]` watermark still subtle on warm canvas.
- Dashboard counts rail figures — confirm they read as tabular where numeric.

- [ ] **Step 2: Apply micro-polish only if needed**

If any muted text fails legibility on the warm canvas, nudge the specific class (e.g. `text-muted-foreground` is already AA by token design). Do NOT restructure these pages. If nothing reads wrong, make no change and note it.

- [ ] **Step 3: Confirm no raw-status-color regressions**

Run: `grep -rn "bg-green-\|text-green-\|bg-amber-\|bg-yellow-" src/pages src/components | grep -v test`
Expected: no matches (rule #5). If any exist (pre-existing), leave unless trivially a status badge — out of scope otherwise.

- [ ] **Step 4: Full regression**

Run: `bun run test`
Expected: PASS — all suites (target ~498+ existing + new Badge/Breadcrumbs cases).

- [ ] **Step 5: Production build**

Run: `CI=true bun run build`
Expected: clean build to `build/`, no lint/type errors (catches any leftover unused imports).

- [ ] **Step 6: Commit (only if Step 2 changed a file)**

```bash
git add -A
git commit -m "chore(design): verify inherited pages under calm-corporate tokens"
```

- [ ] **Step 7: Push branch**

```bash
git push -u origin redesign/calm-corporate-reskin
```

(Do not open a PR to DEV/UAT automatically — the user manages those branches.)

---

## Self-Review

**Spec coverage:**
- §1 tokens (palette/radius/elevation/tabular) → Tasks 1, 2. ✅
- §2 typography (Inter, scale, tabular) → tabular in Task 2/5; type scale already formalized in `PageHeader` + CLAUDE.md styling ref, tokens carry the rest. ✅ (No new type classes needed — existing scale is already the spec's scale; adding class layer would be churn.)
- §3 shell (sidebar refine, topbar/breadcrumb) → Tasks 7, 8. ⚠️ Spec's ⌘K-search + avatar-in-topbar intentionally trimmed (sidebar already owns account/theme; avoiding duplicate controls) — documented in Task 8 and plan intro.
- §4 primitives (Badge/Card/DataTable/Button/EmptyState/PageHeader/read-only) → Tasks 3–6. Button already has correct hierarchy variants; PageHeader + ReadOnlyField already exist and are on-vibe → no task (would be churn). ✅
- §5 Dashboard → already redesigned; inherits + verified in Task 9. ✅ (Adjusted from "bespoke rewrite" — the page is already a status/activity board.)
- §6 entry pages → already redesigned; inherit + verified in Task 9. ✅ (Adjusted from "bespoke rewrite".)
- §7 testing → gates in every task; new tests in Tasks 3, 7, 8. ✅

**Placeholder scan:** No TBD/TODO; every code step shows exact code or exact command. ✅

**Type consistency:** `crumbsFromPath`/`Crumb`/`Breadcrumbs` names consistent across Task 7 impl, Task 7 test, Task 8 wiring. Badge `warning`/`info` strings consistent between test and impl. ✅

**Deviations from spec (intellectual honesty):** Login/Landing/Dashboard were found already-redesigned and on-vibe, so this plan has them INHERIT tokens rather than be rewritten (avoids redoing good work / YAGNI). Topbar trimmed to breadcrumb-only to avoid duplicate account controls. Both changes reduce scope while still delivering the whole-app new look via tokens + primitives + shell.
