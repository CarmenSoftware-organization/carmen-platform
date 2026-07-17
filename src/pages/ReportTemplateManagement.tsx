import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
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
  const storedSourceTypes = getStoredJSON<string[]>('filters_report_templates_source_type', []);
  const storedPage = Number(localStorage.getItem('page_report_templates')) || 1;
  const storedSort = localStorage.getItem('sort_report_templates') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string[]>(storedSourceTypes);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (filters: string[], sourceTypes: string[]) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) {
      where.is_active = filters[0] === 'true';
    }
    if (sourceTypes.length === 1) {
      where.source_type = sourceTypes[0];
    } else if (sourceTypes.length > 1) {
      where.source_type = { in: sourceTypes };
    }
    where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_report_templates')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, storedSourceTypes),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchTemplates = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const response: any = await reportTemplateService.getAll(params);
      setRawResponse(response);
      const inner = response.data?.data ?? response.data ?? response;
      const items = Array.isArray(inner) ? inner : (inner?.data ?? []);
      const pagInfo = inner?.paginate ?? response.data?.paginate ?? response.paginate;
      setTemplates(Array.isArray(items) ? items : []);
      setTotalRows(pagInfo?.total ?? items.length);
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
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next, sourceTypeFilter), filter: {} }));
  };

  const handleSourceTypeFilter = (type: string) => {
    const next = sourceTypeFilter.includes(type)
      ? sourceTypeFilter.filter((s) => s !== type)
      : [...sourceTypeFilter, type];
    setSourceTypeFilter(next);
    localStorage.setItem('filters_report_templates_source_type', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setSourceTypeFilter([]);
    localStorage.setItem('filters_report_templates', JSON.stringify([]));
    localStorage.setItem('filters_report_templates_source_type', JSON.stringify([]));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], []), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (sourceTypeFilter.length > 0 ? 1 : 0);

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
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/report-templates/${row.original.id}/edit`}
            className="text-primary hover:underline truncate max-w-[220px]"
            title={row.original.name}
          >
            {row.original.name}
          </Link>
        </div>
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
      accessorKey: 'source_type',
      header: 'Source',
      cell: ({ row }) => {
        const r = row.original as ReportTemplate & { view_name?: string };
        const t: string = r.source_type || (r.view_name ? 'view' : '-');
        const name = r.source_name || r.view_name || '';
        const variant: 'secondary' | 'default' | 'outline' =
          t === 'function' ? 'default' : t === 'procedure' ? 'secondary' : 'outline';
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant={variant} className="w-fit text-xs capitalize">
              {t}
            </Badge>
            {name && (
              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                {name}
              </span>
            )}
          </div>
        );
      },
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
            <Can permission="report_template.update">
              <DropdownMenuItem onClick={() => navigate(`/report-templates/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="report_template.delete">
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
        <PageHeader
          title="Report Templates"
          subtitle="Manage report templates with dialog (XML) and content (.frx to XML)"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || templates.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="report_template.create">
                <Button onClick={() => navigate('/report-templates/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Template</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
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
                placeholder="Search report templates..."
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
                    <SheetDescription>Filter report templates by status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Source Type</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(['view', 'function', 'procedure'] as const).map((t) => (
                          <Button
                            key={t}
                            variant={sourceTypeFilter.includes(t) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs capitalize"
                            onClick={() => handleSourceTypeFilter(t)}
                          >
                            {t}
                          </Button>
                        ))}
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
                  <Badge key={`status-${s}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === "true" ? "Active" : "Inactive"}
                    <button
                      onClick={() => handleStatusFilter(s)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={`Remove ${s === "true" ? "Active" : "Inactive"} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {sourceTypeFilter.map((t) => (
                  <Badge key={`source-${t}`} variant="secondary" className="text-xs gap-1 pr-1 capitalize">
                    {t}
                    <button
                      onClick={() => handleSourceTypeFilter(t)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={`Remove ${t} filter`}
                    >
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
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={FileText}
                emptyTitle="No report templates yet"
                emptyDescription="Get started by creating your first report template."
                addAction={
                  <Can permission="report_template.create">
                    <Button size="sm" onClick={() => navigate('/report-templates/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Template
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && templates.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
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

      <DevDebugSheet title="API Response" endpoint="GET /api-system/report-templates" data={rawResponse} />
    </Layout>
  );
};

export default ReportTemplateManagement;
