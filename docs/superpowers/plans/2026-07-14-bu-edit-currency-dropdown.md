# BU Edit — Default Currency Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `Default Currency ID` input on the BU edit page with a dropdown populated from the BU's tenant currency master, falling back to text when the list can't load.

**Architecture:** New `currencyService.getForBu(buCode)` hits `GET /api/config/{buCode}/currencies` (tenant `/api` proxy). `BusinessUnitEdit` lazily loads the list on entering edit mode and threads `currencies` / `currenciesLoading` / `currenciesFailed` down through `BusinessUnitFormFields` to `CalculationSettingsSection`, which renders a native `<select>` (or the old text input on failure/new-BU).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + React Testing Library, axios (`src/services/api.ts`).

Spec: `docs/superpowers/specs/2026-07-14-bu-edit-currency-dropdown-design.md`

## Global Constraints

- Package manager: **Bun** (`bunx vitest run <path>` to run a single test file).
- Tests: co-locate `*.test.ts(x)` beside source; explicit `vitest` imports (no globals); assert behavior, not snapshots.
- Tenant config endpoints live under the **`/api`** proxy, NOT `/api-system`.
- Shared types go in `src/types/index.ts` (page-local `FormData` stays in the page).
- Add new component props as **optional** so consumers keep compiling; `currencies` is `TenantCurrency[] | null` — `null` means "not loaded" → text-input fallback.
- Never modify `src/components/ui/` primitives.
- Wrap any dev-only logging in `process.env.NODE_ENV === 'development'`.
- Relative import depth from `src/pages/businessUnitEdit/sections/`: `../../../types` = `src/types`, `../../../components/...` = `src/components/...`.

---

### Task 1: Tenant currency type + service

**Files:**
- Modify: `src/types/index.ts` (add `TenantCurrency` interface)
- Create: `src/services/currencyService.ts`
- Test: `src/services/currencyService.test.ts`

**Interfaces:**
- Consumes: `api` default export from `src/services/api.ts` (`.get`).
- Produces:
  - `interface TenantCurrency { id: string; code: string; name: string; symbol?: string; decimal_places?: number; is_active?: boolean; description?: string; }` (exported from `src/types`).
  - `currencyService.getForBu(buCode: string): Promise<TenantCurrency[]>` — GETs `/api/config/${buCode}/currencies?perpage=500&sort=code:asc`, unwraps `{ data }`, returns `[]` for a non-array body.

- [ ] **Step 1: Add the shared type**

Append to `src/types/index.ts` (near the other DTO interfaces):

```ts
export interface TenantCurrency {
  id: string;
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
  description?: string;
}
```

- [ ] **Step 2: Write the failing service test**

Create `src/services/currencyService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import currencyService from './currencyService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn() },
}));

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

describe('currencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getForBu fetches the tenant currencies endpoint sorted by code', async () => {
    const rows = [{ id: '1', code: 'USD', name: 'US Dollar', is_active: true }];
    mockApi.get.mockResolvedValue({ data: { data: rows } });
    const result = await currencyService.getForBu('T02');
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/config/T02/currencies?perpage=500&sort=code:asc',
    );
    expect(result).toEqual(rows);
  });

  it('getForBu tolerates a bare-array body', async () => {
    const rows = [{ id: '2', code: 'THB', name: 'Thai Baht' }];
    mockApi.get.mockResolvedValue({ data: rows });
    const result = await currencyService.getForBu('T02');
    expect(result).toEqual(rows);
  });

  it('getForBu returns [] when the body is not an array', async () => {
    mockApi.get.mockResolvedValue({ data: { data: { nope: true } } });
    const result = await currencyService.getForBu('T02');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/services/currencyService.test.ts`
Expected: FAIL — cannot find module `./currencyService`.

- [ ] **Step 4: Write the service**

Create `src/services/currencyService.ts`:

```ts
import api from './api';
import type { TenantCurrency } from '../types';

// Tenant currency master lives under the /api proxy, keyed by BU code.
const base = (buCode: string) => `/api/config/${buCode}/currencies`;

// Unwrap the standard `{ data: ... }` envelope, tolerating a bare body.
function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: unknown };
  return (body?.data ?? body) as T;
}

const currencyService = {
  // Full list for a BU's tenant DB, sorted by code, for a dropdown.
  getForBu: async (buCode: string): Promise<TenantCurrency[]> => {
    const response = await api.get(`${base(buCode)}?perpage=500&sort=code:asc`);
    const list = unwrap<TenantCurrency[]>(response);
    return Array.isArray(list) ? list : [];
  },
};

export default currencyService;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx vitest run src/services/currencyService.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/currencyService.ts src/services/currencyService.test.ts
git commit -m "feat(bu-edit): tenant currency service + TenantCurrency type"
```

---

### Task 2: CalculationSettingsSection dropdown + fallback

**Files:**
- Modify: `src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx`
- Test: `src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx` (new)

**Interfaces:**
- Consumes: `TenantCurrency` from `src/types` (Task 1); existing `SectionFieldProps`, `DefaultCurrency` from `../types`; `selectClassName`, `ReadOnlyText`, `CollapsibleSection` from `../shared`.
- Produces: `CalculationSettingsSection` now accepts three optional props —
  `currencies?: TenantCurrency[] | null`, `currenciesLoading?: boolean`,
  `currenciesFailed?: boolean` — added to `CalculationSettingsSectionProps`.
  Edit-mode render rule for `default_currency_id`:
  1. `currenciesLoading` → disabled `<select>` showing `Loading currencies…`.
  2. `!currenciesFailed && Array.isArray(currencies)` → real `<select>` (see below).
  3. else → existing text `<Input>` (fallback for `null`/failed/new-BU).

- [ ] **Step 1: Write the failing test**

Create `src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalculationSettingsSection from './CalculationSettingsSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';
import type { TenantCurrency } from '../../../types';

const label = () => 'Average';

const base = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: { ...initialFormData },
  editing: true,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

const currencies: TenantCurrency[] = [
  { id: 'usd', code: 'USD', name: 'US Dollar', is_active: true },
  { id: 'thb', code: 'THB', name: 'Thai Baht', is_active: false },
];

describe('CalculationSettingsSection currency field', () => {
  it('renders a select option per currency, marking inactive ones', () => {
    render(
      <CalculationSettingsSection
        {...base()}
        defaultCurrency={null}
        getCalculationMethodLabel={label}
        currencies={currencies}
      />,
    );
    const select = screen.getByLabelText('Default Currency ID') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'USD — US Dollar' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'THB — Thai Baht (inactive)' })).toBeInTheDocument();
  });

  it('falls back to a text input when the list failed to load', () => {
    render(
      <CalculationSettingsSection
        {...base()}
        defaultCurrency={null}
        getCalculationMethodLabel={label}
        currenciesFailed
      />,
    );
    const field = screen.getByLabelText('Default Currency ID');
    expect(field.tagName).toBe('INPUT');
  });

  it('keeps the saved currency id as a selected option when absent from the list', () => {
    render(
      <CalculationSettingsSection
        {...base({ formData: { ...initialFormData, default_currency_id: 'legacy-id' } })}
        defaultCurrency={{ id: 'legacy-id', code: 'JPY', name: 'Yen', symbol: '¥' }}
        getCalculationMethodLabel={label}
        currencies={currencies}
      />,
    );
    const select = screen.getByLabelText('Default Currency ID') as HTMLSelectElement;
    expect(select.value).toBe('legacy-id');
    expect(screen.getByRole('option', { name: 'JPY — Yen' })).toBeInTheDocument();
  });

  it('renders the read-only detail card when not editing', () => {
    render(
      <CalculationSettingsSection
        {...base({ editing: false })}
        defaultCurrency={{ id: 'usd', code: 'USD', name: 'US Dollar', symbol: '$', is_active: true }}
        getCalculationMethodLabel={label}
        currencies={currencies}
      />,
    );
    expect(screen.getByText('Default Currency')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx`
Expected: FAIL — the edit field is currently an `<Input>`, so `select.tagName` / option-role queries fail.

- [ ] **Step 3: Implement the dropdown**

Replace the whole file `src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx` with:

```tsx
import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import type { SectionFieldProps, DefaultCurrency } from '../types';
import type { TenantCurrency } from '../../../types';

interface CalculationSettingsSectionProps extends SectionFieldProps {
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
  currencies?: TenantCurrency[] | null;
  currenciesLoading?: boolean;
  currenciesFailed?: boolean;
}

const currencyLabel = (c: TenantCurrency) =>
  `${c.code} — ${c.name}${c.is_active === false ? ' (inactive)' : ''}`;

const CalculationSettingsSection: React.FC<CalculationSettingsSectionProps> = ({
  formData,
  editing,
  onChange,
  defaultCurrency,
  getCalculationMethodLabel,
  currencies,
  currenciesLoading = false,
  currenciesFailed = false,
}) => {
  const useDropdown = editing && !currenciesFailed && Array.isArray(currencies);
  const currentId = formData.default_currency_id;
  // Preserve a saved id that isn't in the fetched list so the value never drops.
  const currentInList = !currentId || (currencies ?? []).some((c) => c.id === currentId);
  const currentLabel =
    defaultCurrency && defaultCurrency.id === currentId
      ? `${defaultCurrency.code} — ${defaultCurrency.name}`
      : currentId;

  const renderCurrencyField = () => {
    if (editing && currenciesLoading) {
      return (
        <select id="default_currency_id" name="default_currency_id" className={selectClassName} disabled>
          <option>Loading currencies…</option>
        </select>
      );
    }
    if (useDropdown) {
      return (
        <select
          id="default_currency_id"
          name="default_currency_id"
          value={currentId}
          onChange={onChange}
          className={selectClassName}
        >
          <option value="">Select currency</option>
          {currentId && !currentInList && <option value={currentId}>{currentLabel}</option>}
          {(currencies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {currencyLabel(c)}
            </option>
          ))}
        </select>
      );
    }
    if (editing) {
      return (
        <Input
          type="text"
          id="default_currency_id"
          name="default_currency_id"
          value={currentId}
          onChange={onChange}
          placeholder="Default currency ID"
        />
      );
    }
    return <ReadOnlyText value={currentId} />;
  };

  return (
    <CollapsibleSection title="Calculation Settings" description="Calculation method and currency configuration" forceOpen>
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="calculation_method">Calculation Method</Label>
            {editing ? (
              <select
                id="calculation_method"
                name="calculation_method"
                value={formData.calculation_method}
                onChange={onChange}
                className={selectClassName}
              >
                <option value="">Select method</option>
                <option value="average">Average</option>
                <option value="fifo">FIFO</option>
              </select>
            ) : (
              <ReadOnlyText value={getCalculationMethodLabel(formData.calculation_method)} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_currency_id">Default Currency ID</Label>
            {renderCurrencyField()}
          </div>
        </div>
        {!editing && defaultCurrency && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Default Currency</span>
              <Badge variant={defaultCurrency.is_active ? 'success' : 'secondary'} className="text-xs">
                {defaultCurrency.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Code</span>
                <div className="text-sm font-medium">{defaultCurrency.code || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Name</span>
                <div className="text-sm">{defaultCurrency.name || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Symbol</span>
                <div className="text-sm">{defaultCurrency.symbol || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Decimal Places</span>
                <div className="text-sm">{defaultCurrency.decimal_places ?? '-'}</div>
              </div>
            </div>
            {defaultCurrency.description && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Description</span>
                <div className="text-sm">{defaultCurrency.description}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default CalculationSettingsSection;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx
git commit -m "feat(bu-edit): currency dropdown with text-input fallback in CalculationSettingsSection"
```

---

### Task 3: Thread currencies through FormFields + wire BusinessUnitEdit

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx`
- Modify: `src/pages/BusinessUnitEdit.tsx`

**Interfaces:**
- Consumes: `currencyService.getForBu` (Task 1); the new optional props on `CalculationSettingsSection` (Task 2).
- Produces: `BusinessUnitFormFields` forwards `currencies?: TenantCurrency[] | null`, `currenciesLoading?: boolean`, `currenciesFailed?: boolean` to `CalculationSettingsSection`. `BusinessUnitEdit` owns the currency state + loader + lazy-load effect.

- [ ] **Step 1: Add the pass-through props to BusinessUnitFormFields**

In `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx`:

Add the `TenantCurrency` import after the existing type imports (line 11–12 area):

```tsx
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../../types';
```

Add three fields to `BusinessUnitFormFieldsProps` (right after `defaultCurrency: DefaultCurrency | null;`):

```tsx
  currencies?: TenantCurrency[] | null;
  currenciesLoading?: boolean;
  currenciesFailed?: boolean;
```

Destructure them in the component signature (after `defaultCurrency,`):

```tsx
  currencies,
  currenciesLoading,
  currenciesFailed,
```

Pass them to `CalculationSettingsSection` (extend the existing element):

```tsx
        <CalculationSettingsSection
          {...field}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
          currencies={currencies}
          currenciesLoading={currenciesLoading}
          currenciesFailed={currenciesFailed}
        />
```

- [ ] **Step 2: Add currency state + loader to BusinessUnitEdit**

In `src/pages/BusinessUnitEdit.tsx`:

Add imports — service (after the `clusterService` import, line 7) and type (extend the `../types` import, line 19):

```tsx
import currencyService from '../services/currencyService';
```
```tsx
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../types';
```

Add state after the `defaultCurrency` state (line 50):

```tsx
  const [currencies, setCurrencies] = useState<TenantCurrency[] | null>(null);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [currenciesFailed, setCurrenciesFailed] = useState(false);
  const [currenciesLoadedFor, setCurrenciesLoadedFor] = useState<string | null>(null);
```

Add the loader function right after `handleCancelEdit` (after line 90):

```tsx
  const loadCurrencies = async (buCode: string) => {
    setCurrenciesLoading(true);
    setCurrenciesFailed(false);
    try {
      const list = await currencyService.getForBu(buCode);
      setCurrencies(list);
      setCurrenciesLoadedFor(buCode);
    } catch (err) {
      setCurrenciesFailed(true);
      if (process.env.NODE_ENV === 'development') console.error('loadCurrencies', err);
    } finally {
      setCurrenciesLoading(false);
    }
  };
```

- [ ] **Step 3: Add the lazy-load effect**

In `src/pages/BusinessUnitEdit.tsx`, add a new `useEffect` right after the existing `[id]` effect (after line 98):

```tsx
  // Lazy-load the tenant currency list the first time the operator edits an existing BU.
  useEffect(() => {
    const buCode = savedFormData.code || formData.code;
    if (editing && !isNew && buCode && currenciesLoadedFor !== buCode && !currenciesLoading) {
      loadCurrencies(buCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isNew]);
```

- [ ] **Step 4: Pass the props into BusinessUnitFormFields**

In `src/pages/BusinessUnitEdit.tsx`, extend the `<BusinessUnitFormFields>` element (after `defaultCurrency={defaultCurrency}`, line 473):

```tsx
            currencies={currencies}
            currenciesLoading={currenciesLoading}
            currenciesFailed={currenciesFailed}
```

- [ ] **Step 5: Typecheck + run the full unit suite**

Run: `bun run build`
Expected: build succeeds (no TS errors).

Run: `bun run test`
Expected: all tests pass, including `currencyService` (3) and `CalculationSettingsSection` (4).

- [ ] **Step 6: Manual smoke check (dev server)**

Run `bun start`, open `http://localhost:3304/business-units/9addc856-b7b5-40f5-ad44-ed7b8521987e/edit`, click **Edit**. Verify: the Default Currency field is a dropdown listing the tenant currencies; the saved value stays selected; picking another currency then Save persists it. If the tenant connection is unavailable, the field renders as a text input (fallback) — confirm no crash.

- [ ] **Step 7: Commit**

```bash
git add src/pages/businessUnitEdit/BusinessUnitFormFields.tsx src/pages/BusinessUnitEdit.tsx
git commit -m "feat(bu-edit): lazy-load tenant currencies and feed the dropdown"
```

---

## Self-Review Notes

- **Spec coverage:** service/endpoint → Task 1; type → Task 1; dropdown + `(inactive)` label + preserve-current-value + loading/failed fallback → Task 2; lazy-load on edit + prop threading + edge cases (new BU, connection down) → Task 3; both test files → Tasks 1 & 2.
- **Fallback semantics:** `currencies` is `null` until a load is attempted, so an un-wired or new-BU section renders the text input (spec's fallback intent); an empty tenant list is `[]` → a select with only the placeholder.
- **Type consistency:** `TenantCurrency` (Task 1) is imported identically in Tasks 2 and 3; `getForBu` signature matches its call site; the three new props share the same names/types across section, FormFields, and page.
