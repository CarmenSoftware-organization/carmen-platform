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
import Can from '../components/Can';
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
        <Link to={`/applications/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'app_id',
      header: 'App ID',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-[10px] sm:text-xs text-muted-foreground" title={row.original.id}>
          {row.original.id}
        </span>
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
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        row.original.allow_all
          ? <Badge variant="outline">All APIs</Badge>
          : <Badge variant="outline">{row.original.api_names?.length ?? 0} APIs</Badge>
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
            <Can permission="application.create">
              <Button onClick={() => navigate('/applications/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Add Application
              </Button>
            </Can>
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
                  <TableSkeleton columns={7} rows={paginate.perpage || 5} />
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
