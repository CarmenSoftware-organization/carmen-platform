import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { RolesAccessSummary } from './roleManagement/RolesAccessSummary';
import type { RolesSummaryData } from '../types';
import roleService from '../services/roleService';
import permissionService from '../services/permissionService';
import { RoleReachCell } from './roleManagement/RoleReachCell';
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
import { auditColumns } from '../components/auditColumns';
import { useI18n } from '../hooks/useI18n';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

// List-row shape — extends Role with the server-provided permission_count
interface RoleRow {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  permission_count?: number;
  /** Resource families this role touches. Server-side; absent until the backend ships it. */
  resource_count?: number;
  created_at?: string;
  updated_at?: string;
}

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const RoleManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<RolesSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  // The size of the permission catalog is what turns `permission_count` from an opaque
  // integer into a reach: 51 means nothing until you know the catalog holds 51. Kept as a
  // plain number with 0 meaning "not known" — every consumer here already has to handle the
  // unanchored case, so a separate loading flag would only be a second way to say it.
  const [catalogSize, setCatalogSize] = useState(0);

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
      // Created/Updated are read by `auditColumns` via `normalizeAudit`, which handles both
      // the nested `audit.*` shape and the older flat shape itself — no pre-flatten here.
      const items: RoleRow[] = Array.isArray(raw) ? raw : [];
      setRoles(items);
      setTotalRows(data.paginate?.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      setError(t('pages.roles.loadFailed', { detail: getErrorDetail(err, t) }));
      devLog('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRoles(paginate);
  }, [fetchRoles, paginate]);

  // RBAC band reads a dedicated endpoint that takes no filter, so the counts always describe
  // every role — not the current search/advance view. On a failed refresh the last known
  // numbers are kept (not cleared) and `summaryError` drives a dimmed "couldn't refresh" cue —
  // see RolesAccessSummary's `error` handling, mirrored from ClusterManagement's FleetCapacity.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await roleService.getAccessSummary();
      setSummary(data);
    } catch (err: unknown) {
      devLog('Error loading roles summary:', err);
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Best-effort: a failed catalog fetch must not degrade the list. Everything that reads
  // `catalogSize` falls back to the unanchored rendering this page had before, so there is
  // nothing to tell the user about and no retry to offer.
  useEffect(() => {
    let cancelled = false;
    permissionService
      .getCatalog()
      .then((items) => {
        if (!cancelled) setCatalogSize(items.length);
      })
      .catch((err: unknown) => devLog('Failed to load permission catalog for reach scale:', err));
    return () => {
      cancelled = true;
    };
  }, []);

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
      toast.success(t('toast.deleted', { entity: t('entity.role.title') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error(t('toast.deleteFailed', { entity: t('entity.role.lower') }), { description: parsed.message });
    }
  };

  const handleExport = () => {
    const rows = roles.map((r) => ({ ...r, ...auditCsvFields(normalizeAudit(r)) }));
    const csv = generateCSV(rows, [
      { key: 'name', label: t('common.field.name') },
      { key: 'description', label: t('common.field.description') },
      { key: 'permission_count', label: t('pages.roles.columnPermissions') },
      { key: 'is_active', label: t('common.status.active') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `roles-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<RoleRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('common.field.name'),
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
      header: t('pages.roles.columnPermissions'),
      enableSorting: false,
      meta: { headerClassName: 'w-56', cellClassName: 'w-56' },
      cell: ({ row }) => (
        <RoleReachCell
          name={row.original.name}
          permissionCount={row.original.permission_count ?? 0}
          catalogSize={catalogSize}
          resourceCount={row.original.resource_count}
        />
      ),
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    ...auditColumns<RoleRow>({ t }),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
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
            <Can permission="platform_role.update">
              <DropdownMenuItem
                onClick={() => navigate(`/platform/roles/${row.original.id}/edit`)}
                className="cursor-pointer"
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="platform_role.delete">
              <DropdownMenuItem
                onClick={() => handleDelete(row.original.id)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, t, catalogSize]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header row */}
        <PageHeader
          title={t('pages.roles.title')}
          subtitle={t('pages.roles.subtitle')}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/platform/category-permissions')}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {t('pages.roles.permissionCatalog')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading || roles.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="platform_role.create">
                <Button onClick={() => navigate('/platform/roles/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.roles.addRole')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <RolesAccessSummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} catalogSize={catalogSize} />

        <Card>
          <CardHeader className="space-y-3">
            {/* Search + Filter row */}
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('pages.roles.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    {t('common.label.filters')}
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>{t('common.label.filters')}</SheetTitle>
                    <SheetDescription>{t('pages.roles.filtersDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                        {statusFilter.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={handleClearStatusFilter}
                          >
                            {t('common.action.clear')}
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
                          {t('common.status.active')}
                        </Button>
                        <Button
                          variant={statusFilter.includes('false') ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter('false')}
                        >
                          {t('common.status.inactive')}
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
                        {t('common.action.clearAllFilters')}
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Active filter badges */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {statusFilter.map((s) => {
                  const label = s === 'true' ? t('common.status.active') : t('common.status.inactive');
                  return (
                    <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                      {label}
                      <button
                        onClick={() => handleStatusFilter(s)}
                        className="ml-0.5 hover:text-foreground"
                        aria-label={t('pages.roles.removeFilterAria', { label })}
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
                  {t('common.action.clearAll')}
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
                emptyTitle={t('pages.roles.emptyTitle')}
                emptyDescription={t('pages.roles.emptyDescription')}
                addAction={
                  <Can permission="platform_role.create">
                    <Button size="sm" onClick={() => navigate('/platform/roles/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.roles.addRole')}
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
                        aria-label={t('pages.roles.loadingAria')}
                      >
                        <div className="text-muted-foreground">{t('pages.roles.loadingText')}</div>
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
        title={t('pages.roles.deleteTitle')}
        description={t('pages.roles.deleteDescription')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/roles" data={rawResponse} />
    </Layout>
  );
};

export default RoleManagement;
