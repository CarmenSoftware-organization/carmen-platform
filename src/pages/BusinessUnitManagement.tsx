import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import businessUnitService from '../services/businessUnitService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { DataTable } from '../components/ui/data-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Building2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { BrandMark } from '../components/BrandMark';
import { BuSummary } from './businessUnitManagement/BuSummary';
import { auditColumns } from '../components/auditColumns';
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import { useI18n } from '../hooks/useI18n';
import type { BuSummaryData } from '../types';
import type { BusinessUnit, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const BusinessUnitManagement: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_business_units') || '';
  const storedFilters = getStoredJSON<string[]>('filters_business_units', []);
  const storedPage = Number(localStorage.getItem('page_business_units')) || 1;
  const storedSort = localStorage.getItem('sort_business_units') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showDeleted, setShowDeleted] = useState<boolean>(getStoredJSON<boolean>('filter_business_units_deleted', false));
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BuSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const buildAdvance = (filters: string[], includeDeleted: boolean) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) {
      where.is_active = filters[0] === 'true';
    }
    if (!includeDeleted) {
      where.deleted_at = null;
    }
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem("perpage_business_units")) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, getStoredJSON<boolean>('filter_business_units_deleted', false)),
    filter: {},
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBusinessUnits = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await businessUnitService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      // Created/Updated/Deleted are all read via `normalizeAudit`, which handles both the
      // nested `audit.*` shape and the older flat shape itself — no hand-rolled fallback here.
      const mapped = (Array.isArray(items) ? items : []).map((item: any) => {
        const deleted = normalizeAudit(item).deleted;
        return { ...item, deleted_at: deleted?.at, deleted_by_name: deleted?.name };
      });
      setBusinessUnits(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      setError(t('pages.businessUnits.loadFailedPrefix') + getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchBusinessUnits(paginate);
  }, [fetchBusinessUnits, paginate]);

  // Overview strip reads a dedicated endpoint that takes no filter, so the numbers always
  // describe every business unit in scope — not the current search/advance view. On a failed
  // refresh the last known numbers are kept (not cleared) and `summaryError` drives a dimmed
  // "couldn't refresh" cue — see BuSummary's `error` handling, mirrored from
  // ClusterManagement's FleetCapacity.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await businessUnitService.getSummary();
      setSummary(data);
    } catch (err: unknown) {
      devLog('Error loading business unit summary:', err);
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
    localStorage.setItem('search_business_units', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_business_units', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_business_units", String(perpage));
    localStorage.setItem('page_business_units', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_business_units', JSON.stringify(next));
    localStorage.setItem('page_business_units', '1');
    const advance = buildAdvance(next, showDeleted);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleShowDeletedToggle = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    localStorage.setItem('filter_business_units_deleted', JSON.stringify(next));
    localStorage.setItem('page_business_units', '1');
    const advance = buildAdvance(statusFilter, next);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_business_units', JSON.stringify([]));
    localStorage.setItem('page_business_units', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], showDeleted), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setShowDeleted(false);
    localStorage.setItem('filters_business_units', JSON.stringify([]));
    localStorage.setItem('filter_business_units_deleted', JSON.stringify(false));
    localStorage.setItem('page_business_units', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], false), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (showDeleted ? 1 : 0);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_business_units', sort);
    localStorage.setItem('page_business_units', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await businessUnitService.delete(deleteId);
      toast.success(t('toast.deleted', { entity: t('entity.businessUnit.sentence') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.businessUnit.lower') }), { description: getErrorDetail(err, t) });
    }
  };

  const handleExport = () => {
    // `max_license_users` dropped (Task 3.5) — this list endpoint has no per-row seat total to
    // export instead: seats are now dated licence rows summed via a view, and the only
    // computed aggregate the backend exposes is per-cluster (`Cluster.total_max_license_users`),
    // not per-BU. Rather than export the retired raw column (stale the moment any licence
    // changes) or a blank column, the column is dropped.
    // generateCSV reads each column's raw field off the row object with no per-column
    // formatter — is_active never passes through the Badge that renders it in the table, so
    // without this mapping the file gets the raw JS boolean stringified ("true"/"false")
    // instead of the translated word the table shows. Map it to its rendered text here,
    // before generateCSV ever sees the row (same shape as clusterAdmin/BusinessUnitList.tsx's
    // is_active mapping / licenses/SubscriptionTable.tsx's `state: stateLabel(item.state)`).
    const rows = businessUnits.map((bu) => ({
      ...bu,
      ...auditCsvFields(normalizeAudit(bu)),
      is_active: bu.is_active ? t('common.status.active') : t('common.status.inactive'),
    }));
    const csv = generateCSV(rows, [
      { key: 'code', label: t('common.field.code') },
      { key: 'name', label: t('common.field.name') },
      { key: 'alias_name', label: t('common.field.aliasName') },
      { key: 'cluster_name', label: t('common.label.cluster') },
      { key: 'is_active', label: t('common.status.label') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `business-units-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => {
    const [createdColumn, updatedColumn] = auditColumns<BusinessUnit>({ t });
    return [
    {
      accessorKey: 'code',
      header: t('common.field.code'),
      // Fixed width so the sticky offset of the 3rd frozen column (Name) is
      // deterministic — see `stickyLeftColumns={3}` and `.table-sticky-left-3`.
      meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('common.field.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BrandMark
            src={row.original.avatar?.url}
            name={row.original.name}
            code={row.original.code}
          />
          <Link
            to={`/business-units/${row.original.id}/edit`}
            className="text-primary hover:underline whitespace-nowrap"
            title={row.original.name}
          >
            {row.original.name}
          </Link>
          {row.original.deleted_at && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0" title={row.original.deleted_by_name ? t('pages.businessUnits.deletedByName', { name: row.original.deleted_by_name }) : undefined}>
              {t('common.status.deleted')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'alias_name',
      header: t('common.field.alias'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.alias_name || '-'}</span>
      ),
    },
    { accessorKey: 'cluster_name', id: 'tb_cluster.name', header: t('common.label.cluster') },
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
    createdColumn,
    updatedColumn,
    ...(showDeleted ? [{
      id: 'deleted_at',
      header: t('common.audit.deletedDate'),
      cell: ({ row }: { row: { original: BusinessUnit } }) => (
        <AuditMeta
          variant="cell"
          actor={normalizeAudit(row.original).deleted}
          className="text-[11px] leading-tight text-destructive space-y-0.5"
        />
      ),
      enableSorting: false,
    } as ColumnDef<BusinessUnit, unknown>] : []),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.action.rowActions', { name: row.original.name || row.original.code })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="cluster.update" clusterId={row.original.cluster_id}>
              <DropdownMenuItem onClick={() => navigate(`/business-units/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="cluster.delete" clusterId={row.original.cluster_id}>
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    ];
  }, [t, navigate, handleDelete, showDeleted]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.businessUnits.title')}
          subtitle={t('pages.businessUnits.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || businessUnits.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="cluster.create">
                <Button onClick={() => navigate('/business-units/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.businessUnits.addBusinessUnit')}</span>
                  <span className="sm:hidden">{t('pages.businessUnits.addBu')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <BuSummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('common.state.searchBusinessUnits')}
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
                    <SheetDescription>{t('pages.businessUnits.filterBusinessUnitsByStatus')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStatusFilter}>{t('common.action.clear')}</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant={statusFilter.includes("true") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("true")}
                        >
                          {t('common.status.active')}
                        </Button>
                        <Button
                          variant={statusFilter.includes("false") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("false")}
                        >
                          {t('common.status.inactive')}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-sm font-medium">{t('common.status.deleted')}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showDeleted"
                          checked={showDeleted}
                          onChange={handleShowDeletedToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <Label htmlFor="showDeleted" className="text-sm text-muted-foreground cursor-pointer">
                          {t('pages.businessUnits.showSoftDeleted')}
                        </Label>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
                        {t('common.action.clearAllFilters')}
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {statusFilter.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === "true" ? t('common.status.active') : t('common.status.inactive')}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {showDeleted && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {t('common.action.showDeleted')}
                    <button onClick={handleShowDeletedToggle} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {t('common.action.clearAll')}
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}
            {!error && businessUnits.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Building2}
                emptyTitle={t('common.state.noBusinessUnitsYet')}
                emptyDescription={t('pages.businessUnits.emptyDescription')}
                addAction={
                  <Can permission="cluster.create">
                    <Button size="sm" onClick={() => navigate('/business-units/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.businessUnits.addBusinessUnit')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && businessUnits.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count
                  // (including the conditional Deleted column when showDeleted is on).
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.businessUnits.loading')}>
                    <div className="text-muted-foreground">{t('common.busy.loading')}</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={businessUnits}
                  serverSide
                  tableLayout="auto"
                  stickyLeftColumns={3}
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
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={t('pages.businessUnits.deleteTitle')}
        description={t('pages.businessUnits.deleteConfirm')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/business-units" data={rawResponse} />
    </Layout>
  );
};

export default BusinessUnitManagement;
