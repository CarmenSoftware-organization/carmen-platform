# Application Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `platform_admin`-only admin CRUD page set for **Applications** (`/api-system/applications`), following the canonical Cluster Management + Edit pattern.

**Architecture:** Two-page pattern — `ApplicationManagement.tsx` (server-side DataTable list) + `ApplicationEdit.tsx` (edit/read-only form). A thin `applicationService.ts` wraps the REST endpoints and translates between the asymmetric read model (`api_names: string[]`) and write model (`details.add: [{ api_name }]`). Routes + a sidebar nav item complete the wiring.

**Tech Stack:** React 18 + TypeScript (Vite), react-router-dom v6, TanStack Table v8 (`DataTable`), shadcn/ui, sonner, lucide-react.

**Verification note:** This repo has no unit-test runner (Vitest is deferred). The verification gate for each task is `bun run build` (runs TypeScript typecheck + eslint via vite-plugin-eslint) plus manual browser checks. An optional Playwright e2e task is included at the end.

---

## File Structure

- **Create** `src/services/applicationService.ts` — REST wrapper + read/write model translation.
- **Modify** `src/types/index.ts` — add `Application` + `ApplicationWritePayload` interfaces.
- **Create** `src/pages/ApplicationManagement.tsx` — list page (search, status filter, CSV, debug Sheet).
- **Create** `src/pages/ApplicationEdit.tsx` — create/view/edit form (name, description, is_active, allow_all, api_names multi-select).
- **Modify** `src/App.tsx` — lazy imports + 3 routes.
- **Modify** `src/components/Layout.tsx` — `AppWindow` icon import + nav item.
- **Optional create** `e2e/tests/applications.spec.ts` — smoke e2e.

---

## Task 1: Add Application types

**Files:**
- Modify: `src/types/index.ts` (append near other entity interfaces, e.g. after the `Cluster` interface block)

- [ ] **Step 1: Add the interfaces**

Append to `src/types/index.ts`:

```ts
export interface Application {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  api_names?: string[]; // read model (flat list of api_name strings)
}

// Write payload for create/update. The backend is asymmetric to the read model:
// selected api_names are sent through details.add[]. Update uses replace semantics
// (send the full desired set).
export interface ApplicationWritePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  details?: { add: { api_name: string }[] };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run build`
Expected: build succeeds (no TS errors). If the dev server is running, `bunx tsc --noEmit` also works for a faster check.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(applications): add Application types"
```

---

## Task 2: Create applicationService

**Files:**
- Create: `src/services/applicationService.ts`

Copies `clusterService.ts` shape. Adds `getApiCatalog()` and translates `api_names` → `details.add`.

- [ ] **Step 1: Write the service**

Create `src/services/applicationService.ts`:

```ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Application, ApplicationWritePayload, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'description'];

// Build the write payload from flat form data. `api_names` (string[]) is translated
// into the backend's details.add[] shape. Empty/whitespace entries are dropped.
const toWritePayload = (data: {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  api_names?: string[];
}): ApplicationWritePayload => {
  const payload: ApplicationWritePayload = {
    name: data.name,
    description: data.description,
    is_active: data.is_active,
    allow_all: data.allow_all,
  };
  // When allow_all is set the backend grants every API, so api_names are irrelevant.
  if (!data.allow_all) {
    const cleaned = (data.api_names ?? []).map((s) => s.trim()).filter(Boolean);
    payload.details = { add: cleaned.map((api_name) => ({ api_name })) };
  }
  return payload;
};

const applicationService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Application>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? paginate.filter as Record<string, unknown> : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/applications?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/applications/${id}`);
    return response.data;
  },

  // Catalog of selectable api_name values (flat string[]).
  getApiCatalog: async (): Promise<string[]> => {
    const response = await api.get('/api-system/applications/api-catalog');
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },

  create: async (data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.post('/api-system/applications', toWritePayload(data));
    return response.data;
  },

  update: async (id: string, data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.put(`/api-system/applications/${id}`, toWritePayload(data));
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/applications/${id}`);
    return response.data;
  },
};

export default applicationService;
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/services/applicationService.ts
git commit -m "feat(applications): add applicationService with catalog + write-model translation"
```

---

## Task 3: Create ApplicationManagement list page

**Files:**
- Create: `src/pages/ApplicationManagement.tsx`

Based on `ClusterManagement.tsx` but simpler: no soft-delete, no logo column. Keeps debounced search (400ms), status filter Sheet, active-filter badges, server-side DataTable, CSV export, dev debug Sheet, `Ctrl/⌘+K` search.

- [ ] **Step 1: Write the page**

Create `src/pages/ApplicationManagement.tsx`:

```tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import applicationService from '../services/applicationService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal, Copy, Check, Filter, X, AppWindow, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import type { Application, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const ApplicationManagement: React.FC = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_applications') || '';
  const storedFilters = getStoredJSON<string[]>('filters_applications', []);
  const storedPage = Number(localStorage.getItem('page_applications')) || 1;
  const storedSort = localStorage.getItem('sort_applications') || 'name:asc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (filters: string[]) =>
    filters.length === 1 ? JSON.stringify({ where: { is_active: filters[0] === 'true' } }) : '';

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_applications')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters),
    filter: {},
  });

  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchApplications = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await applicationService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      setApplications(Array.isArray(items) ? items : []);
      setTotalRows(data.paginate?.total ?? (data as { total?: number }).total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      setError('Failed to load applications: ' + getErrorDetail(err));
      devLog('Error fetching applications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications(paginate);
  }, [fetchApplications, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_applications', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_applications', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_applications', String(perpage));
    localStorage.setItem('page_applications', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_applications', JSON.stringify(next));
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_applications', JSON.stringify([]));
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_applications', sort);
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await applicationService.delete(deleteId);
      toast.success('Application deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete application', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(
      applications.map((a) => ({
        name: a.name,
        description: a.description ?? '',
        access: a.allow_all ? 'All APIs' : String(a.api_names?.length ?? 0) + ' APIs',
        is_active: a.is_active ? 'Active' : 'Inactive',
      })),
      [
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description' },
        { key: 'access', label: 'Access' },
        { key: 'is_active', label: 'Status' },
      ],
    );
    downloadCSV(csv, `applications-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<Application, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link to={`/applications/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description || '-'}</span>
      ),
    },
    {
      id: 'access',
      header: 'Access',
      enableSorting: false,
      cell: ({ row }) => (
        row.original.allow_all
          ? <Badge variant="outline">All APIs</Badge>
          : <span className="text-sm">{row.original.api_names?.length ?? 0} APIs</span>
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
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/applications/${row.original.id}/edit`)} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Application Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage applications and their API access</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || applications.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate('/applications/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Application
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search applications"
                />
                {searchTerm && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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
                    <SheetDescription>Filter applications by status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearAllFilters}>Clear</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant={statusFilter.includes('true') ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter('true')}
                        >
                          Active
                        </Button>
                        <Button
                          variant={statusFilter.includes('false') ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter('false')}
                        >
                          Inactive
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filters:</span>
                {statusFilter.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === 'true' ? 'Active' : 'Inactive'}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && applications.length === 0 && !loading ? (
              <EmptyState
                icon={AppWindow}
                title="No applications yet"
                description={searchTerm ? `No applications matching "${searchTerm}"` : 'Get started by creating your first application.'}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/applications/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Application
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && applications.length === 0 ? (
                  <TableSkeleton columns={5} rows={paginate.perpage || 5} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading applications">
                        <div className="text-muted-foreground">Loading applications...</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={applications}
                      serverSide
                      totalRows={totalRows}
                      page={paginate.page}
                      perpage={paginate.perpage}
                      onPaginateChange={handlePaginateChange}
                      onSortChange={handleSortChange}
                      defaultSort={{ id: 'name', desc: false }}
                    />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Application"
        description="Are you sure you want to delete this application? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
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
              <SheetDescription className="text-xs sm:text-sm">GET /api-system/applications</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default ApplicationManagement;
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ApplicationManagement.tsx
git commit -m "feat(applications): add ApplicationManagement list page"
```

---

## Task 4: Create ApplicationEdit page

**Files:**
- Create: `src/pages/ApplicationEdit.tsx`

Based on the form portion of `ClusterEdit.tsx` (edit/read-only toggle, back, Save/Cancel, `useUnsavedChanges`, `Ctrl/⌘+S`, `Escape`, on-blur `validateField`, dev debug Sheet). Fields: name (required), description, is_active, allow_all, api_names. The api_names control is a multi-select built from `getApiCatalog()`; if the catalog fails it falls back to a `<ChipInput>`. It is hidden when `allow_all` is true.

- [ ] **Step 1: Write the page**

Create `src/pages/ApplicationEdit.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import applicationService from '../services/applicationService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ChipInput } from '../components/ui/chip-input';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';

interface ApplicationFormData {
  name: string;
  description: string;
  is_active: boolean;
  allow_all: boolean;
  api_names: string[];
}

const emptyForm: ApplicationFormData = {
  name: '',
  description: '',
  is_active: true,
  allow_all: false,
  api_names: [],
};

const ApplicationEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ApplicationFormData>(emptyForm);
  const [savedFormData, setSavedFormData] = useState<ApplicationFormData>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<string[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    applicationService.getApiCatalog()
      .then(setCatalog)
      .catch((err) => { setCatalogFailed(true); devLog('Failed to load api catalog:', err); });
  }, []);

  useEffect(() => {
    if (!isNew) fetchApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const data = await applicationService.getById(id!);
      setRawResponse(data);
      const app = data.data || data;
      const loaded: ApplicationFormData = {
        name: app.name || '',
        description: app.description || '',
        is_active: app.is_active ?? true,
        allow_all: app.allow_all ?? false,
        api_names: Array.isArray(app.api_names) ? app.api_names : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
    } catch (err: unknown) {
      setError('Failed to load application: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const toggleApiName = (api: string) => {
    setFormData(prev => ({
      ...prev,
      api_names: prev.api_names.includes(api)
        ? prev.api_names.filter(a => a !== api)
        : [...prev.api_names, api],
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Pre-submit validation: name is required.
    const nameError = validateField('name', formData.name) || (!formData.name.trim() ? 'Name is required' : '');
    if (nameError) {
      setFieldErrors(prev => ({ ...prev, name: nameError }));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        is_active: formData.is_active,
        allow_all: formData.allow_all,
        api_names: formData.api_names,
      };
      if (isNew) {
        const result = await applicationService.create(payload);
        const created = result.data || result;
        toast.success('Application created successfully');
        if (created?.id) {
          navigate(`/applications/${created.id}/edit`, { replace: true });
        } else {
          navigate('/applications');
        }
      } else {
        await applicationService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchApplication();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save application: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const readOnlyBox = 'flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center';

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/applications')} aria-label="Back to applications">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add Application' : editing ? 'Edit Application' : 'Application Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new application' : editing ? 'Update application information' : 'View application information'}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
            <CardDescription>
              {isNew ? 'Fill in the details for the new application' : editing ? 'Modify the application details below' : 'Application information'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name {editing && '*'}</Label>
                {editing ? (
                  <>
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="Application name"
                      className={fieldErrors.name ? 'border-destructive' : ''}
                      required
                    />
                    {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                  </>
                ) : (
                  <div className={readOnlyBox}>{formData.name || '-'}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Description"
                  />
                ) : (
                  <div className={readOnlyBox}>{formData.description || '-'}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-input"
                    />
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

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <input
                      type="checkbox"
                      id="allow_all"
                      name="allow_all"
                      checked={formData.allow_all}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="allow_all">Allow all APIs</Label>
                  </>
                ) : (
                  <>
                    <Label>API Access</Label>
                    <Badge variant={formData.allow_all ? 'outline' : 'secondary'} className="ml-2">
                      {formData.allow_all ? 'All APIs' : `${formData.api_names.length} selected`}
                    </Badge>
                  </>
                )}
              </div>

              {/* api_names — hidden entirely when allow_all is on */}
              {!formData.allow_all && (
                <div className="space-y-2">
                  <Label htmlFor="api_names">API Names</Label>
                  {editing ? (
                    catalogFailed ? (
                      <ChipInput
                        id="api_names"
                        name="api_names"
                        value={formData.api_names.join(',')}
                        onChange={(v) => setFormData(prev => ({ ...prev, api_names: v ? v.split(',').map(s => s.trim()).filter(Boolean) : [] }))}
                        placeholder="Type an api_name and press Enter"
                      />
                    ) : (
                      <div className="rounded-md border border-input max-h-60 overflow-y-auto divide-y">
                        {catalog.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Loading catalog…</p>
                        ) : (
                          catalog.map((api) => (
                            <label key={api} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-input"
                                checked={formData.api_names.includes(api)}
                                onChange={() => toggleApiName(api)}
                              />
                              <span className="text-sm">{api}</span>
                            </label>
                          ))
                        )}
                      </div>
                    )
                  ) : (
                    formData.api_names.length === 0 ? (
                      <div className={`${readOnlyBox} text-muted-foreground`}>-</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.api_names.map((api) => (
                          <Badge key={api} variant="outline" className="text-xs">{api}</Badge>
                        ))}
                      </div>
                    )
                  )}
                  {editing && !catalogFailed && (
                    <p className="text-xs text-muted-foreground">{formData.api_names.length} selected</p>
                  )}
                </div>
              )}

              {editing && (
                <div className="flex gap-3 pt-4">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? 'Saving...' : isNew ? 'Create Application' : 'Save Changes'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/applications') : handleCancelEdit}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !isNew && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
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
              <SheetDescription className="text-xs sm:text-sm">{`GET /api-system/applications/${id}`}</SheetDescription>
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
    </Layout>
  );
};

export default ApplicationEdit;
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): add ApplicationEdit page"
```

---

## Task 5: Wire routes + sidebar nav

**Files:**
- Modify: `src/App.tsx` (lazy imports near line 12-21; routes near the cluster routes block)
- Modify: `src/components/Layout.tsx` (lucide import line 6; `allNavItems` near line 49-58)

- [ ] **Step 1: Add lazy imports in `src/App.tsx`**

After the `ClusterEdit` lazy import line, add:

```ts
const ApplicationManagement = lazy(() => import("./pages/ApplicationManagement"));
const ApplicationEdit = lazy(() => import("./pages/ApplicationEdit"));
```

- [ ] **Step 2: Add routes in `src/App.tsx`**

After the `/clusters/:id/edit` `<Route>` block, add:

```tsx
<Route
  path="/applications"
  element={
    <PrivateRoute allowedRoles={["platform_admin"]}>
      <ApplicationManagement />
    </PrivateRoute>
  }
/>
<Route
  path="/applications/new"
  element={
    <PrivateRoute allowedRoles={["platform_admin"]}>
      <ApplicationEdit />
    </PrivateRoute>
  }
/>
<Route
  path="/applications/:id/edit"
  element={
    <PrivateRoute allowedRoles={["platform_admin"]}>
      <ApplicationEdit />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 3: Add the lucide icon import in `src/components/Layout.tsx`**

Change line 6 from:

```ts
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Printer, Newspaper, Megaphone } from 'lucide-react';
```

to:

```ts
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Printer, Newspaper, Megaphone, AppWindow } from 'lucide-react';
```

- [ ] **Step 4: Add the nav item in `src/components/Layout.tsx`**

In the `allNavItems` array, add this entry (place it after the News entry, before `Send Broadcast`):

```tsx
{ path: '/applications', label: 'Applications', icon: AppWindow, roles: ['platform_admin'] },
```

- [ ] **Step 5: Verify it compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat(applications): wire routes and sidebar nav (platform_admin)"
```

---

## Task 6: Manual verification

**Files:** none (manual checks against the running backend)

- [ ] **Step 1: Start the dev server**

Run: `bun start`
Expected: Vite serves on `:3100` with no eslint errors in the terminal.

- [ ] **Step 2: Log in as `platform_admin` and walk the flows**

Verify each:
- Sidebar shows **Applications** (AppWindow icon); a non-`platform_admin` user does NOT see it and visiting `/applications` shows Access Denied.
- List loads, search filters by name/description (debounced), status filter (Active/Inactive) works, Export CSV downloads.
- **Create:** `/applications/new` → enter name + tick some api_names from the catalog → Create → redirects to the new record's edit page; toast shows success.
- **Edit:** open an existing app → Edit → change api_names selection → Save → reload shows the new set (replace semantics confirmed).
- **allow_all:** tick "Allow all APIs" → api_names selector disappears; save → reopen → access shows "All APIs".
- **Delete:** ConfirmDialog → confirm → row removed, toast shows success.
- **Catalog fallback:** (optional) block `GET /api-system/applications/api-catalog` (e.g. devtools) → the api_names field falls back to a ChipInput.
- Open the dev debug Sheet (amber button) → shows raw JSON.

- [ ] **Step 3: Confirm the build is clean**

Run: `CI=true bun run build`
Expected: build succeeds with warnings treated as errors (none). If anything fails, fix and re-commit before finishing.

---

## Task 7 (Optional): Playwright smoke e2e

**Files:**
- Create: `e2e/tests/applications.spec.ts` (mirror the closest existing spec under `e2e/tests/`)

- [ ] **Step 1: Write a minimal smoke spec** (uses the shared `AuthHelper`; no new page-objects needed)

Create `e2e/tests/applications/applications.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';

test.describe('Applications - Smoke', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('list page renders for platform_admin', async ({ page }) => {
    await page.goto('/applications');
    await expect(page.getByRole('heading', { name: 'Application Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Application' })).toBeVisible();
  });

  test('can open the create form', async ({ page }) => {
    await page.goto('/applications/new');
    await expect(page.getByRole('heading', { name: 'Add Application' })).toBeVisible();
    await expect(page.getByLabel('Name *')).toBeVisible();
  });
});
```

Note: `AuthHelper.login()` must authenticate as a `platform_admin` account (check `e2e/helpers/auth.ts` / `.env` test credentials). If the default test user is not `platform_admin`, point the helper at one that is, or this page will render Access Denied.

- [ ] **Step 2: Run it**

Run: `bun run test:e2e -- applications`
Expected: PASS (requires the backend + a `platform_admin` test account).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/applications.spec.ts
git commit -m "test(applications): add smoke e2e for Application Management"
```

---

## Notes for the implementer
- **Never** use `alert()` / `window.confirm()` — use `toast.*` and `<ConfirmDialog>` (already done above).
- **Never** add a `#` index column to `DataTable` (it adds one itself).
- Status uses `<Badge variant="success" | "secondary">`, never raw green Tailwind.
- All debug-only code is wrapped in `import.meta.env.DEV`.
- `perpage` is persisted as `perpage_applications`.
