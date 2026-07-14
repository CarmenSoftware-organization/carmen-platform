# BU Edit — Default Currency Dropdown (from tenant DB)

**Date:** 2026-07-14
**Status:** Approved (design)
**Page:** `BusinessUnitEdit` → `CalculationSettingsSection` → `Default Currency` field
**Route:** `/business-units/:id/edit`

## Problem

On the Business Unit edit page, `Default Currency ID` is a free-text `<Input>`
(`src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx`). The
operator must type a raw currency UUID by hand — error-prone and opaque.

The tenant already owns a currency master, reachable through the BU's own
database connection. We want to fetch that list and turn the field into a
**dropdown** so the operator picks a currency instead of typing an id.

## Goal

Replace the free-text `default_currency_id` input (edit mode only) with a
native `<select>` populated from the BU's tenant currency master, while
keeping the field robust when the list cannot be loaded.

Non-goals:
- No change to the read-only view (the existing `defaultCurrency` detail card
  stays as-is).
- No CRUD on currencies from this page (list-only).
- No change to how the BU record itself is saved (`default_currency_id` is
  still a plain string on the payload; `doc_version` threading unchanged).

## Data Source

Confirmed against swagger (`http://localhost:4000/swagger`):

```
GET /api/config/{bu_code}/currencies
```

- Lives under the **`/api`** proxy (tenant config), **not** `/api-system` —
  same family as `sqlQueryService` (`/api/config/${buCode}/sql-query/...`).
- Keyed by **`bu_code`** (the BU's `code`), reached via the BU's db connection.
- Paginated: `page`, `perpage`, `search`, `filter`, `searchfields`, `sort`.
- Response is the standard `{ data: Currency[], paginate }` envelope (200 body
  is untyped in swagger — unwrap tolerantly like the other config services).

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Where does the list come from? | Tenant DB via BU code; **lazy** load on entering edit mode. |
| Dropdown component | **Native `<select>`** — matches `Calculation Method` in the same card; no new lib. |
| Which currencies show | **All** (active + inactive); inactive marked `(inactive)`. |
| Load failure / new BU | **Fallback** to the existing free-text `<Input>`. |
| Saved value not in list | Always preserved as a selectable option (value never silently lost). |

## Architecture

Three layers, mirroring how `defaultCurrency` is already threaded
(`BusinessUnitEdit` → `BusinessUnitFormFields` → `CalculationSettingsSection`).

### 1. Service — `src/services/currencyService.ts` (new)

```ts
import api from './api';
import type { TenantCurrency } from '../types';

const base = (buCode: string) => `/api/config/${buCode}/currencies`;

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: unknown };
  return (body?.data ?? body) as T;
}

const currencyService = {
  // Full list for the BU's tenant DB, sorted by code, for a dropdown.
  getForBu: async (buCode: string): Promise<TenantCurrency[]> => {
    const response = await api.get(`${base(buCode)}?perpage=500&sort=code:asc`);
    const list = unwrap<TenantCurrency[]>(response);
    return Array.isArray(list) ? list : [];
  },
};

export default currencyService;
```

- `perpage=500` — a tenant configures a handful of currencies, never near this
  cap. **Known limit:** if a tenant ever exceeds 500 currencies the list
  truncates silently (acceptable; documented here).
- No `filter` — we want active **and** inactive.

### 2. Shared type — `src/types/index.ts`

Add (rule #10 — shared types live here). Mirrors the existing page-local
`DefaultCurrency` shape so the read-only card and dropdown agree:

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

### 3. Orchestrator — `src/pages/BusinessUnitEdit.tsx`

New state:

```ts
const [currencies, setCurrencies] = useState<TenantCurrency[]>([]);
const [currenciesLoading, setCurrenciesLoading] = useState(false);
const [currenciesFailed, setCurrenciesFailed] = useState(false);
const [currenciesLoadedFor, setCurrenciesLoadedFor] = useState<string | null>(null);
```

Loader:

```ts
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

Trigger — fetch once per BU code when the operator enters edit mode on an
existing BU:

```ts
useEffect(() => {
  const code = savedFormData?.code || formData.code; // persisted BU code
  if (editing && !isNew && code && currenciesLoadedFor !== code && !currenciesLoading) {
    loadCurrencies(code);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [editing, isNew]);
```

- Uses the **persisted** BU code (the connection belongs to the saved BU), not
  a code the operator may be mid-editing.
- `currenciesLoadedFor` guards against refetch loops and lets a later edit
  session reuse the already-loaded list.

Pass down through `BusinessUnitFormFields` → `CalculationSettingsSection`:
`currencies`, `currenciesLoading`, `currenciesFailed` (alongside the existing
`defaultCurrency`).

### 4. Field — `src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx`

Only the **edit-mode** `default_currency_id` branch changes. Read-only branch
and the detail card are untouched.

New props on `CalculationSettingsSectionProps`:
`currencies: TenantCurrency[]`, `currenciesLoading: boolean`,
`currenciesFailed: boolean`.

Edit-mode render logic for the field:

1. `currenciesFailed` → render the **existing `<Input type="text">`** (verbatim
   fallback — new BU / bad connection / tenant down all land here).
2. `currenciesLoading` → render a **disabled `<select>`** showing
   `Loading currencies…`.
3. otherwise → native `<select>` (`selectClassName`, `name="default_currency_id"`,
   `value={formData.default_currency_id}`, `onChange={onChange}`):
   - `<option value="">Select currency</option>`
   - one `<option value={c.id}>` per currency, label
     `` `${c.code} — ${c.name}` `` + `' (inactive)'` when `c.is_active === false`.
   - **Preserve current value:** if `default_currency_id` is non-empty and no
     currency in the list has that `id`, prepend one extra `<option>` for it —
     label from `defaultCurrency` (`` `${code} — ${name}` ``) when available,
     else the raw id. Guarantees the saved selection stays visible/selected.

`onChange` reuses the page's generic `handleChange` (name-based) — the selected
`option` value is the currency `id`, so `formData.default_currency_id` updates
exactly as before. No new handler.

## Data Flow

```
enter edit (existing BU)
  └─> useEffect → currencyService.getForBu(code)
        ├─ ok   → currencies[] → <select> options
        └─ fail → currenciesFailed → <Input> text fallback
  operator picks option → handleChange → formData.default_currency_id = c.id
  Save → businessUnitService.update (unchanged payload + doc_version)
```

## Edge Cases

| Case | Behavior |
|------|----------|
| New BU (`isNew`) | No fetch; text `<Input>` (no connection yet). |
| Connection down / fetch error | `currenciesFailed` → text `<Input>`; dev-only console log; no toast. |
| Saved `default_currency_id` not in list (stale/inactive/deleted) | Prepended as a selected option; value never dropped. |
| Empty tenant currency list (ok, but zero rows) | `<select>` with only the "Select currency" placeholder. |
| Operator edits BU `code` in the form | Fetch keyed on persisted code, unaffected. |
| >500 tenant currencies | Silent truncation (documented limit). |

## Testing

- `src/services/currencyService.test.ts` (new) — mock `api`; assert
  `getForBu('T02')` calls `GET /api/config/T02/currencies?perpage=500&sort=code:asc`
  and unwraps both `{ data: [...] }` and a bare-array body; returns `[]` on a
  non-array body.
- `src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx`
  (new) — RTL:
  - renders one `<option>` per currency with `code — name`, `(inactive)` suffix
    on inactive rows;
  - `currenciesFailed` → renders a text `<input name="default_currency_id">`,
    not a `<select>`;
  - a `default_currency_id` absent from `currencies` is still present as a
    selected option;
  - read-only mode unchanged (still shows the detail card).

## Files Touched

| File | Change |
|------|--------|
| `src/services/currencyService.ts` | **new** — `getForBu` |
| `src/services/currencyService.test.ts` | **new** |
| `src/types/index.ts` | add `TenantCurrency` |
| `src/pages/BusinessUnitEdit.tsx` | currency state + loader + effect + prop pass-through |
| `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx` | thread new props |
| `src/pages/businessUnitEdit/sections/CalculationSettingsSection.tsx` | dropdown + fallback |
| `src/pages/businessUnitEdit/sections/CalculationSettingsSection.test.tsx` | **new** |
