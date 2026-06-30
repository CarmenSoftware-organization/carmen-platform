# Tenant Migration Overview page (all BUs)

**Date:** 2026-06-30
**Status:** Approved (design)
**Page:** `src/pages/TenantMigrationManagement.tsx` (new)

## Problem

Each Business Unit (BU) is a tenant with its own database, reached via the BU's
stored `db_connection`. When the platform ships schema changes, every tenant DB
must have those migrations applied. Today the only UI is the per-BU
`TenantMigrationCard` on the BU **edit** page — to audit the whole fleet, an
operator must open every BU one at a time.

We want a single **overview page** that lists all BUs with each one's migration
status (up to date vs. has pending migrations), lets the operator **check** any
or all of them on demand, and **apply** migrations either per-BU or to all BUs at
once.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Scope | Show status + deploy per-BU + **Deploy all** |
| Status loading | **On-demand** — "Check all" button + per-row check (never auto-fetched on page load) |
| Layout | **Hybrid** — load all BUs in one request, render in a client-side `DataTable` (client search/sort/pagination). "All" then unambiguously means the whole fleet. |
| Access | Page reachable with **`cluster.read`** (group **Organization**); action buttons gated to **super-admin** with a tooltip (backend independently enforces super-admin) |
| Per-row Apply | **Streaming** progress shown inline in the row's status cell ("Applying X/Y" + current migration name) |
| Export CSV | **Yes** — follows Management-page rule 13 |
| Tests | **Yes** — Vitest component test (mock service, real `MemoryRouter`) |
| State architecture | **Centralized at the page** (a `rowState` map) so "Check all" / "Deploy all" can coordinate across rows and flip badges live |

## Backend contract (already exists)

The per-BU endpoints are confirmed and already used by `TenantMigrationService`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api-system/tenant/migrations/{bu_id}/status` | Pending-migration status (one BU) |
| `POST` | `/api-system/tenant/migrations/{bu_id}/deploy/stream` | Apply pending migrations, NDJSON `ProgressEvent` stream |

All are **super-admin only** (bearer token + `x-app-id` added by the axios
interceptor / by `deployStream` for the fetch path).

### "All" mode (Deploy all)
The backend already supports a batch deploy (`bu_id='all'`) — the streaming work
added `BatchDeploySummary`, the `bu-complete` `ProgressEvent`, and message-pattern
routing for it. The frontend will call the **same** `/deploy/stream` path with
`bu_id='all'` via a new thin `deployAllStream(onEvent)` wrapper.

> **Assumption to verify on the first live call:** that `POST
> /api-system/tenant/migrations/all/deploy/stream` streams per-BU
> `start`/`applying`/`bu-complete` events and a terminal `done` with a
> `BatchDeploySummary`. The existing types (`BatchDeploySummary`, the
> `bu-complete` event) strongly imply this shape; the dev debug Sheet + the toast
> surface the actual summary so any divergence is visible immediately. There is
> **no** batch *status* endpoint — "Check all" is N client-side `getStatus` calls
> (see below), not a single request.

### Existing types (`src/types/index.ts`) — reused, no change expected
`TenantMigrationStatus { bu_id, bu_code, has_pending, pending[], up_to_date, raw }`,
`ProgressEvent` (the `start | applying | bu-complete | done | error` union),
`DeploySummary = SingleDeploySummary | BatchDeploySummary`.

### Error responses (handled identically to the card)
- **403** — disabled, missing token, or not a super-admin.
- **409** — a migration is already running (for that BU, or the fleet).
- **500** — migration failed (`raw`/message carries the reason).

## Design

### 1. Shared error helper — `src/utils/migrationError.ts` (new)
`TenantMigrationCard` currently has a private `handleMigrationError(err)`
(403 → error toast, 409 → warning toast, else `parseApiError().message`). Extract
it verbatim into a small util so the new page reuses it. **Refactor the card to
import it too** (behaviour unchanged — this is the only edit to the existing
card, and it removes a duplicate rather than adding risk).

```ts
// src/utils/migrationError.ts
import { toast } from 'sonner';
import { parseApiError } from './errorParser';

export const migrationStatusCode = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

export const handleMigrationError = (err: unknown) => {
  const code = migrationStatusCode(err);
  if (code === 403) toast.error('Migrations are disabled or require super-admin.');
  else if (code === 409) toast.warning('A migration is already running. Try again shortly.');
  else toast.error(parseApiError(err).message);
};
```

### 2. Concurrency helper — `src/utils/concurrent.ts` (new)
"Check all" fires `getStatus` for every BU. Cap concurrency so we don't open a
flood of CLI-backed checks at once; resolve as each completes so badges fill in
progressively. Pure, unit-testable.

```ts
// Runs fn over items with at most `limit` in flight. Calls onResult(item, result)
// as each settles (so the UI can update a row immediately). Errors are passed to
// onResult as the second arg's failure — the caller decides per-item handling.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (item: T, index: number, result: R | undefined, error: unknown) => void,
): Promise<void>;
```
Default limit **4**.

### 3. Service — `src/services/tenantMigrationService.ts` (extend)
Add one method beside the existing `getStatus` / `deploy` / `deployStream`:

```ts
// Stream a deploy of ALL BUs as NDJSON ProgressEvents (bu_id='all'). Same
// transport as deployStream — factored so both share the NDJSON reader.
deployAllStream: (onEvent: (e: ProgressEvent) => void) => Promise<DeploySummary>
```
Implementation: extract the existing NDJSON fetch+reader loop in `deployStream`
into a private `streamDeploy(buId, onEvent)` and have both `deployStream(buId)`
and `deployAllStream()` (which passes `'all'`) call it. No behaviour change to the
existing single-BU path.

### 4. Page — `src/pages/TenantMigrationManagement.tsx` (new)

Modeled on `ClusterManagement.tsx` (the canonical Management page) for header /
Card / DataTable / debug-Sheet shell, with migration-specific columns and the two
batch actions.

**State:**
```ts
const [bus, setBus] = useState<BusinessUnit[]>([]);
const [loading, setLoading] = useState(true);          // initial BU list load
const [error, setError] = useState<string | null>(null);
const [rowState, setRowState] = useState<Record<string, RowState>>({});
const [batch, setBatch] = useState<BatchProgress | null>(null); // Deploy-all panel
const [globalFilter, setGlobalFilter] = useState('');  // client-side table search
const [checkingAll, setCheckingAll] = useState(false);
const [confirm, setConfirm] = useState<ConfirmState | null>(null); // per-row or all
const [rawResponse, setRawResponse] = useState<unknown>(null);     // dev debug
const [copied, setCopied] = useState(false);

type RowState = {
  status?: TenantMigrationStatus;
  checking: boolean;
  deploying: boolean;
  progress?: { applied: number; total: number; current: string | null };
  lastChecked?: string;
};
type BatchProgress = {
  applied: number; total: number; current: string | null;
  buCode: string | null; log: string[];
};
```
`doc_version` is **not** involved (migrations don't touch the BU record).

**Initial load:** `businessUnitService.getAll({ perpage: 1000 })` → set `bus`,
stash response in `rawResponse`. Status stays empty (Unknown) until checked. If
the list is paginated smaller than the fleet by the backend, surface the returned
`paginate.total` vs received count and `log`/note the cap (no silent truncation);
practically the BU count is small (tens).

**Header row:** title "Tenant Migrations" + subtitle; buttons:
- **Check all** (`RefreshCw`/`Loader2`) — runs `mapWithConcurrency(bus, 4, getStatus)`.
- **Deploy all** (`Play`, `destructive`) — opens the all-confirm dialog.
- **Export CSV** (`Download`).

Both Check-all and Deploy-all are super-admin-gated with the same tooltip wrapper
the card uses (`Super-admin required.`). Deploy-all is additionally disabled while
any check/deploy is in flight.

**Summary strip** (above the table): counts derived from `rowState` — `Up to
date: n`, `Pending: n`, `Unknown: n`, `Error: n` (small badges / muted text).

**Deploy-all progress panel** (only while `batch` is non-null): a progress bar
(`applied/total`), current BU code + migration name, and a scrolling log of
completed BUs. Mirrors the card's progress markup.

**Table (`DataTable`, client-side — `serverSide={false}`):** pass the full `bus`
array; columns (wrapped in `useMemo`):

| Column | Cell |
|--------|------|
| Code | `bu.code` (sortable) |
| Name | `bu.name` (sortable) |
| Status | from `rowState[bu.id]`: `Up to date` (`Badge success`) / `N pending` (`Badge secondary`) / `Unknown` (`Badge outline`) / `Error` (`Badge destructive`). While that row is deploying, show inline `Applying X/Y` + current migration (`text-xs font-mono`). |
| Pending | count (or `–`) |
| Last checked | `rowState[bu.id].lastChecked` or `–` |
| Actions | **Check** (per-row `getStatus`); **Apply** appears when `has_pending` → opens per-row confirm. Both super-admin-gated + tooltip; disabled while that row is busy. |

`globalFilter` is wired to the DataTable for client search over code/name; the
search input lives in the Card header (debounced 400ms per rule 13, though
client-side it's cheap). `DataTable` adds its own `#` column — do **not** add one.

**Per-row Check:** `getStatus(buId)` → set that row's `status` + `lastChecked`;
errors → `handleMigrationError` and mark the row `Error`.

**Per-row Apply:** `ConfirmDialog` (lists the BU + its pending migration names) →
`deployStream(buId, onEvent)`:
- `start` → init row `progress`; `applying` → update `progress` (applied/total +
  current name).
- on resolve: `applied_migrations.length === 0` → `toast.info('Already up to date.')`,
  else `toast.success('Applied N migration(s) to {code}.')`; then re-check that row.
- on error → `handleMigrationError`; clear row `progress`/`deploying`.

**Deploy all:** `ConfirmDialog` warning it applies pending migrations to **all
BUs** (cannot be undone) → `deployAllStream(onEvent)`:
- `start` → init `batch`; `applying` → update bar + current.
- `bu-complete` → append to `batch.log` **and** flip that BU's row badge **from
  the event** (no extra request): `success && !error` → set row status to up to
  date (`has_pending: false`, `pending: []`); `error` → mark the row `Error`
  (surface `error` text). The event carries `{ success, applied[],
  already_up_to_date, error? }`, so the row reflects the real outcome immediately.
- `log` → append `message` to `batch.log` (tolerate this event type; it carries no
  per-BU id).
- on resolve (`BatchDeploySummary`) → `toast.success('Deployed: {succeeded} ok,
  {failed} failed.')` (use `toast.warning` if `failed > 0`); clear `batch`.
- on error → `handleMigrationError`; clear `batch`.

**Loading / empty (rule 16):**
- `loading && bus.length === 0` → `TableSkeleton`.
- `!loading && bus.length === 0` → `EmptyState` (icon `Database`, title "No
  business units", description + link to BU management).
- otherwise → DataTable.

**Debug Sheet** (dev-only, `process.env.NODE_ENV === 'development'`): amber
trigger bottom-right, shows `rawResponse` with the standard copy handler.

**Export CSV:** `generateCSV(rows, [{key:'code'},{key:'name'},{key:'status'},
{key:'pending'},{key:'last_checked'}])` over a flattened view of `bus` + their
`rowState` → `downloadCSV(csv, 'tenant-migrations.csv')`. Unchecked rows export
`status='unknown'`.

### 5. Routing — `src/App.tsx`
```tsx
<Route path="/tenant-migrations"
  element={<PrivateRoute requiredPermission="cluster.read"><TenantMigrationManagement /></PrivateRoute>} />
```

### 6. Navigation — `src/components/Layout.tsx`
Add to `allNavItems`, group **Organization** (near Business Units):
```tsx
{ path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' }
```
(`DatabaseZap` from lucide-react; falls back to `Database` if not exported.)

### 7. Tests — `src/pages/TenantMigrationManagement.test.tsx` (new)
RTL + `MemoryRouter`; `vi.mock` `businessUnitService`, `tenantMigrationService`,
`Layout`, and `AuthContext` (`useAuth`). Cover the key behaviours:
1. Renders BU rows from `getAll`; statuses start **Unknown** (no auto-fetch).
2. **Check all** → calls `getStatus` per BU; rows flip to Up to date / N pending.
3. Per-row **Apply** → confirm → `deployStream` streamed events drive the inline
   progress → success toast → row re-checked.
4. **Deploy all** → confirm → `deployAllStream`; `bu-complete` events flip the
   matching rows; summary toast fires.
5. **Gating:** as a non-super-admin, Check/Apply/Deploy-all are disabled.

Also unit-test `mapWithConcurrency` (`src/utils/concurrent.test.ts`): respects the
limit, calls `onSettled` per item, surfaces per-item errors without rejecting the
whole run.

## Non-goals (YAGNI)
- The `resolve` endpoint (mark a migration applied/rolled-back).
- Auto-fetching status on page load (on-demand only).
- A batch *status* endpoint (none exists; "Check all" is N client calls).
- Editing `db_connection` (stays read-only on the edit page).
- `doc_version` / optimistic locking (migrations don't touch the BU record).
- Server-side pagination/search for this page (Hybrid client-side by decision).

## Verification
Manual, as a super-admin, against the dev backend:
1. Open **Tenant Migrations** from the Organization nav group → BU list renders,
   all statuses **Unknown**.
2. **Check all** → badges fill in (Up to date / N pending) with the concurrency
   cap; summary strip counts update.
3. A row with pending → **Apply** → confirm lists the migrations → inline
   `Applying X/Y` progresses → success toast → row flips to Up to date.
4. **Deploy all** → confirm warns "all BUs" → batch panel streams; rows flip live;
   summary toast reports succeeded/failed.
5. As a **non-super-admin**: page loads, all action buttons disabled with the
   "Super-admin required." tooltip.
6. **Export CSV** downloads the current code/name/status/pending/last-checked.
7. Vitest: `bun run test` green (page + `mapWithConcurrency`).
