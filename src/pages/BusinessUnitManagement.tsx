import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import businessUnitService from '../services/businessUnitService';
import { getErrorDetail } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Building2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { BuSummary, summarizeBus, type BuSummaryData } from './businessUnitManagement/BuSummary';
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
      // Audit moved into a nested `audit` object; flatten for the date columns
      // (tolerate the older flat shape too).
      const mapped = (Array.isArray(items) ? items : []).map((item: any) => ({
        ...item,
        created_at: item.created_at ?? item.audit?.created?.at,
        created_by_name: item.created_by_name ?? item.audit?.created?.name,
        updated_at: item.updated_at ?? item.audit?.updated?.at,
        updated_by_name: item.updated_by_name ?? item.audit?.updated?.name,
        deleted_at: item.deleted_at ?? item.audit?.deleted?.at,
        deleted_by_name: item.deleted_by_name ?? item.audit?.deleted?.name,
      }));
      setBusinessUnits(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      setError('Failed to load business units: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinessUnits(paginate);
  }, [fetchBusinessUnits, paginate]);

  // Summary strip: roll up the whole set (not just the current page). Business
  // units are few enough that a single full-list read + a deleted-count read is cheap.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [allRes, deletedRes] = await Promise.all([
        businessUnitService.getAll({ perpage: -1, advance: JSON.stringify({ where: { deleted_at: null } }) }),
        businessUnitService.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { deleted_at: { not: null } } }) }),
      ]);
      const items = ((allRes as { data?: unknown }).data ?? allRes) as Parameters<typeof summarizeBus>[0];
      const list = Array.isArray(items) ? items : [];
      const deleted = deletedRes as { paginate?: { total?: number }; total?: number };
      const archived = deleted.paginate?.total ?? deleted.total ?? 0;
      setSummary(summarizeBus(list, archived));
    } catch {
      setSummary(null); // strip falls back to its skeleton; the table still works
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
      toast.success('Business unit deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to delete business unit', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(businessUnits, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'alias_name', label: 'Alias Name' },
      { key: 'cluster_name', label: 'Cluster' },
      { key: 'is_active', label: 'Status' },
      { key: 'max_license_users', label: 'Max Licensed Users' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `business-units-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline">
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
      accessorKey: 'alias_name',
      header: 'Alias',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.alias_name || '-'}</span>
      ),
    },
    { accessorKey: 'cluster_name', id: 'tb_cluster.name', header: 'Cluster' },
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
      cell: ({ row }: { row: { original: BusinessUnit } }) => {
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
    } as ColumnDef<BusinessUnit, unknown>] : []),
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
            <Can permission="cluster.update" clusterId={row.original.cluster_id}>
              <DropdownMenuItem onClick={() => navigate(`/business-units/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="cluster.delete" clusterId={row.original.cluster_id}>
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
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Business Unit Management"
          subtitle="Manage business units and departments"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || businessUnits.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="cluster.create">
                <Button onClick={() => navigate('/business-units/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Business Unit</span>
                  <span className="sm:hidden">Add BU</span>
                </Button>
              </Can>
            </>
          }
        />

        <BuSummary summary={summary} loading={summaryLoading} />

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
                          Show soft-deleted business units
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
            {!error && businessUnits.length === 0 && !loading ? (
              <EmptyState
                icon={Building2}
                title="No business units yet"
                description={searchTerm ? `No business units matching "${searchTerm}"` : "Get started by creating your first business unit."}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/business-units/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Business Unit
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && businessUnits.length === 0 ? (
                  <TableSkeleton columns={7} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading business units">
                    <div className="text-muted-foreground">Loading...</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={businessUnits}
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
        title="Delete Business Unit"
        description="Are you sure you want to delete this business unit? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/business-units" data={rawResponse} />
    </Layout>
  );
};

export default BusinessUnitManagement;
