# Carmen Platform - AI Style Guide & Conventions

> Read this file completely before making any changes to the codebase.

## Project Overview

Carmen Platform is a React + TypeScript admin dashboard for managing clusters, business units, and users. It uses a glassmorphism design language with shadcn/ui components, Tailwind CSS, and a NestJS/Prisma backend.

- **Framework:** React 18 + TypeScript (CRA)
- **Styling:** Tailwind CSS with CSS custom properties (HSL color system)
- **Components:** shadcn/ui (Radix UI primitives + CVA variants)
- **Tables:** TanStack Table v8 via custom `DataTable` wrapper
- **Routing:** react-router-dom v6
- **HTTP:** Axios with interceptors (`src/services/api.ts`)
- **Icons:** lucide-react (tree-shakeable)
- **Toast:** sonner (Sonner toast library, v2.0.7+)
- **Backend API base:** `https://dev.blueledgers.com:4001`

---

## Project Structure

```
src/
  components/
    Layout.tsx                  # App shell: sidebar state, mobile header, main wrapper
    Sidebar.tsx                 # Collapsible sidebar (desktop) + Sheet drawer (mobile)
    PrivateRoute.tsx            # Auth guard with role-based access
    TableSkeleton.tsx           # Table skeleton loader for initial data loading
    EmptyState.tsx              # Empty state component (no data after load)
    KeyboardShortcuts.tsx       # Keyboard shortcuts help dialog + useGlobalShortcuts hook
    ui/                         # shadcn/ui primitives (do NOT modify without reason)
      avatar.tsx                badge.tsx              button.tsx
      card.tsx                  confirm-dialog.tsx     data-table.tsx
      dialog.tsx                dropdown-menu.tsx      input.tsx
      label.tsx                 separator.tsx          sheet.tsx
      skeleton.tsx              table.tsx              toaster.tsx
      tooltip.tsx
    magicui/                    # Magic UI effects (ripple)
  pages/
    Landing.tsx                 # Public landing page
    Login.tsx                   # Auth page
    Dashboard.tsx               # Home dashboard
    ClusterManagement.tsx       # List page  (pattern: Management)
    ClusterEdit.tsx             # CRUD page  (pattern: Edit)
    BusinessUnitManagement.tsx  # List page
    BusinessUnitEdit.tsx        # CRUD page
    UserManagement.tsx          # List page
    UserEdit.tsx                # CRUD page
    Profile.tsx                 # User profile
  services/
    api.ts                      # Axios instance + auth interceptors
    clusterService.ts           # Cluster CRUD
    businessUnitService.ts      # Business Unit CRUD
    userService.ts              # User CRUD
  types/
    index.ts                    # All shared TypeScript interfaces
  utils/
    QueryParams.ts              # Query string builder for API calls
    csvExport.ts                # CSV generation and download utilities
    validation.ts               # Field validation (email, code, phone, username)
    errorParser.ts              # API error parsing with field-level errors
  hooks/
    useUnsavedChanges.ts        # Browser warning on unsaved form changes
  context/
    AuthContext.tsx              # Auth state (user, token, roles)
  lib/
    utils.ts                    # cn() helper (clsx + tailwind-merge)
```

---

## Sidebar Layout Pattern

The app uses a collapsible sidebar navigation (not a horizontal header nav).

### Desktop Sidebar (md+)

- **Fixed left position:** `fixed inset-y-0 left-0 z-30`
- **Width states:** `w-60` (240px expanded) | `w-16` (64px collapsed)
- **Glass background:** `.glass border-r border-white/10`
- **Sections:** Logo (top) → Navigation (middle, flex-1) → User Profile + Toggle (bottom)
- **State:** Managed in `Layout.tsx`, persisted to `localStorage('sidebar-collapsed')`
- **Transition:** `.sidebar-transition` class (300ms cubic-bezier)

### Collapsed State Features

- Icon-only navigation items (centered in 64px width)
- Tooltips on hover (200ms delay, right side placement)
- Avatar-only user profile with tooltip
- Toggle button shows `PanelLeft` icon

### Expanded State Features

- Icon + label navigation items
- Full user profile (avatar + name + email)
- Toggle button shows `PanelLeftClose` icon + "Collapse" text

### Mobile Sheet Drawer (<md)

- **Trigger:** Hamburger menu button (`Menu` icon) in mobile-only header
- **Component:** Sheet from left side (`w-72`, `.glass-strong`)
- **Behavior:** Auto-closes on route change via `useEffect` on `location.pathname`
- **Content:** Always shows full labels, user profile at bottom

### Main Content Adjustment

- Dynamic left margin: `md:ml-16` (collapsed) | `md:ml-60` (expanded)
- Smooth transition with `.sidebar-transition` class
- Mobile: no margin (sidebar is overlay drawer)

### Sidebar Component Props

```tsx
interface SidebarProps {
  isCollapsed: boolean;            // Current collapse state
  onToggle: () => void;            // Toggle collapse
  navItems: NavItem[];             // Filtered navigation items
  isMobileOpen: boolean;           // Mobile sheet open state
  onMobileOpenChange: (open: boolean) => void;
  userInfo: UserInfo;              // { initials, displayName, email, role }
  onLogout: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];                // Optional role-based filtering
}
```

### Adding a Navigation Item

Add to the `allNavItems` array in `Layout.tsx`:

```tsx
const allNavItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clusters', label: 'Clusters', icon: Network, roles: ['platform_admin', 'support_manager', 'support_staff'] },
  { path: '/business-units', label: 'Business Units', icon: Building2 },
  { path: '/users', label: 'Users', icon: Users },
  // Add new item:
  { path: '/settings', label: 'Settings', icon: Settings },
];
```

Items with `roles` are filtered via `hasRole()` from AuthContext.

### Tooltip Pattern (for collapsed sidebar)

```tsx
<TooltipProvider delayDuration={200}>
  <Tooltip>
    <TooltipTrigger asChild>
      <div>
        <NavLink item={item} showLabel={false} />
      </div>
    </TooltipTrigger>
    <TooltipContent side="right" className="font-medium">
      {item.label}
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Two Page Patterns

Every data entity follows two page patterns. Always match the existing pattern.

### 1. Management Page (List View)

**Files:** `*Management.tsx` (e.g. `ClusterManagement.tsx`)

```
Layout > space-y-4 sm:space-y-6
  Header Row (flex, title + add button)
  Card
    CardHeader > Search bar + Filter Sheet trigger + active filter badges
    CardContent > Loading overlay + DataTable (server-side)
  Debug Sheet (dev only, fixed bottom-right amber button)
```

**Required states:**

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
const [paginate, setPaginate] = useState<PaginateParams>({
  page: 1,
  perpage: Number(localStorage.getItem('perpage_<type>')) || 10,
  search: '',
  sort: 'created_at:desc',
});
```

### 2. Edit Page (Create / View / Edit)

**Files:** `*Edit.tsx` (e.g. `ClusterEdit.tsx`)

```
Layout > space-y-4 sm:space-y-6
  Header Row (back button + title + edit button)
  Error display
  Form grid (Card sections, lg:grid-cols-2 for existing)
  Related data cards (users table, etc.)
  Debug Sheet with tabs (dev only)
```

**Required states:**

```tsx
const { id } = useParams<{ id: string }>();
const isNew = !id;
const [formData, setFormData] = useState<FormData>({...initialFormData});
const [loading, setLoading] = useState(!isNew);
const [editing, setEditing] = useState(isNew);    // new = edit mode, existing = read-only
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
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

## Component Usage Reference

### Button Variants & Sizes

```tsx
// Variants: default | destructive | outline | secondary | ghost | link
// Sizes:    default (h-9) | sm (h-8) | lg (h-10) | icon (h-9 w-9)

// Primary action
<Button type="submit" size="sm" disabled={saving}>
  <Save className="mr-2 h-4 w-4" />
  {saving ? 'Saving...' : 'Save Changes'}
</Button>

// Secondary/cancel action
<Button type="button" size="sm" variant="outline" onClick={handleCancel}>
  <X className="mr-2 h-4 w-4" />
  Cancel
</Button>

// Back navigation
<Button variant="ghost" size="icon" onClick={() => navigate('/items')}>
  <ArrowLeft className="h-5 w-5" />
</Button>

// Edit toggle (top-right of header)
<Button variant="outline" size="sm" onClick={handleEditToggle}>
  <Pencil className="mr-2 h-4 w-4" />
  Edit
</Button>

// Danger action in dropdown
<DropdownMenuItem className="text-destructive focus:text-destructive">
  <Trash2 className="mr-2 h-4 w-4" />
  Delete
</DropdownMenuItem>
```

### Badge Variants

```tsx
// Variants: default | secondary | destructive | outline | success | warning

// Status badge (most common)
<Badge variant={isActive ? 'success' : 'secondary'}>
  {isActive ? 'Active' : 'Inactive'}
</Badge>

// Role/code badge
<Badge variant="outline" className="capitalize text-xs">
  {role}
</Badge>

// Dev badge
<Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>

// Filter count badge (on filter button)
<Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
  {count}
</Badge>
```

### Card Layout

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>

// Card with action buttons in header
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          Title
        </CardTitle>
        <CardDescription>Subtitle</CardDescription>
      </div>
      <Button size="sm">Action</Button>
    </div>
  </CardHeader>
  <CardContent className="p-0"> {/* p-0 when content is a full-width table */}
    {/* table */}
  </CardContent>
</Card>
```

### Collapsible Section (BusinessUnitEdit pattern)

```tsx
<CollapsibleSection title="Section Title" description="Description" defaultOpen={true} forceOpen>
  <div className="space-y-4">
    {/* form fields */}
  </div>
</CollapsibleSection>
```

---

## Form Field Patterns

Always render **two modes**: editing (Input) and read-only (styled div).

### Text Input

```tsx
<div className="space-y-2">
  <Label htmlFor="fieldName">Field Name {editing && '*'}</Label>
  {editing ? (
    <Input
      type="text"
      id="fieldName"
      name="fieldName"
      value={formData.fieldName}
      onChange={handleChange}
      placeholder="Placeholder text"
      required
    />
  ) : (
    <ReadOnlyText value={formData.fieldName} />
  )}
</div>
```

### ReadOnly helpers

```tsx
// Single-line read-only
const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);

// Multi-line read-only
const ReadOnlyTextarea: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm min-h-[4.5rem] whitespace-pre-wrap">
    {value || '-'}
  </div>
);
```

### Textarea

```tsx
<textarea
  id="description"
  name="description"
  value={formData.description}
  onChange={handleChange}
  rows={3}
  placeholder="Description"
  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
/>
```

### Select Dropdown

```tsx
const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

<select id="field" name="field" value={formData.field} onChange={handleChange} className={selectClassName}>
  <option value="">Select option</option>
  <option value="val1">Label 1</option>
</select>
```

### Checkbox + Read-only Badge

```tsx
<div className="flex items-center gap-2">
  {editing ? (
    <>
      <input type="checkbox" id="is_active" name="is_active"
        checked={formData.is_active} onChange={handleChange}
        className="h-4 w-4 rounded border-input" />
      <Label htmlFor="is_active">Active</Label>
    </>
  ) : (
    <>
      <Label>Status</Label>
      <Badge variant={formData.is_active ? 'success' : 'secondary'} className="ml-2">
        {formData.is_active ? 'Active' : 'Inactive'}
      </Badge>
    </>
  )}
</div>
```

### Two-column grid for related fields

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  {/* field 1 */}
  {/* field 2 */}
</div>
```

---

## DataTable (Server-Side)

### Usage

```tsx
<DataTable
  columns={columns}
  data={items}
  serverSide
  totalRows={totalRows}
  page={paginate.page}
  perpage={paginate.perpage}
  onPaginateChange={handlePaginateChange}
  onSortChange={handleSortChange}
  defaultSort={{ id: 'created_at', desc: true }}
/>
```

### Column Definition Pattern

```tsx
const columns = useMemo<ColumnDef<Type, unknown>[]>(() => [
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ row }) => (
      <span className="cursor-pointer text-primary hover:underline"
        onClick={() => navigate(`/items/${row.original.id}/edit`)}>
        {row.original.code}
      </span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    accessorKey: 'created_at',
    id: 'created_at',
    header: 'Created',
    cell: ({ row }) => {
      const d = row.original;
      return (
        <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
          <div>{formatDateTime(d.created_at)}</div>
          {d.created_by_name && <div>{d.created_by_name}</div>}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    meta: { headerClassName: 'w-10', cellClassName: 'text-center' },
    enableSorting: false,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/items/${row.original.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDelete(row.original.id)}
            className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
], [navigate]);
```

### Loading Overlay

```tsx
<div className="relative">
  {loading && (
    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  )}
  <DataTable ... />
</div>
```

Note: DataTable auto-adds a `#` row index column. Do NOT add your own.

---

## Inline Table Pattern (for related data in Edit pages)

```tsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="text-center font-medium px-4 py-2 w-10">#</th>
        <th className="text-left font-medium px-4 py-2">Name</th>
        <th className="text-center font-medium px-4 py-2">Status</th>
        <th className="w-10"></th>
      </tr>
    </thead>
    <tbody>
      {items.map((item, idx) => (
        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
          <td className="px-4 py-2 text-center text-muted-foreground">{idx + 1}</td>
          <td className="px-4 py-2">{item.name}</td>
          <td className="px-4 py-2 text-center">
            <Badge variant={item.is_active ? 'success' : 'secondary'} className="text-xs">
              {item.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </td>
          <td className="px-4 py-2 text-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## Search & Filter Pattern

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
```

### Search Input

```tsx
<div className="relative flex-1 sm:max-w-sm">
  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input placeholder="Search..." value={searchTerm}
    onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
</div>
```

### Filter Sheet

```tsx
<Sheet open={showFilters} onOpenChange={setShowFilters}>
  <SheetTrigger asChild>
    <Button variant="outline" size="sm" className="shrink-0">
      <Filter className="mr-2 h-4 w-4" />
      Filters
      {activeFilterCount > 0 && (
        <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
          {activeFilterCount}
        </Badge>
      )}
    </Button>
  </SheetTrigger>
  <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
    <SheetHeader>
      <SheetTitle>Filters</SheetTitle>
      <SheetDescription>Filter items by criteria</SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-6 px-1">
      {/* Filter sections: each has space-y-3, options have space-y-2 */}
    </div>
  </SheetContent>
</Sheet>
```

### Active Filter Badges

```tsx
{activeFilterCount > 0 && (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-xs text-muted-foreground">Filters:</span>
    {statusFilter.map(s => (
      <Badge key={s} variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
        {s === 'true' ? 'Active' : 'Inactive'}
        <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </Badge>
    ))}
    <button onClick={handleClearAllFilters}
      className="text-xs text-muted-foreground hover:text-destructive ml-1">
      Clear all
    </button>
  </div>
)}
```

### Filter Advance Query Pattern

```tsx
// Single boolean filter
const advance = statusFilter.length === 1
  ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } })
  : '';

// Multiple enum filter
const buildAdvance = (roles: string[], statuses: string[]) => {
  const where: Record<string, unknown> = {};
  if (roles.length > 0) where.platform_role = { in: roles };
  if (statuses.length === 1) where.is_active = statuses[0] === 'true';
  return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
};
```

---

## Debug Sheet Pattern (Dev Only)

Always wrap with `process.env.NODE_ENV === 'development'`.

### Single-tab (Management pages)

```tsx
{process.env.NODE_ENV === 'development' && !!rawResponse && (
  <Sheet>
    <SheetTrigger asChild>
      <Button size="icon"
        className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30">
        <Code className="h-5 w-5" />
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Code className="h-4 w-4 sm:h-5 sm:w-5" />
          API Response
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
        </SheetTitle>
        <SheetDescription className="text-xs sm:text-sm">GET /api-system/endpoint</SheetDescription>
      </SheetHeader>
      <div className="mt-3 sm:mt-4">
        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
            {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </Button>
        </div>
        <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
          {JSON.stringify(rawResponse, null, 2)}
        </pre>
      </div>
    </SheetContent>
  </Sheet>
)}
```

### Multi-tab (Edit pages)

```tsx
const [debugTab, setDebugTab] = useState<'main' | 'related' | 'users'>('main');

// Tab bar inside SheetContent:
<div className="flex border-b mb-3 sm:mb-4 overflow-x-auto">
  <button onClick={() => setDebugTab('main')}
    className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
      debugTab === 'main' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}>
    Main
  </button>
  {/* more tabs... */}
</div>

// Each tab panel:
{debugTab === 'main' && (
  <div>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
      <span className="text-xs font-medium text-muted-foreground truncate">GET /api-system/endpoint/{id}</span>
      <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawResponse)}>
        {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
    <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
      {rawResponse ? JSON.stringify(rawResponse, null, 2) : 'No data'}
    </pre>
  </div>
)}
```

### Copy handler

```tsx
const handleCopyJson = (data: unknown) => {
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

---

## Dialog Pattern

```tsx
<Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Item</DialogTitle>
      <DialogDescription>Description of what this dialog does</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      {/* form fields */}
    </div>
    <DialogFooter>
      <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Loading States & Empty States Pattern

Use distinct components for initial loading, data refresh, and empty results.

### When to Use Each

| State | Component | When |
|-------|-----------|------|
| **Initial load** | `<TableSkeleton>` | `loading && items.length === 0` (first fetch) |
| **Data refresh** | Loading overlay | `loading && items.length > 0` (re-fetch with existing data) |
| **No data** | `<EmptyState>` | `!loading && items.length === 0` (successful load, zero results) |

### TableSkeleton (Initial Load)

```tsx
import { TableSkeleton } from '../components/TableSkeleton';

// In Management page CardContent:
<CardContent className="p-0">
  {loading && items.length === 0 ? (
    <TableSkeleton columns={5} rows={5} />
  ) : !loading && items.length === 0 ? (
    <EmptyState
      icon={Network}
      title="No clusters found"
      description="Create your first cluster to get started."
      action={
        <Button size="sm" onClick={() => navigate('/clusters/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Cluster
        </Button>
      }
    />
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

### TableSkeleton Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `number` | `5` | Number of skeleton columns |
| `rows` | `number` | `5` | Number of skeleton rows |

### EmptyState Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `icon` | `LucideIcon` | Yes | Icon displayed in circle |
| `title` | `string` | Yes | Main message |
| `description` | `string` | No | Secondary message |
| `action` | `ReactNode` | No | Action button (e.g., "Add New") |

```tsx
import { EmptyState } from '../components/EmptyState';
import { Network } from 'lucide-react';

<EmptyState
  icon={Network}
  title="No clusters found"
  description="Create your first cluster to get started."
  action={
    <Button size="sm" onClick={() => navigate('/clusters/new')}>
      <Plus className="mr-2 h-4 w-4" />
      Add Cluster
    </Button>
  }
/>
```

---

## Toast Notifications (Sonner)

Use toast notifications for all user feedback. **Never use browser `alert()`.**

### Setup

Already configured in `App.tsx` via `<Toaster />` from `src/components/ui/toaster.tsx`. Config: `position="top-right"`, `duration={4000}`, `richColors`, `closeButton`.

### Usage

```tsx
import { toast } from 'sonner';

// Success (after create, update, delete)
toast.success('Cluster created successfully');

// Error (in catch blocks)
toast.error('Failed to create cluster', { description: 'Server returned 500' });

// Info (general notifications)
toast.info('Changes saved as draft');

// Warning
toast.warning('This action cannot be undone');
```

### When to Use

| Scenario | Toast Type | Example |
|----------|-----------|---------|
| Successful CRUD | `toast.success()` | `'Cluster created successfully'` |
| API error in catch | `toast.error()` | `'Failed to save: ' + message` |
| Non-critical info | `toast.info()` | `'Exported 25 records to CSV'` |
| Copy to clipboard | `toast.success()` | `'Copied to clipboard'` |
| Delete confirmation result | `toast.success()` | `'Cluster deleted'` |

### Notes

- **Never** use `alert()`, `window.alert()`, or `window.confirm()` anywhere
- Toast messages should be concise (under 60 characters)
- Use `description` option for additional context on errors
- Toasts auto-dismiss after 4 seconds; users can close earlier via close button

---

## Confirm Dialog Pattern

Use `<ConfirmDialog>` for all destructive or irreversible actions. **Never use `window.confirm()`.**

### Usage

```tsx
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { toast } from 'sonner';

// State
const [deleteId, setDeleteId] = useState<string | null>(null);

// Trigger (in actions dropdown)
<DropdownMenuItem
  onClick={() => setDeleteId(row.original.id)}
  className="text-destructive focus:text-destructive"
>
  <Trash2 className="mr-2 h-4 w-4" /> Delete
</DropdownMenuItem>

// Dialog (at page bottom, before debug sheet)
<ConfirmDialog
  open={!!deleteId}
  onOpenChange={(open) => { if (!open) setDeleteId(null); }}
  title="Delete Cluster"
  description="Are you sure you want to delete this cluster? This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  confirmVariant="destructive"
  onConfirm={async () => {
    await clusterService.delete(deleteId!);
    setDeleteId(null);
    toast.success('Cluster deleted successfully');
    fetchData(); // Refresh list
  }}
/>
```

### ConfirmDialog Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | - | Controls dialog visibility |
| `onOpenChange` | `(open: boolean) => void` | - | Called when dialog should close |
| `title` | `string` | - | Dialog title |
| `description` | `string` | - | Explanation of the action |
| `confirmText` | `string` | `'Confirm'` | Confirm button label |
| `cancelText` | `string` | `'Cancel'` | Cancel button label |
| `confirmVariant` | `'default' \| 'destructive'` | `'default'` | Confirm button style |
| `onConfirm` | `() => void \| Promise<void>` | - | Async-safe handler; shows loading spinner automatically |

### Notes

- `onConfirm` supports async functions; the dialog shows a `Loader2` spinner and disables buttons during execution
- Dialog cannot be closed while `onConfirm` is executing
- Always wrap API calls in `onConfirm` with error handling and toast feedback
- Use `confirmVariant="destructive"` for delete operations

---

## Keyboard Shortcuts

All pages should integrate keyboard shortcuts via `useGlobalShortcuts`.

### Available Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl/⌘ + S` | Save changes | Edit pages (when editing) |
| `Ctrl/⌘ + K` | Focus search input | Management pages |
| `Escape` | Cancel edit / Close dialog | Edit pages |
| `?` | Toggle keyboard shortcuts help | All pages (outside inputs) |

### Usage in Management Pages

```tsx
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';

// Inside component:
const searchInputRef = useRef<HTMLInputElement>(null);

useGlobalShortcuts({
  onSearch: () => searchInputRef.current?.focus(),
});

// Add ref to search input:
<Input ref={searchInputRef} placeholder="Search..." ... />
```

### Usage in Edit Pages

```tsx
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';

useGlobalShortcuts({
  onSave: () => { if (editing) handleSubmit(); },
  onCancel: () => { if (editing) handleCancelEdit(); },
});
```

### Help Dialog

`<KeyboardShortcutsHelp />` is already included in `Layout.tsx`. Users toggle it with `?`. No additional setup needed per page.

### Notes

- Platform-aware: shows `⌘` on Mac, `Ctrl` on Windows/Linux
- `?` shortcut is ignored when focus is on input/textarea fields
- Callbacks object should be stable (wrap handlers before passing)

---

## Unsaved Changes Warning

Warn users before they accidentally lose form changes by closing the tab/window.

### Usage

```tsx
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

// In Edit page component:
const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
useUnsavedChanges(hasChanges);
```

### How It Works

- Listens to browser `beforeunload` event
- Shows native browser confirmation dialog when `hasChanges` is `true` and user tries to close/refresh
- Automatically cleans up listener when component unmounts or `hasChanges` becomes `false`

### Notes

- Add to **all** Edit pages
- Compare `formData` vs `savedFormData` to detect changes
- The `savedFormData` is set when entering edit mode (via `handleEditToggle`)
- For new items (`isNew`), compare against `initialFormData`

---

## Field Validation Pattern

Validate form fields in real-time on blur with inline error messages.

### Setup

```tsx
import { validateField } from '../utils/validation';

// State
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
```

### onChange - Clear Error

```tsx
const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  const { name, value, type } = e.target;
  const checked = (e.target as HTMLInputElement).checked;
  setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  // Clear error when user starts typing
  if (fieldErrors[name]) {
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
  }
};
```

### onBlur - Validate

```tsx
const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  const error = validateField(name, value);
  if (error) {
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  }
};
```

### Field with Error Display

```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email {editing && '*'}</Label>
  {editing ? (
    <>
      <Input
        type="email"
        id="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="user@example.com"
        className={fieldErrors.email ? 'border-destructive' : ''}
        required
      />
      {fieldErrors.email && (
        <p className="text-xs text-destructive">{fieldErrors.email}</p>
      )}
    </>
  ) : (
    <ReadOnlyText value={formData.email} />
  )}
</div>
```

### Available Validators

| Function | Field Names | Validation |
|----------|-------------|------------|
| `isValidEmail(email)` | `email`, `hotel_email`, `company_email` | Standard email format |
| `isValidCode(code)` | `code` | 2-20 alphanumeric chars, `_`, `-` |
| `isValidPhone(phone)` | `telephone`, `hotel_tel`, `company_tel` | 8-20 digits with optional `+`, spaces, `-`, `()` |
| `validateField(name, value)` | Any of above | Auto-detects field type by name, returns error string or `''` |

### Pre-submit Validation

```tsx
const handleSubmit = async (e?: React.FormEvent) => {
  e?.preventDefault();
  // Validate all required fields before submit
  const errors: Record<string, string> = {};
  ['code', 'email'].forEach(field => {
    const error = validateField(field, formData[field as keyof typeof formData] as string);
    if (error) errors[field] = error;
  });
  if (Object.keys(errors).length > 0) {
    setFieldErrors(errors);
    return;
  }
  // Proceed with save...
};
```

---

## CSV Export Pattern

Add CSV export to all Management pages.

### Usage

```tsx
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

const handleExport = () => {
  const csv = generateCSV(items, [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'is_active', label: 'Status' },
    { key: 'created_at', label: 'Created' },
  ]);
  downloadCSV(csv, 'clusters.csv');
  toast.success(`Exported ${items.length} records to CSV`);
};
```

### Button Placement

Place in the header row, next to the "Add" button:

```tsx
<div className="flex items-center gap-3">
  <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
    <Download className="mr-2 h-4 w-4" />
    Export CSV
  </Button>
  <Button size="sm" onClick={() => navigate('/clusters/new')}>
    <Plus className="mr-2 h-4 w-4" />
    Add Cluster
  </Button>
</div>
```

### API

**`generateCSV<T>(data: T[], columns: { key: keyof T; label: string }[]): string`**
- Generates a CSV string with headers and properly escaped values
- Handles commas, quotes, and newlines in values

**`downloadCSV(csv: string, filename: string): void`**
- Creates a Blob and triggers browser download
- Automatically revokes the object URL after download

---

## Error Parsing Pattern

Use `parseApiError` in all catch blocks for consistent error extraction.

### Usage

```tsx
import { parseApiError } from '../utils/errorParser';
import { toast } from 'sonner';

try {
  await service.create(formData);
  toast.success('Item created successfully');
} catch (err) {
  const { message, fields } = parseApiError(err);
  toast.error('Failed to create item', { description: message });
  if (fields) {
    setFieldErrors(fields); // Set field-level validation errors from API
  }
}
```

### Return Type

```tsx
interface ParsedError {
  message: string;                    // Human-readable error message
  fields?: Record<string, string>;    // Field-name → error-message map (from API validation errors)
}
```

### How It Works

- Extracts `message` from `response.data.message`, `response.data.error`, or `error.message`
- Falls back to `'An unexpected error occurred'` if nothing found
- Parses `response.data.errors` (field-level validation) into a flat `Record<string, string>`

### Notes

- Replaces the old manual pattern: `e.response?.data?.message || e.message`
- When `fields` is returned, set them as `fieldErrors` for inline display
- Always pair with `toast.error()` for the general message

---

## Loading Button States

Show spinner on all async action buttons to prevent double-submission.

### Pattern

```tsx
import { Loader2 } from 'lucide-react';

// Save button
<Button type="submit" size="sm" disabled={saving}>
  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
  {saving ? 'Saving...' : 'Save Changes'}
</Button>

// Delete button (in dialog)
<Button variant="destructive" size="sm" disabled={deleting}>
  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {deleting ? 'Deleting...' : 'Delete'}
</Button>

// Any async action
<Button variant="outline" size="sm" disabled={adding}>
  {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {adding ? 'Adding...' : 'Add User'}
</Button>
```

### Notes

- Always `disabled={loading}` to prevent double-clicks
- Replace the static icon with `Loader2 animate-spin` during loading
- Use descriptive state names: `saving`, `deleting`, `adding`, `loading`
- `ConfirmDialog` handles its own loading state automatically (no extra work needed)

---

## Service Layer Pattern

All services follow identical CRUD structure:

```tsx
import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Type, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code'];

const typeService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Type>> => {
    const q = new QueryParams(
      paginate.page, paginate.perpage, paginate.search,
      paginate.searchfields, defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter)
        ? paginate.filter as Record<string, unknown> : {},
      paginate.sort, paginate.advance,
    );
    const response = await api.get(`/api-system/type?${q.toQueryString()}`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/api-system/type/${id}`);
    return response.data;
  },
  create: async (data: Partial<Type>) => {
    const response = await api.post('/api-system/type', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Type>) => {
    const response = await api.put(`/api-system/type/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/api-system/type/${id}`);
    return response.data;
  },
};

export default typeService;
```

**API base path:** `/api-system/`
**Response shape:** `{ data: T | T[], paginate?: { total, page, perpage } }`
**Always unwrap:** `const items = response.data.data || response.data;`

---

## Type Definitions

All shared types live in `src/types/index.ts`. Key interfaces:

```tsx
PaginateParams    // { page, perpage, search, searchfields, filter, sort, advance }
PaginateInfo      // { total, page, perpage, totalPages? }
ApiListResponse<T>// { data: T[], paginate?, total? }
Cluster           // { id, code, name, is_active, bu_count?, users_count?, created_at?, ... }
BusinessUnit      // { id, cluster_id?, code, name, is_active, hotel_*, company_*, ... }
User              // { id, email, platform_role?, firstname?, lastname?, ... }
BusinessUnitConfig// { key, label, datatype?, value? }
```

When adding fields to a type, add them as **optional** with `?` unless the API always returns them.

---

## Styling Conventions

### Color System (HSL CSS Variables)

| Token | Light | Usage |
|-------|-------|-------|
| `--primary` | `220 90% 56%` (blue) | Action buttons, links, active nav |
| `--accent` | `260 60% 58%` (purple) | Logo gradient, highlights |
| `--destructive` | `0 84% 60%` (red) | Delete actions, errors |
| `--muted-foreground` | `220 10% 46%` (gray) | Secondary text, placeholders |
| `--border` / `--input` | `220 15% 90%` | Borders, input borders |

### Glass Effects (CSS classes)

| Class | Blur | Usage |
|-------|------|-------|
| `.glass` | 16px | Sidebar, mobile header, sticky elements |
| `.glass-subtle` | 8px | (reserved) |
| `.glass-strong` | 24px | Mobile sheet drawer, dropdown menus |
| `.bg-mesh` | n/a | Page backgrounds (subtle radial gradients) |

### Responsive Breakpoints

| Prefix | Width | Typical Use |
|--------|-------|-------------|
| (base) | <640px | Mobile-first defaults |
| `sm:` | 640px+ | Wider spacing, side-by-side layouts |
| `md:` | 768px+ | Switch from mobile header to desktop sidebar |
| `lg:` | 1024px+ | Two-column form grids |

### Spacing Rules

- **Page wrapper:** `space-y-4 sm:space-y-6`
- **Within cards:** `space-y-4`
- **Form fields:** `space-y-2` (label + input)
- **Grid gaps:** `gap-4 sm:gap-6` (between cards), `gap-4` (within grids)
- **Button gaps:** `gap-3` (between action buttons)
- **Header title:** `text-2xl sm:text-3xl font-bold tracking-tight`
- **Header subtitle:** `text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2`

### Text Sizes

| Element | Classes |
|---------|---------|
| Page title | `text-2xl sm:text-3xl font-bold tracking-tight` |
| Card title | `text-base` (via CardTitle) or default |
| Body text | `text-sm` |
| Small/meta | `text-xs` or `text-[11px]` |
| Code/JSON | `text-[10px] sm:text-xs font-mono` |
| Muted text | `text-muted-foreground` |

---

## Icon Reference (lucide-react)

| Icon | Usage |
|------|-------|
| `Plus` | Add/create button |
| `Pencil` | Edit action |
| `Trash2` | Delete action |
| `ArrowLeft` | Back navigation |
| `Search` | Search input |
| `Filter` | Filter button |
| `Code` | Debug sheet trigger |
| `Copy` / `Check` | Copy-to-clipboard toggle |
| `X` | Close/cancel/remove filter |
| `Save` | Save button |
| `MoreHorizontal` | Actions dropdown trigger |
| `ChevronDown` | Collapsible toggle, dropdown |
| `RefreshCw` | Reload data (with `animate-spin` when loading) |
| `UserPlus` | Add user action |
| `Menu` | Mobile hamburger menu trigger |
| `PanelLeft` | Sidebar expand indicator (collapsed state) |
| `PanelLeftClose` | Sidebar collapse indicator (expanded state) |
| `Building2` | Business unit nav/icon |
| `Network` | Cluster nav/icon |
| `Users` | Users nav/icon |
| `LayoutDashboard` | Dashboard nav |
| `Download` | CSV export button |
| `Loader2` | Loading spinner (always with `animate-spin`) |
| `Keyboard` | Keyboard shortcuts (help dialog) |

**Pattern:** Icons in buttons use `className="mr-2 h-4 w-4"`. Standalone icon buttons use `size="icon"`.

---

## Error Handling

**Preferred:** Use `parseApiError()` + `toast.error()` (see Error Parsing Pattern section above).

```tsx
import { parseApiError } from '../utils/errorParser';
import { toast } from 'sonner';

// Modern pattern (preferred)
try {
  const data = await service.operation();
  toast.success('Operation completed');
} catch (err) {
  const { message, fields } = parseApiError(err);
  toast.error('Failed to load', { description: message });
  if (fields) setFieldErrors(fields);
}

// Inline error display (for persistent form errors)
{error && (
  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
)}
```

**Never** use `alert()` or `window.alert()`. Use `toast.error()` instead.

---

## Pagination State Management

```tsx
const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
  localStorage.setItem('perpage_<type>', String(perpage));   // persist per-page preference
  setPaginate(prev => ({ ...prev, page, perpage }));
};

const handleSortChange = (sort: string) => {
  setPaginate(prev => ({ ...prev, sort }));                  // format: "field:asc" or "field:desc"
};
```

---

## Route Patterns

```tsx
// List page
<Route path="/items" element={<PrivateRoute><ItemManagement /></PrivateRoute>} />

// Create new
<Route path="/items/new" element={<PrivateRoute><ItemEdit /></PrivateRoute>} />

// View/Edit existing
<Route path="/items/:id/edit" element={<PrivateRoute><ItemEdit /></PrivateRoute>} />

// With role guard
<Route path="/items" element={
  <PrivateRoute allowedRoles={["platform_admin", "support_manager"]}>
    <ItemManagement />
  </PrivateRoute>
} />
```

**Navigation:**

```tsx
navigate('/items');                                    // go to list
navigate(`/items/${id}/edit`);                         // go to detail
navigate(`/items/${created.id}`, { replace: true });   // redirect after create
navigate(`/items/new?cluster_id=${id}`);               // create with preselected parent
```

---

## DateTime Formatting

No library used; inline formatter:

```tsx
const fmt = (v: string | undefined) => {
  if (!v) return '-';
  const dt = new Date(v);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
};
```

---

## Rules for AI

1. **Always read existing page files** before creating or modifying pages. Match the exact patterns above.
2. **Never modify `src/components/ui/`** files unless explicitly asked. These are shadcn/ui primitives.
3. **Every list page** must have: search (debounced 400ms), filter Sheet, DataTable (server-side), debug Sheet, loading overlay.
4. **Every edit page** must have: read-only + edit mode toggle, back button, save/cancel buttons, debug Sheet with tabs, error display.
5. **Use `variant="success"` for active badges**, `variant="secondary"` for inactive. Never use green Tailwind classes directly for status.
6. **Persist `perpage` in localStorage** per entity type (key: `perpage_<type>`).
7. **All types** go in `src/types/index.ts`. Page-specific interfaces (FormData, local types) stay in the page file.
8. **Services** follow the exact CRUD pattern. API path prefix is `/api-system/`.
9. **Icon convention:** `mr-2 h-4 w-4` inside buttons with text. `h-5 w-5` for standalone icons.
10. **Responsive:** Design mobile-first. Use `sm:`, `md:`, `lg:` breakpoints. Test both layouts.
11. **Do not add** external libraries without asking. The project uses minimal dependencies by design.
12. **Glass effects** are used on sidebar, mobile header, and dropdown menus only. Cards use default shadcn styling.
13. **Debug sheets** are dev-only (`process.env.NODE_ENV === 'development'`). Always store raw API responses.
14. **Column definitions** must be wrapped in `useMemo` with proper dependencies.
15. **Form handleChange** uses a single generic handler for text/checkbox/select via `e.target.name`.
16. **Always use toast notifications** (`toast.success()`, `toast.error()` from `sonner`) instead of browser `alert()` or `window.confirm()`. Use `<ConfirmDialog>` for confirmations.
17. **Show skeleton loaders** during initial data fetch (`loading && items.length === 0` → `<TableSkeleton>`). Show loading overlay only when refreshing existing data. Show `<EmptyState>` when load completes with no data.
18. **Add keyboard shortcuts** to all pages via `useGlobalShortcuts`: `Ctrl/⌘+K` for search (Management pages), `Ctrl/⌘+S` for save (Edit pages), `Escape` for cancel. Help dialog (`?`) is automatic via Layout.
19. **Warn on unsaved changes** in all Edit pages with `useUnsavedChanges(hasChanges)`. Compute `hasChanges` by comparing `formData` vs `savedFormData`.
20. **Validate fields in real-time** with `validateField(name, value)` on blur. Display inline errors with `<p className="text-xs text-destructive">`. Clear errors on change.
21. **Add CSV export** to all Management pages with `generateCSV()` + `downloadCSV()`. Place the export button in the header row next to "Add" button.
22. **Parse API errors** with `parseApiError(err)` in all catch blocks. Display message with `toast.error()`, set field-level errors with `setFieldErrors(fields)` when returned.
23. **Use EmptyState component** when no data exists after successful load. Always include `icon`, `title`, `description`, and an action button to guide the user.
