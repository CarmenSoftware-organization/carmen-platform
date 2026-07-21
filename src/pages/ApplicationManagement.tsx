import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { ApplicationRegistrySummary, summarizeApplications, type ApplicationSummaryData } from './applicationManagement/ApplicationRegistrySummary';
import applicationService from '../services/applicationService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, AppWindow, Download, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import type { Application, PaginateParams } from '../types';
import { DEVICE_OPTIONS } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

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

const ApplicationManagement: React.FC = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ApplicationSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const storedSearch = localStorage.getItem('search_applications') || '';
  const storedFilters = getStoredJSON<string[]>('filters_applications', []);
  const storedDevice = localStorage.getItem('devicefilter_applications') || '';
  const storedPage = Number(localStorage.getItem('page_applications')) || 1;
  const storedSort = localStorage.getItem('sort_applications') || 'name:asc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [deviceFilter, setDeviceFilter] = useState<string>(storedDevice);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const buildAdvance = (filters: string[], device: string) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) where.is_active = filters[0] === 'true';
    if (device) where.device = device;
    return Object.keys(where).length ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_applications')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, storedDevice),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchApplications = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await applicationService.getAll(params);
      setRawResponse(data);
      const raw = data.data || data;
      // Timestamps arrive nested under `audit`; flatten for the date columns
      // (tolerate the older flat shape too).
      const items: Application[] = (Array.isArray(raw) ? raw : []).map((item) => {
        const audit = (item as { audit?: { created?: { at?: string; name?: string }; updated?: { at?: string; name?: string } } }).audit;
        return {
          ...item,
          created_at: item.created_at ?? audit?.created?.at,
          created_by_name: item.created_by_name ?? audit?.created?.name,
          updated_at: item.updated_at ?? audit?.updated?.at,
          updated_by_name: item.updated_by_name ?? audit?.updated?.name,
        };
      });
      setApplications(items);
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

  // Registry band: roll up the whole registry (all statuses, ignoring filters) so
  // the scope split and device mix reflect reality, not the current view.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await applicationService.getAll({ perpage: -1 });
      const raw = data.data || data;
      setSummary(summarizeApplications(Array.isArray(raw) ? (raw as Parameters<typeof summarizeApplications>[0]) : []));
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
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next, deviceFilter), filter: {} }));
  };

  const handleDeviceFilterChange = (next: string) => {
    setDeviceFilter(next);
    if (next) localStorage.setItem('devicefilter_applications', next);
    else localStorage.removeItem('devicefilter_applications');
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_applications', JSON.stringify([]));
    setDeviceFilter('');
    localStorage.removeItem('devicefilter_applications');
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], ''), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (deviceFilter ? 1 : 0);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_applications', sort);
    localStorage.setItem('page_applications', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleCopyId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
      toast.success('App ID copied');
    } catch {
      toast.error('Could not copy App ID');
    }
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await applicationService.delete(deleteId);
      toast.success('Application deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to delete application', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(
      applications.map((a) => ({
        name: a.name,
        app_id: a.id,
        description: a.description ?? '',
        access: a.allow_all ? 'All APIs' : String(a.api_names?.length ?? 0) + ' APIs',
        is_active: a.is_active ? 'Active' : 'Inactive',
      })),
      [
        { key: 'name', label: 'Name' },
        { key: 'app_id', label: 'App ID' },
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
        <div className="flex flex-col gap-0.5">
          <Link
            to={`/applications/${row.original.id}/edit`}
            className="text-primary hover:underline whitespace-nowrap"
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
      id: 'app_id',
      header: 'App ID',
      enableSorting: false,
      cell: ({ row }) => {
        const id = row.original.id;
        const copied = copiedId === id;
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs text-muted-foreground truncate min-w-0" title={id}>
              {id}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-auto w-auto shrink-0 -m-2 p-2 text-muted-foreground hover:text-foreground"
              aria-label={copied ? 'App ID copied' : 'Copy App ID'}
              onClick={() => handleCopyId(id)}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        );
      },
    },
    {
      id: 'access',
      header: 'Access',
      enableSorting: false,
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        row.original.allow_all
          ? <Badge variant="outline">All APIs</Badge>
          : <Badge variant="outline">{row.original.api_names?.length ?? 0} APIs</Badge>
      ),
    },
    {
      accessorKey: 'device',
      header: 'Device',
      cell: ({ row }) => <Badge variant="secondary">{row.original.device || 'web'}</Badge>,
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
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="application.update">
              <DropdownMenuItem onClick={() => navigate(`/applications/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="application.delete">
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, handleCopyId, copiedId]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Application Management"
          subtitle="Manage applications and their API access"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || applications.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="application.create">
                <Button onClick={() => navigate('/applications/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Application</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
            </>
          }
        />

        <ApplicationRegistrySummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search applications..."
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
                    <SheetDescription>Filter applications by status and device</SheetDescription>
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
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Device</span>
                      <select
                        value={deviceFilter}
                        onChange={(e) => handleDeviceFilterChange(e.target.value)}
                        className={selectClassName}
                      >
                        <option value="">All devices</option>
                        {DEVICE_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
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
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={AppWindow}
                emptyTitle="No applications yet"
                emptyDescription="Get started by creating your first application."
                addAction={
                  <Can permission="application.create">
                    <Button size="sm" onClick={() => navigate('/applications/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Application
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && applications.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
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
                      tableLayout="auto"
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

      <DevDebugSheet title="API Response" endpoint="GET /api-system/applications" data={rawResponse} />
    </Layout>
  );
};

export default ApplicationManagement;
