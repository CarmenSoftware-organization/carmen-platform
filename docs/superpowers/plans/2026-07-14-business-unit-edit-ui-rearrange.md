# Business Unit Edit UI Rearrange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearrange `/business-units/:id/edit` into a sticky side-nav + scrollspy layout with 6 logical groups and a sticky bottom Save bar.

**Architecture:** A new `useScrollSpy` hook tracks the section in view; a new `BusinessUnitSectionNav` renders the nav (vertical on desktop, horizontal chip scroller on mobile). The existing section components are regrouped into 6 anchored `<section>` blocks inside a repurposed `BusinessUnitFormFields`. The page (`BusinessUnitEdit.tsx`) drops its `<form>` element (mixed form/action cards make implicit submit unsafe) and saves via an explicit `handleSave()` wired to the sticky bar and `Ctrl/⌘+S`.

**Tech Stack:** React 19 + TypeScript, Tailwind 3.4 (HSL tokens), shadcn/ui, react-router-dom v6, Vitest + React Testing Library (jsdom).

## Global Constraints

- **No new external libraries** — use only what's installed.
- **Never modify `src/components/ui/`** primitives.
- **Status/colors via Tailwind tokens** (`bg-primary`, `text-primary-foreground`, `bg-warning`, `text-muted-foreground`, `hover:bg-accent`) — no raw hex or raw green.
- **doc_version optimistic-locking flow unchanged** — `getDocVersion` on load, send only when present, `isVersionConflict` → `notifyVersionConflict()` + refetch.
- **Payload, field set, and validation unchanged** — this is layout-only.
- **Mobile-first responsive**; `md` (768px) is the sidebar pivot, `lg` (1024px) is where the nav goes vertical.
- **Tests:** co-locate `*.test.ts(x)` beside source; explicit `vitest` imports (no globals); assert behavior/roles, not snapshots.
- **Dev-only debug code** stays wrapped (already handled inside `DevDebugSheet`).
- Package manager: `bun`. Run the full suite with `bun run test`.

---

### Task 1: Section registry (`sections.ts`)

Single source of truth for nav ids, labels, badges, and which groups are existing-BU-only. Consumed by the nav, the scrollspy id list, and the content anchors so they can't drift apart.

**Files:**
- Create: `src/pages/businessUnitEdit/sections.ts`
- Test: `src/pages/businessUnitEdit/sections.test.ts`

**Interfaces:**
- Produces:
  - `interface BuEditSection { id: string; label: string; badge?: string; existingOnly?: boolean }`
  - `const BU_EDIT_SECTIONS: BuEditSection[]`
  - `getVisibleSections(isNew: boolean): BuEditSection[]`

- [ ] **Step 1: Write the failing test**

Create `src/pages/businessUnitEdit/sections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BU_EDIT_SECTIONS, getVisibleSections } from './sections';

describe('BU edit sections', () => {
  it('lists all six groups in order', () => {
    expect(BU_EDIT_SECTIONS.map((s) => s.id)).toEqual([
      'general', 'address', 'localization', 'branding', 'advanced', 'users',
    ]);
  });

  it('returns all sections for an existing BU', () => {
    expect(getVisibleSections(false)).toHaveLength(6);
  });

  it('hides existing-only sections for a new BU', () => {
    const ids = getVisibleSections(true).map((s) => s.id);
    expect(ids).toEqual(['general', 'address', 'localization', 'advanced']);
    expect(ids).not.toContain('branding');
    expect(ids).not.toContain('users');
  });

  it('flags Advanced with the SA badge', () => {
    expect(BU_EDIT_SECTIONS.find((s) => s.id === 'advanced')?.badge).toBe('SA');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- sections.test.ts`
Expected: FAIL — cannot resolve `./sections`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/businessUnitEdit/sections.ts`:

```ts
export interface BuEditSection {
  id: string;
  label: string;
  /** Small caution chip shown in the nav (e.g. "SA" = contains super-admin tools). */
  badge?: string;
  /** Rendered only for an existing BU (hidden while creating). */
  existingOnly?: boolean;
}

export const BU_EDIT_SECTIONS: BuEditSection[] = [
  { id: 'general', label: 'General' },
  { id: 'address', label: 'Address & Tax' },
  { id: 'localization', label: 'Localization' },
  { id: 'branding', label: 'Branding', existingOnly: true },
  { id: 'advanced', label: 'Advanced', badge: 'SA' },
  { id: 'users', label: 'Users', existingOnly: true },
];

export const getVisibleSections = (isNew: boolean): BuEditSection[] =>
  isNew ? BU_EDIT_SECTIONS.filter((s) => !s.existingOnly) : BU_EDIT_SECTIONS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- sections.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/sections.ts src/pages/businessUnitEdit/sections.test.ts
git commit -m "feat(bu-edit): section registry for side-nav grouping"
```

---

### Task 2: Scrollspy hook (`useScrollSpy`)

Tracks which anchored section is near the top of the viewport via `IntersectionObserver`, and exposes a manual `select` for nav clicks (with a short suppression window so smooth-scroll doesn't cause flicker). Degrades to "first id" where `IntersectionObserver` is absent (jsdom).

**Files:**
- Create: `src/hooks/useScrollSpy.ts`
- Test: `src/hooks/useScrollSpy.test.ts`

**Interfaces:**
- Produces: `useScrollSpy(ids: string[]): [activeId: string, select: (id: string) => void]`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useScrollSpy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSpy } from './useScrollSpy';

type IOEntry = Pick<IntersectionObserverEntry, 'isIntersecting'> & {
  target: { id: string };
  boundingClientRect: { top: number };
};
type IOCallback = (entries: IOEntry[]) => void;

let ioCallback: IOCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class MockIO {
  constructor(cb: IOCallback) {
    ioCallback = cb;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn();
}

beforeEach(() => {
  ioCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal('IntersectionObserver', MockIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const entry = (id: string, top: number): IOEntry => ({
  isIntersecting: true,
  target: { id },
  boundingClientRect: { top },
});

describe('useScrollSpy', () => {
  it('starts on the first id', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    expect(result.current[0]).toBe('a');
  });

  it('activates the topmost intersecting section', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => ioCallback?.([entry('b', 12)]));
    expect(result.current[0]).toBe('b');
  });

  it('manual select wins and suppresses the observer briefly', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => result.current[1]('c'));
    expect(result.current[0]).toBe('c');
    act(() => ioCallback?.([entry('a', 0)])); // ignored during suppression window
    expect(result.current[0]).toBe('c');
  });

  it('falls back to the first id without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useScrollSpy(['x', 'y']));
    expect(result.current[0]).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- useScrollSpy.test.ts`
Expected: FAIL — cannot resolve `./useScrollSpy`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useScrollSpy.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Highlights the section nearest the top of the viewport as the user scrolls.
 * `select` lets a nav click set the active id immediately and suppress the
 * observer for ~600ms so an in-flight smooth-scroll doesn't flicker the highlight.
 */
export function useScrollSpy(ids: string[]): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');
  const suppressUntil = useRef<number>(0);

  const select = (id: string) => {
    suppressUntil.current = Date.now() + 600;
    setActiveId(id);
  };

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntil.current) return;
        const topmost = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topmost) setActiveId((topmost.target as HTMLElement).id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
    // Re-subscribe only when the set of ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  return [activeId, select];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- useScrollSpy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScrollSpy.ts src/hooks/useScrollSpy.test.ts
git commit -m "feat(bu-edit): useScrollSpy hook for section tracking"
```

---

### Task 3: Section nav component (`BusinessUnitSectionNav`)

Renders the nav from a `BuEditSection[]`. Desktop: vertical, `lg:sticky lg:top-4`. Mobile: horizontal chip scroller, `sticky top-0 z-30`. Active item uses the primary token; `badge` renders a caution chip.

**Files:**
- Create: `src/pages/businessUnitEdit/BusinessUnitSectionNav.tsx`
- Test: `src/pages/businessUnitEdit/BusinessUnitSectionNav.test.tsx`

**Interfaces:**
- Consumes: `BuEditSection`, `getVisibleSections` from `./sections` (Task 1).
- Produces: default export `BusinessUnitSectionNav` with props
  `{ sections: BuEditSection[]; activeId: string; onNavigate: (id: string) => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/businessUnitEdit/BusinessUnitSectionNav.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitSectionNav from './BusinessUnitSectionNav';
import { getVisibleSections } from './sections';

describe('BusinessUnitSectionNav', () => {
  it('renders a button per visible section', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /branding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
  });

  it('hides existing-only sections for a new BU', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(true)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /branding/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /users/i })).toBeNull();
  });

  it('marks the active section with aria-current', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="advanced"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveAttribute('aria-current', 'true');
  });

  it('calls onNavigate with the section id on click', async () => {
    const onNavigate = vi.fn();
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /localization/i }));
    expect(onNavigate).toHaveBeenCalledWith('localization');
  });

  it('renders the SA badge on Advanced', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveTextContent('SA');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- BusinessUnitSectionNav.test.tsx`
Expected: FAIL — cannot resolve `./BusinessUnitSectionNav`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/businessUnitEdit/BusinessUnitSectionNav.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils';
import type { BuEditSection } from './sections';

interface BusinessUnitSectionNavProps {
  sections: BuEditSection[];
  activeId: string;
  onNavigate: (id: string) => void;
}

const BusinessUnitSectionNav: React.FC<BusinessUnitSectionNavProps> = ({
  sections,
  activeId,
  onNavigate,
}) => (
  <nav aria-label="Business unit sections" className="lg:sticky lg:top-4 lg:self-start">
    <div className="sticky top-0 z-30 flex gap-2 overflow-x-auto bg-background pb-2 lg:static lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onNavigate(s.id)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:shrink',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {s.label}
            {s.badge && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-warning/15 text-warning',
                )}
              >
                {s.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </nav>
);

export default BusinessUnitSectionNav;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- BusinessUnitSectionNav.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/BusinessUnitSectionNav.tsx src/pages/businessUnitEdit/BusinessUnitSectionNav.test.tsx
git commit -m "feat(bu-edit): responsive section nav component"
```

---

### Task 4: Repurpose `BusinessUnitFormFields` into anchored content column

Turn the flat `<form>` grid into a plain `<div>` of 6 anchored `<section>` blocks. Existing section components are reused unchanged. Branding/Advanced-extra/Users are passed in as slots so the page keeps ownership of their wiring. Submit buttons are removed (they move to the page's sticky bar in Task 5).

**Files:**
- Modify (full rewrite): `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx`

**Interfaces:**
- Consumes: existing section components under `./sections/`, `SectionFieldProps`, `DefaultCurrency` from `./types`.
- Produces: default export `BusinessUnitFormFields` with props:
  ```ts
  SectionFieldProps & {
    clusters: Cluster[];
    getClusterName: (clusterId: string) => string;
    defaultCurrency: DefaultCurrency | null;
    getCalculationMethodLabel: (method: string) => string;
    onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
    onAddConfigRow: () => void;
    onRemoveConfigRow: (index: number) => void;
    onDbFieldChange: (key: string, value: string) => void;
    onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
    onAddDbExtraRow: () => void;
    onRemoveDbExtraRow: (index: number) => void;
    brandingSlot?: React.ReactNode;
    advancedExtraSlot?: React.ReactNode;
    usersSlot?: React.ReactNode;
  }
  ```
  Anchored section ids: `general`, `address`, `localization`, `branding`, `advanced`, `users` (must match `sections.ts`).

> **Note:** This task changes the component's prop contract, so its only consumer
> (`BusinessUnitEdit.tsx`) will not compile until Task 5 updates the call site. Run
> the component's own render check here; defer the full `bun run test` / build to Task 5.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx` with:

```tsx
import React from 'react';
import BasicInfoSection from './sections/BasicInfoSection';
import HotelInfoSection from './sections/HotelInfoSection';
import CompanyInfoSection from './sections/CompanyInfoSection';
import TaxInfoSection from './sections/TaxInfoSection';
import DateTimeFormatsSection from './sections/DateTimeFormatsSection';
import NumberFormatsSection from './sections/NumberFormatsSection';
import CalculationSettingsSection from './sections/CalculationSettingsSection';
import ConfigurationSection from './sections/ConfigurationSection';
import DatabaseConnectionSection from './sections/DatabaseConnectionSection';
import type { Cluster, BusinessUnitConfig } from '../../types';
import type { SectionFieldProps, DefaultCurrency } from './types';

interface BusinessUnitFormFieldsProps extends SectionFieldProps {
  clusters: Cluster[];
  getClusterName: (clusterId: string) => string;
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
  onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
  onAddConfigRow: () => void;
  onRemoveConfigRow: (index: number) => void;
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
  brandingSlot?: React.ReactNode;
  advancedExtraSlot?: React.ReactNode;
  usersSlot?: React.ReactNode;
}

// scroll-mt keeps an anchored section clear of the sticky mobile nav on jump.
const sectionClass = 'scroll-mt-24 space-y-4';

const BusinessUnitFormFields: React.FC<BusinessUnitFormFieldsProps> = ({
  formData,
  editing,
  fieldErrors,
  onChange,
  onBlur,
  onFocus,
  clusters,
  getClusterName,
  defaultCurrency,
  getCalculationMethodLabel,
  onConfigChange,
  onAddConfigRow,
  onRemoveConfigRow,
  onDbFieldChange,
  onDbExtraChange,
  onAddDbExtraRow,
  onRemoveDbExtraRow,
  brandingSlot,
  advancedExtraSlot,
  usersSlot,
}) => {
  const field = { formData, editing, fieldErrors, onChange, onBlur, onFocus };
  return (
    <div className="min-w-0 space-y-6">
      <section id="general" className={sectionClass}>
        <BasicInfoSection {...field} clusters={clusters} getClusterName={getClusterName} />
        <CalculationSettingsSection
          {...field}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
        />
      </section>

      <section id="address" className={sectionClass}>
        <div className="grid gap-4 lg:grid-cols-2">
          <HotelInfoSection {...field} />
          <CompanyInfoSection {...field} />
        </div>
        <TaxInfoSection {...field} />
      </section>

      <section id="localization" className={sectionClass}>
        <div className="grid gap-4 lg:grid-cols-2">
          <DateTimeFormatsSection {...field} />
          <NumberFormatsSection {...field} />
        </div>
      </section>

      {brandingSlot && (
        <section id="branding" className={sectionClass}>
          {brandingSlot}
        </section>
      )}

      <section id="advanced" className={sectionClass}>
        <ConfigurationSection
          {...field}
          onConfigChange={onConfigChange}
          onAddConfigRow={onAddConfigRow}
          onRemoveConfigRow={onRemoveConfigRow}
        />
        <DatabaseConnectionSection
          {...field}
          onDbFieldChange={onDbFieldChange}
          onDbExtraChange={onDbExtraChange}
          onAddDbExtraRow={onAddDbExtraRow}
          onRemoveDbExtraRow={onRemoveDbExtraRow}
        />
        {advancedExtraSlot}
      </section>

      {usersSlot && (
        <section id="users" className={sectionClass}>
          {usersSlot}
        </section>
      )}
    </div>
  );
};

export default BusinessUnitFormFields;
```

- [ ] **Step 2: Verify existing section tests still pass**

The section components are untouched, so their tests must stay green:

Run: `bun run test -- src/pages/businessUnitEdit/sections`
Expected: PASS (existing `CompanyInfoSection`, `DatabaseConnectionSection`, `HotelInfoSection`, `TaxInfoSection` tests).

- [ ] **Step 3: Commit**

```bash
git add src/pages/businessUnitEdit/BusinessUnitFormFields.tsx
git commit -m "refactor(bu-edit): anchored section layout with slots (page wiring follows)"
```

---

### Task 5: Wire the page — side-nav, scrollspy, drop `<form>`, sticky Save bar

Restructure `BusinessUnitEdit.tsx`: grid of nav + content, scrollspy state, `handleSave()` replacing the `<form>`/`requestSubmit` flow, and the sticky bottom action bar. Also forward `fabClassName` through the debug sheet so the FAB clears the bar.

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx`
- Modify: `src/pages/businessUnitEdit/BusinessUnitDebugSheet.tsx`
- Test: `src/pages/BusinessUnitEdit.test.tsx` (create)

**Interfaces:**
- Consumes: `getVisibleSections` (Task 1), `useScrollSpy` (Task 2), `BusinessUnitSectionNav` (Task 3), repurposed `BusinessUnitFormFields` with slots (Task 4).

- [ ] **Step 1: Write the failing page integration test**

Create `src/pages/BusinessUnitEdit.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/Can', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isSuperAdmin: false }),
}));
// Heavy child cards → trivial stubs (their internals are out of scope here).
vi.mock('../components/TenantMigrationCard', () => ({ default: () => <div>tenant-migration</div> }));
vi.mock('../components/TenantSeedCard', () => ({ default: () => <div>tenant-seed</div> }));
vi.mock('./businessUnitEdit/BusinessUnitBrandingCard', () => ({ default: () => <div>branding-card</div> }));
vi.mock('./businessUnitEdit/BusinessUnitUsersCard', () => ({ default: () => <div>users-card</div> }));
vi.mock('./businessUnitEdit/useBusinessUnitUsers', () => ({
  useBusinessUnitUsers: () => ({ buUsers: [], setBuUsers: vi.fn(), rawClusterUsersResponse: null }),
}));

vi.mock('../services/clusterService', () => ({
  default: { getById: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../services/businessUnitService', () => ({
  default: {
    getById: vi.fn(), getAll: vi.fn(), create: vi.fn(), update: vi.fn(),
    uploadLogo: vi.fn(), uploadAvatar: vi.fn(),
  },
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import BusinessUnitEdit from './BusinessUnitEdit';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeBu = {
  id: 'bu1', cluster_id: 'c1', code: 'BU1', name: 'Test BU',
  is_active: true, is_hq: false, config: [], users: [],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/business-units/new" element={<BusinessUnitEdit />} />
        <Route path="/business-units/:id/edit" element={<BusinessUnitEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
  asMock(clusterService.getAll).mockResolvedValue({ data: [{ id: 'c1', name: 'Acme' }] });
  asMock(businessUnitService.getAll).mockResolvedValue({ data: [] });
  asMock(businessUnitService.getById).mockResolvedValue({ data: fakeBu });
});

describe('BusinessUnitEdit layout', () => {
  it('renders the section nav for an existing BU', async () => {
    renderAt('/business-units/bu1/edit');
    expect(await screen.findByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /advanced/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
  });

  it('scrolls to a section when its nav item is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/business-units/bu1/edit');
    await user.click(await screen.findByRole('button', { name: /advanced/i }));
    const scrollIntoView = (Element.prototype as unknown as { scrollIntoView: ReturnType<typeof vi.fn> })
      .scrollIntoView;
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('shows the sticky Save bar only in edit mode', async () => {
    const user = userEvent.setup();
    renderAt('/business-units/bu1/edit');
    expect(await screen.findByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('hides existing-only nav items for a new BU', async () => {
    renderAt('/business-units/new');
    expect(await screen.findByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /branding/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /users/i })).toBeNull();
    expect(businessUnitService.getById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- BusinessUnitEdit.test.tsx`
Expected: FAIL — no `general` nav button / no `save changes` button (old layout).

- [ ] **Step 3: Update imports**

In `src/pages/BusinessUnitEdit.tsx`, change the React import (drop `useRef`) and the lucide import (add `Save`, `X`, `Loader2`), and add the three new imports.

Line 1 — from:
```tsx
import React, { useState, useEffect, useRef } from 'react';
```
to:
```tsx
import React, { useState, useEffect } from 'react';
```

Line 10 — from:
```tsx
import { Pencil } from 'lucide-react';
```
to:
```tsx
import { Pencil, Save, X, Loader2 } from 'lucide-react';
```

Add after the existing `import BusinessUnitFormFields ...` line (line 29):
```tsx
import BusinessUnitSectionNav from './businessUnitEdit/BusinessUnitSectionNav';
import { getVisibleSections } from './businessUnitEdit/sections';
import { useScrollSpy } from '../hooks/useScrollSpy';
```

Also remove the now-unused `Card`, `CardContent`, `CardHeader` import only **if** they are unused after the rewrite. The loading skeleton (Step 8) still uses `Card`/`CardHeader`/`CardContent`, so **keep them**.

- [ ] **Step 4: Remove `formRef`, add scrollspy + nav handler**

Delete the `formRef` line (line 57):
```tsx
const formRef = useRef<HTMLFormElement>(null);
```

Immediately after `const users = useBusinessUnitUsers(id, formData.cluster_id, isNew);` (line 59), add:
```tsx
const visibleSections = getVisibleSections(isNew);
const [activeSection, selectSection] = useScrollSpy(visibleSections.map((s) => s.id));

const handleNavigate = (sectionId: string) => {
  selectSection(sectionId);
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
```

- [ ] **Step 5: Convert `handleSubmit` to `handleSave` and rewire the shortcut**

Change the `useGlobalShortcuts` onSave (line 65) — from:
```tsx
onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
```
to:
```tsx
onSave: () => { if (editing && !saving) handleSave(); },
```

Change the handler signature (line 304) — from:
```tsx
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
```
to:
```tsx
const handleSave = async () => {
    setSaving(true);
```
Leave the entire rest of the handler body unchanged (payload build, create/update, doc_version, conflict handling).

- [ ] **Step 6: Replace the content region (form + trailing cards) with the nav grid**

Replace the whole block from `<BusinessUnitFormFields` (line 491) through the closing of the Users card — i.e. lines 491–552, the block that currently renders `<BusinessUnitFormFields .../>`, the Tenant/Branding/Users cards — with:

```tsx
        <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:gap-6">
          <BusinessUnitSectionNav
            sections={visibleSections}
            activeId={activeSection}
            onNavigate={handleNavigate}
          />

          <BusinessUnitFormFields
            formData={formData}
            editing={editing}
            fieldErrors={fieldErrors}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            clusters={clusters}
            getClusterName={getClusterName}
            defaultCurrency={defaultCurrency}
            getCalculationMethodLabel={getCalculationMethodLabel}
            onConfigChange={handleConfigChange}
            onAddConfigRow={addConfigRow}
            onRemoveConfigRow={removeConfigRow}
            onDbFieldChange={handleDbFieldChange}
            onDbExtraChange={handleDbExtraChange}
            onAddDbExtraRow={addDbExtraRow}
            onRemoveDbExtraRow={removeDbExtraRow}
            brandingSlot={
              !isNew ? (
                <BusinessUnitBrandingCard
                  logoUrl={logoUrl}
                  avatarUrl={avatarUrl}
                  editing={editing}
                  onUploadLogo={handleUploadLogo}
                  onUploadAvatar={handleUploadAvatar}
                />
              ) : null
            }
            advancedExtraSlot={
              !isNew ? (
                <>
                  <TenantMigrationCard
                    key={id}
                    buId={id!}
                    buCode={formData.code}
                    buName={formData.name}
                    hasDbConnection={formData.db_connection.length > 0}
                    isSuperAdmin={isSuperAdmin}
                  />
                  <TenantSeedCard
                    key={`seed-${id}`}
                    buId={id!}
                    buCode={formData.code}
                    buName={formData.name}
                    hasDbConnection={formData.db_connection.length > 0}
                    isSuperAdmin={isSuperAdmin}
                  />
                </>
              ) : null
            }
            usersSlot={!isNew ? <BusinessUnitUsersCard users={users} /> : null}
          />
        </div>
```

- [ ] **Step 7: Add `pb-24` and the sticky Save bar**

Change the page wrapper (line 472) — from:
```tsx
      <div className="space-y-4 sm:space-y-6">
```
to:
```tsx
      <div className="space-y-4 sm:space-y-6 pb-24">
```

Immediately **after** that wrapper `</div>` closes (it is the `</div>` on line 553, just before the `{/* Debug Sheet ... */}` comment), and still inside `<Layout>`, insert the sticky bar:

```tsx
        {editing && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background md:left-16 lg:left-60">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                {hasChanges ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                    <span>Unsaved changes</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No changes</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={isNew ? () => navigate('/business-units') : handleCancelEdit}
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || (!isNew && !hasChanges)}
                  onClick={handleSave}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : isNew ? 'Create Business Unit' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 8: Simplify the loading skeleton to match the new shape**

In the `if (loading)` branch, replace the `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">…</div>` block **and** the trailing Users-card `<Card>…</Card>` (lines 408–464) with a nav + stacked-column skeleton:

```tsx
          <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:gap-6">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
            <div className="space-y-6">
              <SectionSkeleton fields={5} />
              <SectionSkeleton fields={4} twoCol />
              <SectionSkeleton fields={4} twoCol />
            </div>
          </div>
```

(`SectionSkeleton` and `FieldSkeleton` are already defined just above this block — leave them.)

- [ ] **Step 9: Forward `fabClassName` through the debug sheet**

In `src/pages/businessUnitEdit/BusinessUnitDebugSheet.tsx`, add an optional `fabClassName` prop and forward it. Replace the file body with:

```tsx
import React from 'react';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';

interface BusinessUnitDebugSheetProps {
  rawResponse: unknown;
  rawClusterUsersResponse: unknown;
  id?: string;
  clusterId?: string;
  fabClassName?: string;
}

const BusinessUnitDebugSheet: React.FC<BusinessUnitDebugSheetProps> = ({
  rawResponse,
  rawClusterUsersResponse,
  id,
  clusterId,
  fabClassName,
}) => (
  <DevDebugSheet
    title="Business Unit Debug"
    fabClassName={fabClassName}
    tabs={[
      { key: 'bu', label: 'Business Unit', data: rawResponse, endpoint: `GET /api-system/business-units/${id}` },
      { key: 'users', label: 'Cluster Users', data: rawClusterUsersResponse, endpoint: `GET /api-system/user/clusters/${clusterId}` },
    ]}
  />
);

export default BusinessUnitDebugSheet;
```

Then in `BusinessUnitEdit.tsx`, pass the offset while editing — change the `<BusinessUnitDebugSheet …/>` (line 557) to add:
```tsx
          fabClassName={editing ? 'bottom-20' : undefined}
```

- [ ] **Step 10: Run the page test to verify it passes**

Run: `bun run test -- BusinessUnitEdit.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 11: Run the full suite + production build**

Run: `bun run test`
Expected: PASS (all suites, including the untouched section tests).

Run: `CI=true bun run build`
Expected: build succeeds with no TypeScript/ESLint errors (confirms `useRef` removal, no unused imports, no stray `handleSubmit`/`formRef` references).

- [ ] **Step 12: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx src/pages/businessUnitEdit/BusinessUnitDebugSheet.tsx src/pages/BusinessUnitEdit.test.tsx
git commit -m "feat(bu-edit): side-nav + scrollspy layout with sticky Save bar"
```

---

### Task 6: Manual smoke check

Automated tests can't see sticky positioning, scrollspy highlight, or the mobile chip scroller. Verify in the running app.

**Files:** none (manual).

- [ ] **Step 1: Start the dev server**

Run: `bun start` (serves on `:3304`).

- [ ] **Step 2: Existing BU — desktop**

Open `http://localhost:3304/business-units/76c2fde1-5a15-4dae-9efe-e413a4e041dc/edit`. Confirm:
- Left nav shows 6 groups; the active item highlights as you scroll (scrollspy).
- Clicking a nav item smooth-scrolls to that group; the group clears the top (no clipping).
- `Advanced` shows the `SA` chip and contains Configuration, Database Connection, Tenant Migration, Tenant Seed.
- Press **Edit** → sticky Save bar appears at the bottom, offset to clear the sidebar; "Unsaved changes" toggles as you edit a field.
- Edit a field and **Save** → persists; `Ctrl/⌘+S` also saves; **Cancel** reverts.
- Dev debug FAB (bottom-right) is not hidden behind the Save bar while editing.

- [ ] **Step 3: New BU**

Open `http://localhost:3304/business-units/new`. Confirm the nav shows only General / Address & Tax / Localization / Advanced (no Branding, no Users), and the sticky bar reads "Create Business Unit".

- [ ] **Step 4: Mobile width**

Narrow the viewport below `md`. Confirm the nav becomes a horizontal chip scroller pinned to the top, groups stack full-width, and the Save bar spans full width.

- [ ] **Step 5: Record the result**

Note pass/fail per check. If anything fails, fix in the relevant task's files and re-run `bun run test` before re-checking.

---

## Self-Review

**Spec coverage:**
- Side-nav + scrollspy layout → Tasks 2, 3, 5. ✓
- 6-group structure (Branding separate) → Task 1 registry + Task 4 anchors. ✓
- Desktop sticky / mobile chip scroller → Task 3 component + Task 6 check. ✓
- Sticky Save bar (sidebar-matched offset, unsaved indicator) → Task 5 Step 7. ✓
- Drop `<form>` → `handleSave()` (Ctrl+S + button) → Task 5 Steps 4–5, 7. ✓
- Existing-only groups hidden when `isNew` → Task 1 `getVisibleSections`, Task 4 slots, Task 5 test. ✓
- SA badge on Advanced → Task 1 + Task 3. ✓
- doc_version / payload / validation unchanged → Task 5 leaves handler body intact. ✓
- Debug FAB offset → Task 5 Step 9. ✓
- Tests (hook, nav, page) → Tasks 2, 3, 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** Section ids (`general`/`address`/`localization`/`branding`/`advanced`/`users`) match across `sections.ts`, `BusinessUnitFormFields` anchors, and the scrollspy id list. `useScrollSpy` returns `[string, (id: string) => void]`, consumed as `[activeSection, selectSection]`. `BusinessUnitSectionNav` props `{ sections, activeId, onNavigate }` match the page call site. `handleSave` (no args) is referenced by the shortcut and both sticky-bar buttons. ✓
