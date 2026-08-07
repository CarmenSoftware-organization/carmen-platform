# Management Page

Three shapes. **Pick by where the filtering happens**, which follows from how big the set can get.

| Shape | Pages | Filtering | Has |
|---|---|---|---|
| **Server-side list** | ActivityEvent, Application, BusinessUnit, Cluster, News, ReportTemplate, Role, User, UserPlatform | backend, via `paginate` | `DataTable serverSide`, debounced search, filter Sheet or filter bar, CSV, skeleton, summary band, debug Sheet |
| **Client-filtered list** | SuperAdmin, TenantMigration | in memory | one fetch, `useMemo` filter or `DataTable globalFilter`, CSV, skeleton |
| **Config** | EmailSetting, PlatformConfig, ReportFormGroup | none | cards; no table, no pagination, no CSV |

**Choosing:** can the set grow without bound? → server-side. Is it capped by something structural — an enum, one row per BU, a hand-curated list? → client-filtered, or Config when a table is the wrong shape entirely (see `EmailSettingManagement`, capped at 3).

## Debounce is about requests, not renders

Debounce search **only when typing triggers a fetch**. A client-filtered page re-runs a `useMemo` per keystroke — adding a delay there makes the UI feel broken for no gain.

Two correct implementations exist:

```ts
// setTimeout in the handler — most server-side pages
searchTimeout.current = setTimeout(() => setPaginate(p => ({ ...p, page: 1, search: v })), 400);

// useDebouncedValue — ActivityEventManagement, where four text filters debounce independently
const [debouncedSearch, flushSearch] = useDebouncedValue(searchTerm, 400, resetPage);
```

The hook's third argument fires **when the value settles**, resetting to page 1 in the same render as the new filter value. A separate `useEffect` watching the debounced value would render twice and fire one fetch with mismatched state first.

## Filter UI

A Sheet is the common choice, not a requirement. `ActivityEventManagement` puts seven filters (date range, page path, session, user, event type, BU, app) in an inline bar because they are the page's primary interface, not an occasional refinement. Match the interaction, not the template.

## Server-side page structure

Header (title + Export CSV + Add) → summary band → Card with search + filter Sheet + active-filter badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` + loading overlay → dev-only debug Sheet.

### State shape

```ts
items, totalRows, loading, error,
summary, summaryLoading, summaryError,        // see summary-band.md
searchTerm, statusFilter, showFilters, showDeleted,
rawResponse, copied,
paginate    // { page, perpage, search, sort }
```

`showDeleted` drives a soft-delete toggle through `advance` (`{ where: { deleted_at: null } }` vs `{ not: null }`). Present on Cluster, BusinessUnit, User.

## Non-negotiables

- CSV export on every list page, both shapes — `generateCSV` + `downloadCSV`
- `perpage` persisted per entity: `localStorage['perpage_<type>']`
- Sort string is `"field:asc|desc"`
- `DataTable` adds its own `#` column — never add one
- Loading: `loading && !items.length` → skeleton · `loading && items.length` → overlay · `!loading && !items.length` → `EmptyState` · else table
