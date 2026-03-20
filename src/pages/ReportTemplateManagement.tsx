import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal, Copy, Check, Filter, X, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import type { PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const ReportTemplateManagement: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_report_templates') || '';
  const storedFilters = getStoredJSON<string[]>('filters_report_templates', []);
  const storedPage = Number(localStorage.getItem('page_report_templates')) || 1;
  const storedSort = localStorage.getItem('sort_report_templates') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (filters: string[]) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) {
      where.is_active = filters[0] === 'true';
    }
    where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_report_templates')) || 10,
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

  const fetchTemplates = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await reportTemplateService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      const mapped = Array.isArray(items) ? items : [];
      setTemplates(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? mapped.length);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load report templates: ' + getErrorDetail(err));
      devLog('Error fetching report templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates(paginate);
  }, [fetchTemplates, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_report_templates', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_report_templates', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_report_templates', String(perpage));
    localStorage.setItem('page_report_templates', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_report_templates', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    const advance = buildAdvance(next);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_report_templates', JSON.stringify([]));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_report_templates', sort);
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await reportTemplateService.delete(deleteId);
      toast.success('Report template deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete report template', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(templates, [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'report_group', label: 'Report Group' },
      { key: 'is_standard', label: 'Standard' },
      { key: 'is_active', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `report-templates-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<ReportTemplate, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate(`/report-templates/${row.original.id}/edit`)}>
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'report_group',
      header: 'Report Group',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.report_group}</Badge>
      ),
    },
    {
      accessorKey: 'is_standard',
      header: 'Standard',
      cell: ({ row }) => (
        <Badge variant={row.original.is_standard ? 'default' : 'secondary'}>
          {row.original.is_standard ? 'Standard' : 'Custom'}
        </Badge>
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
        const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-muted-foreground">
            <div>{fmt(d.created_at)}</div>
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
          <div className="text-[11px] leading-tight text-muted-foreground">
            <div>{fmt(d.updated_at)}</div>
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
            <DropdownMenuItem onClick={() => navigate(`/report-templates/${row.original.id}/edit`)} className="cursor-pointer">
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Report Templates</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage report templates with dialog (XML) and content (.frx to XML)</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || templates.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate('/report-templates/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Template
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
                  placeholder="Search report templates..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search report templates"
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
                    <SheetDescription>Filter report templates by status</SheetDescription>
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
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && templates.length === 0 && !loading ? (
              <EmptyState
                icon={FileText}
                title="No report templates yet"
                description={searchTerm ? `No report templates matching "${searchTerm}"` : "Get started by creating your first report template."}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/report-templates/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Template
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && templates.length === 0 ? (
                  <TableSkeleton columns={8} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading report templates">
                    <div className="text-muted-foreground">Loading report templates...</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={templates}
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
        title="Delete Report Template"
        description="Are you sure you want to delete this report template? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {process.env.NODE_ENV === 'development' && !!rawResponse && (
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
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/report-template
              </SheetDescription>
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

export default ReportTemplateManagement;
