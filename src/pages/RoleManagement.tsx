import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { RolesAccessSummary, summarizeRoles, type RolesSummaryData } from './roleManagement/RolesAccessSummary';
import roleService from '../services/roleService';
import { getErrorDetail, devLog, parseApiError } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, ShieldCheck, Download, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { ListEmptyState } from '../components/ListEmptyState';
import type { PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

// List-row shape — extends Role with the server-provided permission_count
interface RoleRow {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  permission_count?: number;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const fmtDateTime = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const RoleManagement: React.FC = () => {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<RolesSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const storedSearch = localStorage.getItem('search_roles') || '';
  const storedFilters = getStoredJSON<string[]>('filters_roles', []);
  const storedPage = Number(localStorage.getItem('page_roles')) || 1;
  const storedSort = localStorage.getItem('sort_roles') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (filters: string[]) => {
    return filters.length === 1
      ? JSON.stringify({ where: { is_active: filters[0] === 'true' } })
      : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_roles')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchRoles = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await roleService.getAll(params);
      setRawResponse(data);
      const raw = data.data || data;
      // Timestamps may arrive nested under `audit`; flatten for the date columns
      // (tolerate the older flat shape too).
      const items: RoleRow[] = (Array.isArray(raw) ? raw : []).map((item: RoleRow & { audit?: { created?: { at?: string; name?: string }; updated?: { at?: string; name?: string } } }) => {
        const audit = item.audit;
        return {
          ...item,
          created_at: item.created_at ?? audit?.created?.at,
          created_by_name: item.created_by_name ?? audit?.created?.name,
          updated_at: item.updated_at ?? audit?.updated?.at,
          updated_by_name: item.updated_by_name ?? audit?.updated?.name,
        };
      });
      setRoles(items);
      setTotalRows(data.paginate?.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      setError('Failed to load roles: ' + getErrorDetail(err));
      devLog('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles(paginate);
  }, [fetchRoles, paginate]);

  // RBAC band: roll up the whole set (ignoring filters) so the counts and breadth
  // ranking reflect every role, not the current view.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await roleService.getAll({ perpage: -1 });
      const raw = data.data || data;
      setSummary(summarizeRoles(Array.isArray(raw) ? (raw as Parameters<typeof summarizeRoles>[0]) : []));
    } catch {
      setSummary(null); // band swaps to its inline error/retry affordance; the table still works
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_roles', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_roles', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_roles', String(perpage));
    localStorage.setItem('page_roles', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_roles', JSON.stringify(next));
    localStorage.setItem('page_roles', '1');
    const advance = buildAdvance(next);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_roles', JSON.stringify([]));
    localStorage.setItem('page_roles', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_roles', JSON.stringify([]));
    localStorage.setItem('page_roles', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_roles', sort);
    localStorage.setItem('page_roles', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await roleService.delete(deleteId);
      toast.success('Role deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to delete role', { description: parsed.message });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(roles, [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'permission_count', label: 'Permissions' },
      { key: 'is_active', label: 'Active' },
    ]);
    downloadCSV(csv, `roles-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<RoleRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <Link
            to={`/platform/roles/${row.original.id}/edit`}
            className="text-primary hover:underline font-medium whitespace-nowrap"
            title={row.original.name}
          >
            {row.original.name}
          </Link>
          {row.original.description && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[320px]"
              title={row.original.description}
            >
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'permission_count',
      header: 'Permissions',
      enableSorting: false,
      meta: { cellClassName: 'text-center' },
      cell: ({ row }) => (
        <Badge variant="secondary">
          {row.original.permission_count ?? 0}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
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
            <div>{fmtDateTime(d.created_at)}</div>
            {d.created_by_name && <div>{d.created_by_name}</div>}
          </div>
        );
      },
    },
    {
      accessorKey: 'updated_at',
      id: 'updated_at',
      header: 'Updated',
      cell: ({ row }) => {
        const d = row.original;
        if (d.updated_at && d.updated_at === d.created_at) return <span className="text-[11px] text-muted-foreground">-</span>;
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmtDateTime(d.updated_at)}</div>
            {d.updated_by_name && <div>{d.updated_by_name}</div>}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-20', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Actions for ${row.original.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="role.update">
              <DropdownMenuItem
                onClick={() => navigate(`/platform/roles/${row.original.id}/edit`)}
                className="cursor-pointer"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="role.delete">
              <DropdownMenuItem
                onClick={() => handleDelete(row.original.id)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header row */}
        <PageHeader
          title="Roles"
          subtitle="Manage platform roles and their permissions"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/platform/permissions')}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Permission Catalog
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading || roles.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="role.create">
                <Button onClick={() => navigate('/platform/roles/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Role</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
            </>
          }
        />

        <RolesAccessSummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} />

        <Card>
          <CardHeader className="space-y-3">
            {/* Search + Filter row */}
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search roles..."
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Filter roles by status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={handleClearStatusFilter}
                          >
                            Clear
                          </Button>
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
                    {activeFilterCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleClearAllFilters}
                      >
                        Clear All Filters
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Active filter badges */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filters:</span>
                {statusFilter.map((s) => {
                  const label = s === 'true' ? 'Active' : 'Inactive';
                  return (
                    <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                      {label}
                      <button
                        onClick={() => handleStatusFilter(s)}
                        className="ml-0.5 hover:text-foreground"
                        aria-label={`Remove ${label} filter`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                <button
                  onClick={handleClearAllFilters}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
                {error}
              </div>
            )}

            {!error && roles.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={ShieldCheck}
                emptyTitle="No roles yet"
                emptyDescription="Get started by creating your first role to manage platform permissions."
                addAction={
                  <Can permission="role.create">
                    <Button size="sm" onClick={() => navigate('/platform/roles/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Role
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && roles.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                  <>
                    {loading && (
                      <div
                        className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                        role="status"
                        aria-label="Loading roles"
                      >
                        <div className="text-muted-foreground">Loading roles...</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={roles}
                      serverSide
                      tableLayout="auto"
                      totalRows={totalRows}
                      page={paginate.page}
                      perpage={paginate.perpage}
                      onPaginateChange={handlePaginateChange}
                      onSortChange={handleSortChange}
                      defaultSort={{ id: 'created_at', desc: true }}
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
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete Role"
        description="Are you sure you want to delete this role? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/roles" data={rawResponse} />
    </Layout>
  );
};

export default RoleManagement;
