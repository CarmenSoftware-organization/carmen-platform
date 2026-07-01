import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import newsService from '../services/newsService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal, Copy, Check, Filter, X, Download, Newspaper, Globe, Building2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import Can from '../components/Can';
import type { News, NewsStatus, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const STATUS_OPTIONS: NewsStatus[] = ['draft', 'published', 'archived'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s?: NewsStatus): 'success' | 'secondary' | 'outline' =>
  s === 'published' ? 'success' : s === 'archived' ? 'outline' : 'secondary';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const buildAdvance = (statuses: string[]) =>
  statuses.length > 0 ? JSON.stringify({ where: { status: { in: statuses } } }) : '';

const NewsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [newsItems, setNewsItems] = useState<News[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_news') || '';
  const storedFilters = getStoredJSON<string[]>('filters_news', []);
  const storedPage = Number(localStorage.getItem('page_news')) || 1;
  const storedSort = localStorage.getItem('sort_news') || 'published_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_news')) || 10,
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

  const fetchNews = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await newsService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      const list = Array.isArray(items) ? (items as News[]) : [];
      setNewsItems(list);
      setTotalRows(data.paginate?.total ?? data.total ?? list.length);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load news: ' + getErrorDetail(err));
      devLog('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(paginate);
  }, [fetchNews, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_news', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_news', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_news', String(perpage));
    localStorage.setItem('page_news', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_news', JSON.stringify(next));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_news', JSON.stringify([]));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_news', sort);
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await newsService.delete(deleteId);
      toast.success('News deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete news', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(newsItems, [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'url', label: 'URL' },
      { key: 'published_at', label: 'Published' },
    ]);
    downloadCSV(csv, `news-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<News, unknown>[]>(() => [
    {
      id: 'image',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-28', cellClassName: '' },
      cell: ({ row }) => {
        // List payload exposes the presigned URL as `image_url`; tolerate `image` too.
        const src = row.original.image_url || row.original.image;
        return src ? (
          <img
            src={src}
            alt=""
            className="h-10 w-auto max-w-[96px] rounded object-contain border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded border bg-muted/40 text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        );
      },
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <Link to={`/news/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.title || '(untitled)'}
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {cap(row.original.status || 'draft')}
        </Badge>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      enableSorting: false,
      cell: ({ row }) => {
        const ids = row.original.business_unit_ids;
        if (ids && ids.length > 0) {
          return (
            <span className="inline-flex items-center gap-1 text-xs">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {ids.length} BU{ids.length > 1 ? 's' : ''}
            </span>
          );
        }
        return (
          <Badge variant="outline" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            Global
          </Badge>
        );
      },
    },
    {
      accessorKey: 'published_at',
      id: 'published_at',
      header: 'Published',
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">{fmt(row.original.published_at)}</span>
      ),
    },
    {
      id: 'updated_at',
      header: 'Updated',
      enableSorting: false,
      cell: ({ row }) => {
        const a = row.original.audit?.updated;
        if (!a?.at) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(a.at)}</div>
            {a.name && <div>{a.name}</div>}
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
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.title}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="news.update">
              <DropdownMenuItem onClick={() => navigate(`/news/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            </Can>
            <Can permission="news.delete">
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">News Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage announcements and news articles</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || newsItems.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Can permission="news.create">
              <Button onClick={() => navigate('/news/new')}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Add News</span>
                <span className="sm:hidden">Add</span>
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
                  placeholder="Search news..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search news"
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
                    <SheetDescription>Filter news by status</SheetDescription>
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
                        {STATUS_OPTIONS.map((s) => (
                          <Button
                            key={s}
                            variant={statusFilter.includes(s) ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleStatusFilter(s)}
                          >
                            {cap(s)}
                          </Button>
                        ))}
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
                    {cap(s)}
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

            {!error && newsItems.length === 0 && !loading ? (
              <EmptyState
                icon={Newspaper}
                title="No news yet"
                description={searchTerm ? `No news matching "${searchTerm}"` : 'Get started by creating your first news article.'}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/news/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add News
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && newsItems.length === 0 ? (
                  <TableSkeleton columns={7} rows={paginate.perpage || 5} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading news">
                        <div className="text-muted-foreground">Loading news...</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={newsItems}
                      serverSide
                      totalRows={totalRows}
                      page={paginate.page}
                      perpage={paginate.perpage}
                      onPaginateChange={handlePaginateChange}
                      onSortChange={handleSortChange}
                      defaultSort={{ id: 'published_at', desc: true }}
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
        title="Delete News"
        description="Are you sure you want to delete this news article? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

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
              <SheetDescription className="text-xs sm:text-sm">GET /api/news</SheetDescription>
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

export default NewsManagement;
