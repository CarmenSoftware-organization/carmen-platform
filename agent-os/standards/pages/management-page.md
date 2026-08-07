# Management Page

Three levels. Only two are legitimate destinations.

| Level | Pages | Has |
|---|---|---|
| **Full** ← target | Cluster, BusinessUnit, User, UserPlatform, News, Role, Application, ReportTemplate | server-side `DataTable`, debounced search, filter Sheet, CSV, skeleton, summary band, debug Sheet |
| **Config** ← legitimate | EmailSetting, PlatformConfig, ReportFormGroup | cards only — no table, no pagination, no CSV |
| **Lightweight** ← debt | ActivityEvent, SuperAdmin, TenantMigration | CSV + skeleton, but no debounced search and no filter Sheet |

**New list pages are Full.** Lightweight is not a level to aim for — those three predate the pattern and should be brought up when touched.

Choose **Config** when the row count is bounded by something structural — an enum, a fixed set of purposes. A DataTable over three rows is the wrong tool. See `EmailSettingManagement` (capped at 3, ever).

## Full page structure

Header (title + Export CSV + Add) → summary band → Card with search + filter Sheet + active-filter badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` + loading overlay → dev-only debug Sheet.

## State shape

```ts
items, totalRows, loading, error,
summary, summaryLoading, summaryError,        // see summary-band.md
searchTerm, statusFilter, showFilters, showDeleted,
rawResponse, copied,
paginate    // { page, perpage, search, sort }
```

`showDeleted` drives a soft-delete toggle through `advance` (`{ where: { deleted_at: null } }` vs `{ not: null }`). Present on Cluster, BusinessUnit, User.

## Non-negotiables

- Search debounced **400ms** (`setTimeout` inside a `useEffect`)
- CSV export on every Full page — `generateCSV` + `downloadCSV`
- `perpage` persisted per entity: `localStorage['perpage_<type>']`
- Sort string is `"field:asc|desc"`
- `DataTable` adds its own `#` column — never add one
- Loading: `loading && !items.length` → skeleton · `loading && items.length` → overlay · `!loading && !items.length` → `EmptyState` · else table
