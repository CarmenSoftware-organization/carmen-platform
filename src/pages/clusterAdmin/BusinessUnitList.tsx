import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Filter, X, Building2, Download } from 'lucide-react';
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
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { parseApiError } from '../../utils/errorParser';
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

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/**
 * Business units scoped to a single administered cluster (the URL's :clusterId). A Management
 * page in the established pattern (see ClusterManagement.tsx), narrowed by cluster.
 */
const BusinessUnitList: React.FC = () => {
  const navigate = useNavigate();
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
      const { message } = parseApiError(err);
      setError(message);
      toast.error('Failed to load business units', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

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
    const csv = generateCSV(items, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'is_hq', label: 'HQ' },
      { key: 'is_active', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `business-units-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
      cell: ({ row }) => (
        <Link
          to={`/cluster-admin/${clusterId}/business-units/${row.original.id}/edit`}
          className="text-primary hover:underline whitespace-nowrap"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      meta: { card: 'title' },
      cell: ({ row }) => (
        <Link
          to={`/cluster-admin/${clusterId}/business-units/${row.original.id}/edit`}
          className="text-primary hover:underline whitespace-nowrap"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'is_hq',
      header: 'HQ',
      meta: { headerClassName: 'w-20', cellClassName: 'w-20' },
      cell: ({ row }) => (row.original.is_hq ? <Badge variant="secondary">HQ</Badge> : null),
      enableSorting: false,
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      meta: { headerClassName: 'w-32', cellClassName: 'w-32', card: 'badge' },
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
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground">
          {fmt(row.original.created_at)}
        </div>
      ),
    },
  ], [clusterId]);

  return (
    <ClusterAdminLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Business Units"
          subtitle="Manage the business units in this cluster"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button onClick={() => navigate(`/cluster-admin/${clusterId}/business-units/new`)}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Add Business Unit</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </>
          }
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search business units..."
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
                    <SheetDescription>Filter business units by status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStatusFilter}>Clear</Button>
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
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearStatusFilter}>
                        Clear All Filters
                      </Button>
                    )}
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
                <button onClick={handleClearStatusFilter} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
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
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading business units">
                    <div className="text-muted-foreground">Loading business units...</div>
                  </div>
                  <DataTable
                    columns={columns}
                    data={items}
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
                </div>
              ) : !loading && items.length === 0 ? (
                <ListEmptyState
                  searchTerm={searchTerm}
                  activeFilterCount={activeFilterCount}
                  icon={Building2}
                  emptyTitle="No business units yet"
                  emptyDescription="Get started by creating the first business unit in this cluster."
                  addAction={
                    <Button size="sm" onClick={() => navigate(`/cluster-admin/${clusterId}/business-units/new`)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Business Unit
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={items}
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
