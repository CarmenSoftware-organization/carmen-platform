import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Filter, X, Building2, Download } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { DataTable } from '../../components/ui/data-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../../components/ui/sheet';
import { SearchInput } from '../../components/SearchInput';
import { ListEmptyState } from '../../components/ListEmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import businessUnitService from '../../services/businessUnitService';
import clusterService from '../../services/clusterService';
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { parseApiError } from '../../utils/errorParser';
import { rankBusinessUnits, countOverLimit } from '../../utils/businessUnitRank';
import { auditColumns } from '../../components/auditColumns';
import { normalizeAudit, auditCsvFields } from '../../utils/audit';
import { useI18n } from '../../hooks/useI18n';
import type { BusinessUnit, PaginateParams } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Business units scoped to a single administered cluster (the URL's :clusterId). A Management
 * page in the established pattern (see ClusterManagement.tsx), narrowed by cluster.
 */
const BusinessUnitList: React.FC = () => {
  const { t } = useI18n();
  const { clusterId } = useParams<{ clusterId: string }>();

  const [items, setItems] = useState<BusinessUnit[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessLost, setAccessLost] = useState(false);

  const storedSearch = localStorage.getItem('search_ca_business_units') || '';
  const storedFilters = getStoredJSON<string[]>('filters_ca_business_units', []);
  const storedPage = Number(localStorage.getItem('page_ca_business_units')) || 1;
  const storedSort = localStorage.getItem('sort_ca_business_units') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // Quota/rank data, fetched independently of the paginated table above. The "Over limit" badge
  // needs to rank EVERY business unit in the cluster (see rankBusinessUnits), not just the
  // current page, so this is a second, unpaginated fetch — same pattern as a summary band. It
  // fails open: if either call fails, buCap stays null and the badge/banner simply don't render,
  // same convention as CapacityMeter's "null cap = unknown/unenforced".
  const [buCap, setBuCap] = useState<number | null>(null);
  const [rankSource, setRankSource] = useState<BusinessUnit[]>([]);

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    (async () => {
      try {
        const [clusterRes, buRes] = await Promise.all([
          clusterService.getById(clusterId),
          businessUnitService.getAll({
            perpage: -1,
            advance: JSON.stringify({ where: { cluster_id: clusterId } }),
          }),
        ]);
        if (cancelled) return;
        const cluster = clusterRes?.data || clusterRes;
        setBuCap(cluster?.bu_cap ?? 0);
        const list = buRes?.data || buRes;
        setRankSource(Array.isArray(list) ? list : []);
      } catch {
        // Fail open — quota display is a courtesy, not a gate. The real 403 still comes from
        // the backend either way.
        if (!cancelled) { setBuCap(null); setRankSource([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [clusterId]);

  const ranked = useMemo(() => rankBusinessUnits(rankSource), [rankSource]);
  const overLimitCount = useMemo(() => countOverLimit(ranked, buCap), [ranked, buCap]);

  // Sent even though the server already scopes the caller to their administered clusters: an
  // admin of two clusters must see only the one this URL names, which is strictly narrower.
  const buildAdvance = (): string => {
    const where: Record<string, unknown> = { cluster_id: clusterId };
    if (statusFilter.length === 1) where.is_active = statusFilter[0] === 'true';
    return JSON.stringify({ where });
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_ca_business_units')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(),
    filter: {},
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchBusinessUnits = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await businessUnitService.getAll(params);
      setRawResponse(data);
      const list = data.data || data;
      const mapped = Array.isArray(list) ? list : [];
      setItems(mapped);
      setTotalRows(data.paginate?.total ?? (data as { total?: number }).total ?? mapped.length);
      setError('');
      setAccessLost(false);
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setError('');
        setAccessLost(true);
        return;
      }
      const { message } = parseApiError(err, t);
      setError(message);
      toast.error(t('common.state.failedToLoadBusinessUnits'), { description: message });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchBusinessUnits(paginate);
  }, [fetchBusinessUnits, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_ca_business_units', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_ca_business_units', '1');
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_ca_business_units', String(perpage));
    localStorage.setItem('page_ca_business_units', String(page));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_ca_business_units', JSON.stringify(next));
    localStorage.setItem('page_ca_business_units', '1');
    const where: Record<string, unknown> = { cluster_id: clusterId };
    if (next.length === 1) where.is_active = next[0] === 'true';
    setPaginate((prev) => ({ ...prev, page: 1, advance: JSON.stringify({ where }), filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_ca_business_units', JSON.stringify([]));
    localStorage.setItem('page_ca_business_units', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: JSON.stringify({ where: { cluster_id: clusterId } }), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_ca_business_units', sort);
    localStorage.setItem('page_ca_business_units', '1');
    setPaginate((prev) => ({ ...prev, sort, page: 1 }));
  };

  const handleExport = () => {
    // generateCSV reads each column's raw field off the row object with no per-column
    // formatter — is_hq/is_active never pass through the Badge that renders them in the
    // table, so without this mapping the file gets the raw JS booleans stringified
    // ("true"/"false") instead of the translated words the table shows. Map both to their
    // rendered text here, before generateCSV ever sees the row (same shape as
    // SubscriptionTable.tsx's `state: stateLabel(item.state)` / PurchaseLicenseTable.tsx's
    // `status: statusLabel(o.status)`).
    const rows = items.map((bu) => ({
      ...bu,
      ...auditCsvFields(normalizeAudit(bu)),
      is_hq: bu.is_hq ? t('pages.clusterAdmin.hq') : '',
      is_active: bu.is_active ? t('common.status.active') : t('common.status.inactive'),
    }));
    const csv = generateCSV(rows, [
      { key: 'name', label: t('common.field.name') },
      { key: 'is_hq', label: t('pages.clusterAdmin.hq') },
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
    // auditColumns.tsx hardcodes header: 'Created' as an English literal (shared by ~15
    // pages; rewriting it to take `t` is the shared-infrastructure pass, not this slice —
    // see broadcastColumns.tsx's own note). Override both headers here so this table's
    // Thai header row has no English hole.
    const [createdColumn, updatedColumn] = auditColumns<BusinessUnit>();
    return [
      {
        accessorKey: 'name',
        header: t('common.field.name'),
        meta: { card: 'title' },
        cell: ({ row }) => {
          const rank = ranked.get(row.original.id);
          const overLimit = buCap != null && (rank ?? 0) > buCap;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/cluster-admin/${clusterId}/business-units/${row.original.id}/edit`}
                className="text-primary hover:underline whitespace-nowrap"
              >
                {row.original.name}
              </Link>
              {overLimit && (
                // Byte-identical to pages.licenses.overLimitBadge/overLimitTitle (slice 3b) —
                // reused directly rather than duplicated, see the pages.clusterAdmin.
                // overLimitCountOne/Many comment in en.ts for why the banner sentence below
                // could NOT also be reused this way.
                <Badge
                  variant="destructive"
                  className="text-xs"
                  title={t('pages.licenses.overLimitTitle', { cap: buCap ?? 0, rank: rank ?? 0 })}
                >
                  {t('pages.licenses.overLimitBadge')}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'is_hq',
        header: t('pages.clusterAdmin.hq'),
        meta: { headerClassName: 'w-20', cellClassName: 'w-20' },
        cell: ({ row }) => (row.original.is_hq ? <Badge variant="secondary">{t('pages.clusterAdmin.hq')}</Badge> : null),
        enableSorting: false,
      },
      {
        accessorKey: 'is_active',
        header: t('common.status.label'),
        meta: { headerClassName: 'w-32', cellClassName: 'w-32', card: 'badge' },
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
            {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
          </Badge>
        ),
      },
      { ...createdColumn, header: t('common.audit.created') },
      { ...updatedColumn, header: t('common.audit.updatedDate') },
    ];
  }, [t, clusterId, ranked, buCap]);

  return (
    <ClusterAdminLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('common.label.businessUnitsTitle')}
          subtitle={t('pages.clusterAdmin.businessUnitListSubtitle')}
          actions={
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t('common.action.export')}
            </Button>
          }
        />

        {overLimitCount > 0 && (
          <p className="text-destructive text-sm" role="alert">
            {t(
              overLimitCount === 1 ? 'pages.clusterAdmin.overLimitCountOne' : 'pages.clusterAdmin.overLimitCountMany',
              { count: overLimitCount, cap: buCap ?? 0 },
            )}
          </p>
        )}

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
                    <SheetDescription>{t('pages.clusterAdmin.filterBusinessUnitsByStatus')}</SheetDescription>
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
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearStatusFilter}>
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
                    {s === 'true' ? t('common.status.active') : t('common.status.inactive')}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearStatusFilter} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {t('common.action.clearAll')}
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && (
              accessLost ? (
                <ClusterAccessLost />
              ) : loading && items.length === 0 ? (
                // +1 accounts for the `#` row-index column DataTable always prepends, so the
                // skeleton matches the loaded table's actual header count.
                <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
              ) : loading && items.length > 0 ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.clusterAdmin.loadingBusinessUnitsAria')}>
                    <div className="text-muted-foreground">{t('common.state.loadingBusinessUnits')}</div>
                  </div>
                  <DataTable
                    columns={columns}
                    data={items}
                    serverSide
                    tableLayout="auto"
                    stickyLeftColumns={2}
                    totalRows={totalRows}
                    page={paginate.page}
                    perpage={paginate.perpage}
                    onPaginateChange={handlePaginateChange}
                    onSortChange={handleSortChange}
                    defaultSort={{ id: 'created_at', desc: true }}
                  />
                </div>
              ) : !loading && items.length === 0 ? (
                <ListEmptyState
                  searchTerm={searchTerm}
                  activeFilterCount={activeFilterCount}
                  icon={Building2}
                  emptyTitle={t('common.state.noBusinessUnitsYet')}
                  emptyDescription={t('pages.clusterAdmin.noBusinessUnitsDescription')}
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={items}
                  serverSide
                  tableLayout="auto"
                  stickyLeftColumns={2}
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={handleSortChange}
                  defaultSort={{ id: 'created_at', desc: true }}
                />
              )
            )}
          </CardContent>
        </Card>
      </div>

      <DevDebugSheet title="API Response" endpoint="GET /api-system/business-units" data={rawResponse} />
    </ClusterAdminLayout>
  );
};

export default BusinessUnitList;
