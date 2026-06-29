# Component / Page Tests (RTL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Add React Testing Library to the existing Vitest+jsdom runner and write the first component tests (presentational split pieces) plus one page-level integration test (`ClusterEdit`).

**Architecture:** RTL renders into jsdom (already the Vitest env). A `vitest.setup.ts` registers jest-dom matchers. The page test mocks the shell (`Layout`, `Can`) and data deps (services + `api`) and uses a real `MemoryRouter` for routing.

**Tech Stack:** Vitest 4, @testing-library/react 16, jest-dom, user-event, React 19, TS strict.

## Global Constraints

- Tests use explicit imports: `import { describe, it, expect, vi } from 'vitest'`.
- No app-code changes — pure-additive (deps, setup, config, `*.test.tsx`).
- `bun run build` must stay green; test files are never imported by the app.
- Assert behavior/roles/text — no snapshots.
- The functions/components under test already exist → suites are expected to pass on first run.

---

### Task 1: RTL infra + presentational tests

**Files:**
- Modify: `package.json` (devDeps), `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create/Test: `src/pages/businessUnitEdit/shared.test.tsx`, `src/pages/businessUnitEdit/sections/TaxInfoSection.test.tsx`

**Interfaces:**
- Consumes: `shared.tsx` exports `ReadOnlyText`, `ReadOnlyTextarea`, `CollapsibleSection`; `TaxInfoSection` default export takes `SectionFieldProps`; `../types` exports `initialFormData`, `SectionFieldProps`.

- [ ] **Step 1: Install dev deps**

```bash
bun add -d @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: three packages added to `devDependencies`; no peer-dep errors (RTL 16 supports React 19).

- [ ] **Step 2: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Update `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/pages/businessUnitEdit/**'],
    },
  },
});
```

- [ ] **Step 4: Write `src/pages/businessUnitEdit/shared.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadOnlyText, ReadOnlyTextarea, CollapsibleSection } from './shared';

describe('ReadOnlyText', () => {
  it('renders the value', () => {
    render(<ReadOnlyText value="hello" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
  it('renders a dash when empty', () => {
    render(<ReadOnlyText value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('ReadOnlyTextarea', () => {
  it('renders the value', () => {
    render(<ReadOnlyTextarea value="some notes" />);
    expect(screen.getByText('some notes')).toBeInTheDocument();
  });
  it('renders a dash when empty', () => {
    render(<ReadOnlyTextarea value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('CollapsibleSection', () => {
  it('hides content by default and reveals it on header click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="My Section">
        <p>secret body</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText('secret body')).not.toBeInTheDocument();
    await user.click(screen.getByText('My Section'));
    expect(screen.getByText('secret body')).toBeInTheDocument();
  });
  it('always shows content when forceOpen, even after a header click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Forced" forceOpen>
        <p>always here</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText('always here')).toBeInTheDocument();
    await user.click(screen.getByText('Forced'));
    expect(screen.getByText('always here')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Write `src/pages/businessUnitEdit/sections/TaxInfoSection.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaxInfoSection from './TaxInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: { ...initialFormData, tax_no: 'TX-1', branch_no: 'BR-9' },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('TaxInfoSection', () => {
  it('renders read-only values (no inputs) when not editing', () => {
    render(<TaxInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('TX-1')).toBeInTheDocument();
    expect(screen.getByText('BR-9')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tax number')).not.toBeInTheDocument();
  });

  it('renders inputs holding the values when editing', () => {
    render(<TaxInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Tax number')).toHaveValue('TX-1');
    expect(screen.getByPlaceholderText('Branch number')).toHaveValue('BR-9');
  });

  it('calls onChange when typing in an input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaxInfoSection {...baseProps({ editing: true, onChange })} />);
    await user.type(screen.getByPlaceholderText('Tax number'), 'X');
    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the new suites**

Run: `bun run test`
Expected: PASS — `shared.test.tsx`, `TaxInfoSection.test.tsx` green, plus the existing 48 util tests.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock vitest.config.ts vitest.setup.ts \
  src/pages/businessUnitEdit/shared.test.tsx \
  src/pages/businessUnitEdit/sections/TaxInfoSection.test.tsx
git commit -m "test: add RTL + presentational component tests (shared, TaxInfoSection)"
```

---

### Task 2: `ClusterEdit` page integration test

**Files:**
- Create/Test: `src/pages/ClusterEdit.test.tsx`

**Interfaces:**
- Consumes: `ClusterEdit` default export (a routed page). Mocks: `../components/Layout`, `../components/Can`, `../services/clusterService`, `../services/businessUnitService`, `../services/userService`, `../services/api`. Real `react-router-dom` `MemoryRouter`.
- Notes (verified against source): `fetchCluster` does `const cluster = data.data || data` → mock `getById` returning `{ data: fakeCluster }`. Read-only code renders `{formData.code || '-'}` as text. Header is `Cluster Details` (existing, view) / `Add Cluster` (new). Edit button is gated by `<Can>` (mocked to render children).

- [ ] **Step 1: Write `src/pages/ClusterEdit.test.tsx`**

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/Can', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock data deps.
const listResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };
vi.mock('../services/clusterService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    uploadLogo: vi.fn(),
    uploadAvatar: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import ClusterEdit from './ClusterEdit';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import api from '../services/api';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeCluster = {
  id: 'c1',
  code: 'CLS1',
  name: 'Acme Cluster',
  alias_name: 'ACM',
  max_license_bu: 5,
  is_active: true,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clusters/new" element={<ClusterEdit />} />
        <Route path="/clusters/:id/edit" element={<ClusterEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(clusterService.getAll).mockResolvedValue(listResponse);
  asMock(businessUnitService.getAll).mockResolvedValue(listResponse);
  asMock(userService.getAll).mockResolvedValue(listResponse);
  asMock(api.get).mockResolvedValue({ data: { data: [] } });
});

describe('ClusterEdit (integration)', () => {
  it('loads an existing cluster into read-only view, then reveals inputs on Edit', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    expect(await screen.findByText('Acme Cluster')).toBeInTheDocument();
    expect(screen.getByText('CLS1')).toBeInTheDocument();
    expect(screen.getByText('Cluster Details')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
    expect(screen.getByDisplayValue('CLS1')).toBeInTheDocument();
  });

  it('starts a new cluster in edit mode without calling getById', async () => {
    renderAt('/clusters/new');
    expect(await screen.findByText('Add Cluster')).toBeInTheDocument();
    expect(clusterService.getById).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Cluster code')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the page test**

Run: `bun run test src/pages/ClusterEdit.test.tsx`
Expected: PASS. (Some "not wrapped in act(...)" console warnings from async mount effects are acceptable — `findBy*` already awaits the state settles; do not add app-code changes to silence them.)

- [ ] **Step 3: Run the full suite**

Run: `bun run test`
Expected: PASS — util tests + presentational tests + ClusterEdit page test all green.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClusterEdit.test.tsx
git commit -m "test: add ClusterEdit page integration test (mocked services + router)"
```

---

### Task 3: Final verification

- [ ] **Step 1: Coverage**

Run: `bun run test:cov`
Expected: PASS; coverage table now includes `src/pages/businessUnitEdit/**` rows (shared, TaxInfoSection) alongside `src/utils/**`.

- [ ] **Step 2: Build unaffected**

Run: `bun run build`
Expected: green; checker lints/type-checks the new `.test.tsx` files without error; bundle emitted.

- [ ] **Step 3: Lint the new test files**

Run: `bunx eslint "src/**/*.test.tsx"`
Expected: no errors (the `React` import in `ClusterEdit.test.tsx` is allowed by `varsIgnorePattern ^(_|React$)`).

## Self-Review

- **Spec coverage:** deps (T1.S1), setup file (T1.S2), config include/setupFiles/coverage (T1.S3), shared + TaxInfoSection tests (T1.S4–5), ClusterEdit page test with the documented mock strategy (T2), verification incl. coverage + build (T3). ✓
- **Placeholder scan:** none — full test code in every step. ✓
- **Type consistency:** `SectionFieldProps`/`initialFormData` imported from `../types`; mock factories return `{ default: ... }` matching default-export services; `getById` mock returns `{ data: fakeCluster }` matching the page's `data.data || data` unwrap. ✓
