# Carmen Platform - AI Style Guide & Conventions

> Read this file completely before making any changes to the codebase.

## Project Overview

React + TypeScript admin dashboard for managing clusters, business units, and users. Glassmorphism design with shadcn/ui, Tailwind CSS, NestJS/Prisma backend.

- **Framework:** React 18 + TypeScript (CRA via react-scripts 5.0.1)
- **Node:** 20.x (enforced via `.nvmrc` and `engines`)
- **Styling:** Tailwind CSS + CSS custom properties (HSL)
- **Components:** shadcn/ui (Radix UI + CVA variants)
- **Tables:** TanStack Table v8 via `DataTable` wrapper
- **Routing:** react-router-dom v6
- **HTTP:** Axios with interceptors (`src/services/api.ts`)
- **Icons:** lucide-react (tree-shakeable)
- **Toast:** sonner (v2.0.7+)
- **E2E Testing:** Playwright (Page Object Model)
- **Backend API base:** `https://dev.blueledgers.com:4001`
- **Deployment:** Docker (multi-stage Nginx) + AWS ECR/EC2 + Vercel preview

---

## Project Structure

```
src/
  components/
    Layout.tsx              # App shell: sidebar state, mobile header, main wrapper
    Sidebar.tsx             # Collapsible sidebar (desktop) + Sheet drawer (mobile)
    PrivateRoute.tsx        # Auth guard with role-based access
    TableSkeleton.tsx       # Skeleton loader for initial data loading
    EmptyState.tsx          # Empty state (no data after load)
    KeyboardShortcuts.tsx   # Shortcuts help dialog + useGlobalShortcuts hook
    ui/                     # shadcn/ui primitives (do NOT modify without reason)
    magicui/                # Magic UI effects (ripple, ripple-button)
  pages/
    Landing.tsx             # Public landing page
    Login.tsx               # Auth page
    Dashboard.tsx           # Home dashboard
    ClusterManagement.tsx   # List page  (pattern: *Management)
    ClusterEdit.tsx         # CRUD page  (pattern: *Edit)
    BusinessUnitManagement.tsx
    BusinessUnitEdit.tsx
    UserManagement.tsx
    UserEdit.tsx
    Profile.tsx             # User profile
  services/
    api.ts                  # Axios instance + auth interceptors
    clusterService.ts       # Cluster CRUD
    businessUnitService.ts  # Business Unit CRUD
    userService.ts          # User CRUD + resetPassword
  types/
    index.ts                # All shared TypeScript interfaces
  utils/
    QueryParams.ts          # Query string builder for API calls
    csvExport.ts            # CSV generation and download
    validation.ts           # Field validation (email, code, phone, username)
    errorParser.ts          # API error parsing + devLog + getErrorDetail
  hooks/
    useUnsavedChanges.ts    # Browser warning on unsaved form changes
  context/
    AuthContext.tsx          # Auth state (user, token, roles)
  lib/
    utils.ts                # cn() helper (clsx + tailwind-merge)
e2e/                        # Playwright E2E tests (Page Object Model)
  fixtures/                 # Test data and auth setup
  helpers/                  # Common test utilities
  pages/                    # Page Object Model classes
  tests/                    # Tests by module (auth, clusters, business-units, users, etc.)
.github/workflows/build.yml # CI/CD: Docker build → AWS ECR → EC2 deploy
nginx/carmen-platform.conf  # Nginx production config
docs/                       # Project documentation
```

---

## Two Page Patterns

Every data entity follows two page patterns. **Always match the existing pattern.**

### 1. Management Page (List View) — `*Management.tsx`

```
Layout > space-y-4 sm:space-y-6
  Header Row (flex, title + export CSV button + add button)
  Card
    CardHeader > Search bar + Filter Sheet trigger + active filter badges
    CardContent > TableSkeleton | EmptyState | (Loading overlay + DataTable)
  ConfirmDialog (for delete)
  Debug Sheet (dev only)
```

**Required state:**

```tsx
const [items, setItems] = useState<Type[]>([]);
const [totalRows, setTotalRows] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [searchTerm, setSearchTerm] = useState('');
const [statusFilter, setStatusFilter] = useState<string[]>([]);
const [showFilters, setShowFilters] = useState(false);
const [rawResponse, setRawResponse] = useState<unknown>(null);
const [copied, setCopied] = useState(false);
const [deleteId, setDeleteId] = useState<string | null>(null);
const [paginate, setPaginate] = useState<PaginateParams>({
  page: 1,
  perpage: Number(localStorage.getItem('perpage_<type>')) || 10,
  search: '', sort: 'created_at:desc',
});
```

### 2. Edit Page (Create / View / Edit) — `*Edit.tsx`

```
Layout > space-y-4 sm:space-y-6
  Header Row (back button + title + edit button)
  Error display
  Form grid (Card sections, lg:grid-cols-2 for existing)
  Related data cards (users table, etc.)
  Debug Sheet with tabs (dev only)
```

**Required state:**

```tsx
const { id } = useParams<{ id: string }>();
const isNew = !id;
const [formData, setFormData] = useState<FormData>({...initialFormData});
const [loading, setLoading] = useState(!isNew);
const [editing, setEditing] = useState(isNew);
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const [rawResponse, setRawResponse] = useState<unknown>(null);
const [copied, setCopied] = useState(false);
const [savedFormData, setSavedFormData] = useState<FormData>({...initialFormData});
```

**Edit/Cancel pattern:**

```tsx
const handleEditToggle = () => { setSavedFormData(formData); setEditing(true); };
const handleCancelEdit = () => { setFormData(savedFormData); setEditing(false); setError(''); };
```

---

## Sidebar Layout

Collapsible sidebar nav (not horizontal header).

- **Desktop (md+):** Fixed left, `w-60` expanded / `w-16` collapsed, `.glass` bg, persisted to `localStorage('sidebar-collapsed')`
- **Mobile (<md):** Sheet drawer from left (`w-72`, `.glass-strong`), auto-closes on route change
- **Main content:** Dynamic margin `md:ml-16` (collapsed) / `md:ml-60` (expanded) with `.sidebar-transition`

### Adding a Nav Item

Add to `allNavItems` in `Layout.tsx`:

```tsx
{ path: '/settings', label: 'Settings', icon: Settings, roles: ['platform_admin'] }
```

Items with `roles` are filtered via `hasRole()` from AuthContext.

---

## Key Component Patterns

### Buttons

```tsx
// Primary:   <Button size="sm"><Save className="mr-2 h-4 w-4" /> Save</Button>
// Secondary: <Button variant="outline" size="sm"><X className="mr-2 h-4 w-4" /> Cancel</Button>
// Back:      <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
// Edit:      <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
// Danger:    <DropdownMenuItem className="text-destructive focus:text-destructive">
```

### Badges

```tsx
// Status: <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Active' : 'Inactive'}</Badge>
// Role:   <Badge variant="outline" className="capitalize text-xs">{role}</Badge>
// Dev:    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
```

### Loading Button States

```tsx
<Button type="submit" size="sm" disabled={saving}>
  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
  {saving ? 'Saving...' : 'Save Changes'}
</Button>
```

### Form Fields (two modes: editing + read-only)

```tsx
<div className="space-y-2">
  <Label htmlFor="name">Name {editing && '*'}</Label>
  {editing ? (
    <>
      <Input id="name" name="name" value={formData.name} onChange={handleChange}
        onBlur={handleBlur} className={fieldErrors.name ? 'border-destructive' : ''} required />
      {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
    </>
  ) : (
    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
      {formData.name || '-'}
    </div>
  )}
</div>
```

### DataTable (Server-Side)

```tsx
<DataTable columns={columns} data={items} serverSide totalRows={totalRows}
  page={paginate.page} perpage={paginate.perpage}
  onPaginateChange={handlePaginateChange} onSortChange={handleSortChange}
  defaultSort={{ id: 'created_at', desc: true }} />
```

Column definitions must be wrapped in `useMemo`. DataTable auto-adds a `#` row index column.

### Loading States

```tsx
<CardContent className="p-0">
  {loading && items.length === 0 ? (
    <TableSkeleton columns={5} rows={5} />
  ) : !loading && items.length === 0 ? (
    <EmptyState icon={Network} title="No clusters found"
      description="Create your first cluster to get started."
      action={<Button size="sm" onClick={() => navigate('/clusters/new')}><Plus className="mr-2 h-4 w-4" /> Add Cluster</Button>} />
  ) : (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      )}
      <DataTable ... />
    </div>
  )}
</CardContent>
```

---

## Search & Filter

### Debounced Search (400ms)

```tsx
const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const handleSearchChange = (value: string) => {
  setSearchTerm(value);
  if (searchTimeout.current) clearTimeout(searchTimeout.current);
  searchTimeout.current = setTimeout(() => {
    setPaginate(prev => ({ ...prev, page: 1, search: value }));
  }, 400);
};

// Search input with icon:
<div className="relative flex-1 sm:max-w-sm">
  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input ref={searchInputRef} placeholder="Search..." value={searchTerm}
    onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
</div>
```

### Filter Sheet

Use `<Sheet>` from right side. Active filters shown as removable `<Badge variant="secondary">` below search bar.

### Filter Advance Query

```tsx
// Single boolean
const advance = statusFilter.length === 1
  ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } }) : '';

// Multiple enum
const where: Record<string, unknown> = {};
if (roles.length > 0) where.platform_role = { in: roles };
if (statuses.length === 1) where.is_active = statuses[0] === 'true';
const advance = Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
```

---

## Toast & Dialogs

### Toast (sonner) — Never use `alert()` or `window.confirm()`

```tsx
import { toast } from 'sonner';
toast.success('Cluster created successfully');
toast.error('Failed to create', { description: message });
toast.info('Exported 25 records to CSV');
```

### ConfirmDialog — Never use `window.confirm()`

```tsx
<ConfirmDialog open={!!deleteId}
  onOpenChange={(open) => { if (!open) setDeleteId(null); }}
  title="Delete Cluster"
  description="Are you sure? This action cannot be undone."
  confirmText="Delete" confirmVariant="destructive"
  onConfirm={async () => {
    await clusterService.delete(deleteId!);
    setDeleteId(null);
    toast.success('Cluster deleted');
    fetchData();
  }} />
```

`onConfirm` supports async — auto-shows spinner and disables buttons during execution.

---

## Keyboard Shortcuts

```tsx
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';

// Management pages:
useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

// Edit pages:
useGlobalShortcuts({
  onSave: () => { if (editing) handleSubmit(); },
  onCancel: () => { if (editing) handleCancelEdit(); },
});
```

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl/⌘ + S` | Save | Edit pages (when editing) |
| `Ctrl/⌘ + K` | Focus search | Management pages |
| `Escape` | Cancel edit | Edit pages |
| `?` | Toggle shortcuts help | All pages (outside inputs) |

---

## Unsaved Changes Warning

```tsx
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
useUnsavedChanges(hasChanges);
```

---

## Field Validation

```tsx
import { validateField } from '../utils/validation';

// onBlur: validate
const error = validateField(name, value); // returns error string or ''
if (error) setFieldErrors(prev => ({ ...prev, [name]: error }));

// onChange: clear error
if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));

// Pre-submit: validate all required fields before save
```

| Validator | Fields | Rule |
|-----------|--------|------|
| `isValidEmail` | `email`, `hotel_email`, `company_email` | Standard email format |
| `isValidCode` | `code` | 2-20 alphanumeric, `_`, `-` |
| `isValidPhone` | `telephone`, `hotel_tel`, `company_tel` | 8-20 digits, optional `+()-` |

---

## CSV Export

```tsx
import { generateCSV, downloadCSV } from '../utils/csvExport';

const handleExport = () => {
  const csv = generateCSV(items, [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' },
    { key: 'is_active', label: 'Status' }, { key: 'created_at', label: 'Created' },
  ]);
  downloadCSV(csv, 'clusters.csv');
  toast.success(`Exported ${items.length} records to CSV`);
};
```

Place export button in header row next to "Add" button.

---

## Error Handling

```tsx
import { parseApiError } from '../utils/errorParser';

try {
  await service.create(formData);
  toast.success('Item created');
} catch (err) {
  const { message, fields } = parseApiError(err);
  toast.error('Failed to create', { description: message });
  if (fields) setFieldErrors(fields);
  devLog('createItem', err); // console.error only in development
}
```

Additional helpers: `getErrorDetail(err)` (full detail in dev, generic in prod), `devLog(label, err)`.

---

## Service Layer

All services follow identical CRUD structure:

```tsx
const typeService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Type>> => {
    const q = new QueryParams(paginate.page, paginate.perpage, paginate.search,
      paginate.searchfields, defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter)
        ? paginate.filter as Record<string, unknown> : {},
      paginate.sort, paginate.advance);
    const response = await api.get(`/api-system/type?${q.toQueryString()}`);
    return response.data;
  },
  getById: async (id: string) => (await api.get(`/api-system/type/${id}`)).data,
  create: async (data: Partial<Type>) => (await api.post('/api-system/type', data)).data,
  update: async (id: string, data: Partial<Type>) => (await api.put(`/api-system/type/${id}`, data)).data,
  delete: async (id: string) => (await api.delete(`/api-system/type/${id}`)).data,
};
```

- **API path prefix:** `/api-system/`
- **Response shape:** `{ data: T | T[], paginate?: { total, page, perpage } }`
- **Unwrap:** `const items = response.data.data || response.data;`
- Custom methods (e.g., `resetPassword` in userService) follow same pattern

---

## Pagination

```tsx
const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
  localStorage.setItem('perpage_<type>', String(perpage));
  setPaginate(prev => ({ ...prev, page, perpage }));
};
const handleSortChange = (sort: string) => setPaginate(prev => ({ ...prev, sort }));
```

---

## Type Definitions

All shared types in `src/types/index.ts`:

```tsx
PaginateParams     // { page, perpage, search, searchfields, filter, sort, advance }
PaginateInfo       // { total, page, perpage, totalPages? }
ApiListResponse<T> // { data: T[], paginate?, total? }
Cluster            // { id, code, name, is_active, bu_count?, users_count?, ... }
BusinessUnit       // { id, cluster_id?, code, name, is_active, hotel_*, company_*, ... }
User               // { id, email, platform_role?, firstname?, middlename?, lastname?,
                   //   alias_name?, telephone?, user_info?, business_unit?: BusinessUnit[] }
BusinessUnitConfig // { key, label, datatype?, value? }
```

**Platform roles:** `platform_admin | super_admin | support_manager | support_staff | security_officer | integration_developer | user`

Add new fields as **optional** (`?`) unless the API always returns them.

---

## Debug Sheet (Dev Only)

Always wrap with `process.env.NODE_ENV === 'development'`. Fixed bottom-right amber button → Sheet with raw JSON.

- **Management pages:** Single tab showing API response
- **Edit pages:** Multiple tabs (main, related data, users, etc.)
- Copy handler: `navigator.clipboard.writeText(JSON.stringify(data, null, 2))`

---

## Route Patterns

```tsx
<Route path="/items" element={<PrivateRoute><ItemManagement /></PrivateRoute>} />
<Route path="/items/new" element={<PrivateRoute><ItemEdit /></PrivateRoute>} />
<Route path="/items/:id/edit" element={<PrivateRoute><ItemEdit /></PrivateRoute>} />
// With roles:
<Route path="/items" element={<PrivateRoute allowedRoles={["platform_admin"]}><ItemManagement /></PrivateRoute>} />
```

---

## Environment Configuration

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_BASE_URL` | Backend API base URL |
| `REACT_APP_API_APP_ID` | App identifier for `x-app-id` header |
| `REACT_APP_ENV` | Environment name |
| `REACT_APP_BUILD_DATE` | Auto-set during build |

Files: `.env` (dev), `.env.example` (template), `.env.uat` (UAT).

API interceptors: sends `Authorization: Bearer <token>` + `x-app-id`, redirects to `/login` on 401/403.

---

## Docker & Deployment

- **Docker:** Multi-stage build (Node 20 → Nginx). `docker compose up --build`
- **CI/CD:** `.github/workflows/build.yml` — push to main → Docker build → AWS ECR → EC2 via SSM
- **Vercel:** `.vercel/project.json` — preview deployments on PRs

---

## E2E Testing (Playwright)

```bash
npm run test:e2e          # Headless
npm run test:e2e:headed   # With browser
npm run test:e2e:ui       # Interactive UI
npm run test:e2e:debug    # Debug mode
npm run test:e2e:report   # View report
```

Page Object Model in `e2e/pages/`, fixtures for auth, `@faker-js/faker` for test data.

---

## Styling Quick Reference

### Glass Effects

| Class | Blur | Usage |
|-------|------|-------|
| `.glass` | 16px | Sidebar, mobile header |
| `.glass-strong` | 24px | Mobile sheet drawer |
| `.bg-mesh` | n/a | Page backgrounds |

### Spacing

- Page wrapper: `space-y-4 sm:space-y-6`
- Cards/forms: `space-y-4`, fields: `space-y-2`
- Grids: `gap-4 sm:gap-6`, buttons: `gap-3`

### Text

- Title: `text-2xl sm:text-3xl font-bold tracking-tight`
- Body: `text-sm`, Small: `text-xs` or `text-[11px]`
- Muted: `text-muted-foreground`

### Icons (lucide-react)

- In buttons: `className="mr-2 h-4 w-4"`
- Standalone: `size="icon"`, `className="h-5 w-5"`
- Key icons: `Plus` (add), `Pencil` (edit), `Trash2` (delete), `ArrowLeft` (back), `Search`, `Filter`, `Save`, `X`, `MoreHorizontal` (actions), `Loader2` (spinner, always with `animate-spin`), `Download` (export)

### Responsive Breakpoints

`sm:` 640px+ | `md:` 768px+ (sidebar switch) | `lg:` 1024px+ (two-column grids)

---

## DateTime Formatting

```tsx
const fmt = (v: string | undefined) => {
  if (!v) return '-';
  const dt = new Date(v);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
};
```

---

## Rules for AI

1. **Always read existing page files** before creating or modifying. Match exact patterns.
2. **Never modify `src/components/ui/`** unless explicitly asked (shadcn primitives).
3. **Every list page** must have: debounced search, filter Sheet, server-side DataTable, CSV export, debug Sheet, loading states (skeleton → overlay → empty).
4. **Every edit page** must have: read-only + edit mode toggle, back button, save/cancel, field validation, unsaved changes warning, debug Sheet with tabs.
5. **Status badges:** `variant="success"` (active), `variant="secondary"` (inactive). Never use raw green Tailwind classes.
6. **Persist `perpage`** in localStorage per entity type.
7. **Types** go in `src/types/index.ts`. Page-specific interfaces stay in the page file.
8. **Services** follow exact CRUD pattern. API path prefix: `/api-system/`.
9. **Icons:** `mr-2 h-4 w-4` in buttons with text, `h-5 w-5` standalone.
10. **Responsive:** Mobile-first. Use `sm:`, `md:`, `lg:` breakpoints.
11. **No new libraries** without asking. Minimal dependencies by design.
12. **Glass effects** only on sidebar, mobile header, dropdown menus. Cards use default shadcn styling.
13. **Debug sheets** are dev-only (`process.env.NODE_ENV === 'development'`).
14. **Column definitions** wrapped in `useMemo`.
15. **Single generic `handleChange`** for text/checkbox/select via `e.target.name`.
16. **Toast only** — never `alert()` or `window.confirm()`. Use `<ConfirmDialog>` for confirmations.
17. **Use `devLog()`** from `utils/errorParser` instead of raw `console.error()`.
18. **E2E tests** follow Page Object Model in `e2e/`. Use `@faker-js/faker` for test data.
19. **Env vars** must be prefixed with `REACT_APP_` (CRA requirement). Never commit secrets.
20. **Docker/CI** — don't modify `Dockerfile`, `docker-compose.yml`, or `.github/workflows/` without understanding the full pipeline.
