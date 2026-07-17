import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import clusterService from '../services/clusterService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Network, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { FleetCapacity } from './clusterManagement/FleetCapacity';
import { CapacityMeter } from './clusterManagement/CapacityMeter';
import { summarizeFleet, type FleetSummary } from '../utils/capacity';
import type { Cluster, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const ClusterManagement: React.FC = () => {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_clusters') || '';
  const storedFilters = getStoredJSON<string[]>('filters_clusters', []);
  const storedPage = Number(localStorage.getItem('page_clusters')) || 1;
  const storedSort = localStorage.getItem('sort_clusters') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showDeleted, setShowDeleted] = useState<boolean>(getStoredJSON<boolean>('filter_clusters_deleted', false));
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);

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
    perpage: Number(localStorage.getItem("perpage_clusters")) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, getStoredJSON<boolean>('filter_clusters_deleted', false)),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Latest clusters, so the (stable) delete handler can read bu_count without
  // re-memoising the columns each fetch.
  const clustersRef = useRef(clusters);
  useEffect(() => {
    clustersRef.current = clusters;
  }, [clusters]);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchClusters = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await clusterService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      const mapped = (Array.isArray(items) ? items : []).map((item: any) => ({
        ...item,
        bu_count: item.bu_count ?? item._count?.tb_business_unit ?? 0,
        users_count: item.users_count ?? item._count?.tb_cluster_user ?? 0,
        max_license_bu: item.max_license_bu ?? undefined,
        total_max_license_users: item.total_max_license_users ?? undefined,
        // Audit moved into a nested `audit` object; flatten for the date columns
        // (tolerate the older flat shape too).
        created_at: item.created_at ?? item.audit?.created?.at,
        created_by_name: item.created_by_name ?? item.audit?.created?.name,
        updated_at: item.updated_at ?? item.audit?.updated?.at,
        updated_by_name: item.updated_by_name ?? item.audit?.updated?.name,
        deleted_at: item.deleted_at ?? item.audit?.deleted?.at,
        deleted_by_name: item.deleted_by_name ?? item.audit?.deleted?.name,
      }));
      setClusters(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? mapped.length);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load clusters: ' + getErrorDetail(err));
      devLog('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters(paginate);
  }, [fetchClusters, paginate]);

  // Fleet-capacity strip: summarise the whole (non-deleted) set, not just the
  // current page. Clusters are few, so a single full-list read is cheap.
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const data = await clusterService.getAll({
        perpage: -1,
        advance: JSON.stringify({ where: { deleted_at: null } }),
      });
      const items = ((data as { data?: unknown }).data ?? data) as Record<string, unknown>[];
      const mapped = (Array.isArray(items) ? items : []).map((item) => ({
        is_active: item.is_active as boolean | undefined,
        bu_count: (item.bu_count ?? (item._count as { tb_business_unit?: number })?.tb_business_unit ?? 0) as number,
        max_license_bu: item.max_license_bu as number | null | undefined,
        users_count: (item.users_count ?? (item._count as { tb_cluster_user?: number })?.tb_cluster_user ?? 0) as number,
        total_max_license_users: item.total_max_license_users as number | null | undefined,
      }));
      setFleet(summarizeFleet(mapped));
    } catch {
      setFleet(null); // strip falls back to its skeleton; the table still works
    } finally {
      setFleetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_clusters', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_clusters', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_clusters", String(perpage));
    localStorage.setItem('page_clusters', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_clusters', JSON.stringify(next));
    localStorage.setItem('page_clusters', '1');
    const advance = buildAdvance(next, showDeleted);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleShowDeletedToggle = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    localStorage.setItem('filter_clusters_deleted', JSON.stringify(next));
    localStorage.setItem('page_clusters', '1');
    const advance = buildAdvance(statusFilter, next);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_clusters', JSON.stringify([]));
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], showDeleted), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setShowDeleted(false);
    localStorage.setItem('filters_clusters', JSON.stringify([]));
    localStorage.setItem('filter_clusters_deleted', JSON.stringify(false));
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], false), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (showDeleted ? 1 : 0);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_clusters', sort);
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    // Guard: deleting a cluster does not cascade to its business units on the
    // backend, so a cluster with BUs would orphan them (they'd keep pointing at
    // a soft-deleted cluster). Block it here until the backend cascades/reassigns.
    const cluster = clustersRef.current.find((c) => c.id === id);
    const buCount = cluster?.bu_count ?? 0;
    if (buCount > 0) {
      toast.error(`Can't delete ${cluster?.name || 'this cluster'}`, {
        description: `It still has ${buCount} business unit${buCount > 1 ? 's' : ''}. Delete or move them to another cluster first.`,
      });
      return;
    }
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await clusterService.delete(deleteId);
      toast.success('Cluster deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadFleet();
    } catch (err: unknown) {
      toast.error('Failed to delete cluster', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(clusters, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'alias_name', label: 'Alias' },
      { key: 'is_active', label: 'Status' },
      { key: 'max_license_bu', label: 'Max Licensed BUs' },
      { key: 'users_count', label: 'Users' },
      { key: 'total_max_license_users', label: 'Max Licensed Users' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `clusters-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <Link to={`/clusters/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link to={`/clusters/${row.original.id}/edit`} className="text-primary hover:underline">
            {row.original.name}
          </Link>
          {row.original.deleted_at && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0" title={row.original.deleted_by_name ? `Deleted by ${row.original.deleted_by_name}` : undefined}>
              Deleted
            </Badge>
          )}
        </div>
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
      id: 'bu_count',
      header: 'Business units',
      cell: ({ row }) => (
        <CapacityMeter used={row.original.bu_count} cap={row.original.max_license_bu} />
      ),
      enableSorting: false,
    },
    {
      id: 'user_count',
      header: 'Users',
      // `total_max_license_users` = backend aggregate of per-BU caps; 0 / null / absent = no cap.
      cell: ({ row }) => (
        <CapacityMeter used={row.original.users_count} cap={row.original.total_max_license_users} />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: 'Created',
      cell: ({ row }) => {
        const d = row.original;
        const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(d.created_at)}</div>
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
        if (d.updated_at === d.created_at) return null;
        const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(d.updated_at)}</div>
            {d.updated_by_name && <div>{d.updated_by_name}</div>}
          </div>
        );
      },
    },
    ...(showDeleted ? [{
      id: 'deleted_at',
      header: 'Deleted',
      cell: ({ row }: { row: { original: Cluster } }) => {
        const d = row.original;
        if (!d.deleted_at) return <span className="text-muted-foreground">-</span>;
        const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-destructive space-y-0.5">
            <div>{fmt(d.deleted_at)}</div>
            {d.deleted_by_name && <div>{d.deleted_by_name}</div>}
          </div>
        );
      },
      enableSorting: false,
    } as ColumnDef<Cluster, unknown>] : []),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-20', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.name || row.original.code}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="cluster.update" clusterId={row.original.id}>
              <DropdownMenuItem onClick={() => navigate(`/clusters/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="cluster.delete" clusterId={row.original.id}>
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, showDeleted]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Cluster Management"
          subtitle="Manage and configure clusters"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || clusters.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="cluster.create">
                <Button onClick={() => navigate('/clusters/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Cluster</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
            </>
          }
        />

        <FleetCapacity summary={fleet} loading={fleetLoading} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search clusters..."
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
                    <SheetDescription>Filter clusters by status</SheetDescription>
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
                          variant={statusFilter.includes("true") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("true")}
                        >
                          Active
                        </Button>
                        <Button
                          variant={statusFilter.includes("false") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("false")}
                        >
                          Inactive
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-sm font-medium">Deleted</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showDeleted"
                          checked={showDeleted}
                          onChange={handleShowDeletedToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor="showDeleted" className="text-sm text-muted-foreground cursor-pointer">
                          Show soft-deleted clusters
                        </label>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
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
                    {s === "true" ? "Active" : "Inactive"}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {showDeleted && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    Show Deleted
                    <button onClick={handleShowDeletedToggle} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && clusters.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Network}
                emptyTitle="No clusters yet"
                emptyDescription="Get started by creating your first cluster to organize business units."
                addAction={
                  <Can permission="cluster.create">
                    <Button size="sm" onClick={() => navigate('/clusters/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Cluster
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && clusters.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count
                  // (including the conditional Deleted column when showDeleted is on).
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading clusters">
                    <div className="text-muted-foreground">Loading clusters...</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={clusters}
                  serverSide
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
        title="Delete Cluster"
        description="Are you sure you want to delete this cluster? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/clusters" data={rawResponse} />
    </Layout>
  );
};

export default ClusterManagement;
