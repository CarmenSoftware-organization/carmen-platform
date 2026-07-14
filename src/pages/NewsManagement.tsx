import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { NewsroomSummary, summarizeNews, type NewsSummaryData } from './newsManagement/NewsroomSummary';
import newsService from '../services/newsService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Download, Newspaper, Globe, Building2, Loader2, Archive, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { getDocVersion } from '../utils/docVersion';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
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

export const buildAdvance = (statuses: string[], tags: string[]): string => {
  const where: Record<string, unknown> = {};
  if (statuses.length > 0) where.status = { in: statuses };
  if (tags.length > 0) where.OR = tags.map((t) => ({ tags: { array_contains: [t] } }));
  return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
};

type BulkMode = 'delete' | 'archive' | 'publish';

const BULK_ACTIONS: Record<BulkMode, {
  title: string;        // verb used in "{title} N News Article(s)" and the confirm button
  past: string;         // toast success verb, e.g. 'Deleted'
  base: string;         // toast failure verb, e.g. 'delete'
  busy: string;         // in-flight button label, e.g. 'Deleting...'
  icon: LucideIcon;
  destructive: boolean; // destructive styling (delete only)
  status?: NewsStatus;  // status to set for update-based actions; absent ⇒ delete
  description: (n: number) => string;
}> = {
  delete: {
    title: 'Delete', past: 'Deleted', base: 'delete', busy: 'Deleting...',
    icon: Trash2, destructive: true,
    description: (n) => `This will delete ${n} selected news article(s). This action cannot be undone.`,
  },
  archive: {
    title: 'Archive', past: 'Archived', base: 'archive', busy: 'Archiving...',
    icon: Archive, destructive: false, status: 'archived',
    description: (n) => `This will archive ${n} selected news article(s). They can be un-archived later by editing each article.`,
  },
  publish: {
    title: 'Publish', past: 'Published', base: 'publish', busy: 'Publishing...',
    icon: Send, destructive: false, status: 'published',
    description: (n) => `This will publish ${n} selected news article(s), making them visible to readers.`,
  },
};

const NewsManagement: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('news.delete');
  const canUpdate = hasPermission('news.update');
  const canSelect = canDelete || canUpdate;
  const [newsItems, setNewsItems] = useState<News[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<NewsSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const storedSearch = localStorage.getItem('search_news') || '';
  const storedFilters = getStoredJSON<string[]>('filters_news', []);
  const storedPage = Number(localStorage.getItem('page_news')) || 1;
  const storedSort = localStorage.getItem('sort_news') || 'published_at:desc';
  const storedTags = getStoredJSON<string[]>('tagfilters_news', []);

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [tagFilter, setTagFilter] = useState<string[]>(storedTags);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_news')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, storedTags),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<News[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>('delete');
  const [bulkCode, setBulkCode] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

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

  useEffect(() => {
    newsService.getTags().then(setTagOptions).catch(() => setTagOptions([]));
  }, []);

  // Newsroom masthead: roll up the whole desk (all statuses, ignoring the active
  // filters) so the pipeline counts and lead story reflect reality, not the view.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await newsService.getAll({ perpage: -1, sort: 'published_at:desc' });
      const items = data.data || data;
      setSummary(summarizeNews(Array.isArray(items) ? (items as Parameters<typeof summarizeNews>[0]) : []));
    } catch {
      setSummary(null); // masthead falls back to its skeleton; the table still works
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

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
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next, tagFilter), filter: {} }));
  };

  const handleTagFilter = (tag: string) => {
    const next = tagFilter.includes(tag)
      ? tagFilter.filter((t) => t !== tag)
      : [...tagFilter, tag];
    setTagFilter(next);
    localStorage.setItem('tagfilters_news', JSON.stringify(next));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setTagFilter([]);
    localStorage.setItem('filters_news', JSON.stringify([]));
    localStorage.setItem('tagfilters_news', JSON.stringify([]));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], []), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (tagFilter.length > 0 ? 1 : 0);

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
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to delete news', { description: getErrorDetail(err) });
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedNews([]);
    setSelectionResetKey((k) => k + 1);
  }, []);

  // Selection is current-page only: discard it whenever the result set changes
  // (page, page size, search, sort, or filters). Without this, TanStack keeps
  // the selection map keyed by row id across data loads, leaving off-page rows
  // selected and deletable while no visible checkbox is checked.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, paginate.page, paginate.perpage, paginate.search, paginate.sort, paginate.advance]);

  const genBulkCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  const openBulk = (mode: BulkMode) => {
    setBulkMode(mode);
    setBulkCode(genBulkCode());
    setBulkInput('');
    setBulkOpen(true);
  };

  const summarizeBulk = (results: PromiseSettledResult<unknown>[], pastVerb: string, baseVerb: string) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`${pastVerb} ${ok} news article(s)`);
    else if (ok === 0) toast.error(`Failed to ${baseVerb} ${fail} news article(s)`);
    else toast.warning(`${pastVerb} ${ok}, ${fail} failed`);
  };

  const handleConfirmBulk = async () => {
    setBulkBusy(true);
    try {
      const action = BULK_ACTIONS[bulkMode];
      const results = await Promise.allSettled(
        selectedNews.map((n) => {
          if (action.status) {
            const dv = getDocVersion(n);
            return newsService.update(n.id, { status: action.status, ...(dv != null ? { doc_version: dv } : {}) });
          }
          return newsService.delete(n.id);
        }),
      );
      summarizeBulk(results, action.past, action.base);
      setBulkOpen(false);
      setBulkInput('');
      clearSelection();
      setPaginate((prev) => ({ ...prev })); // refetch
      loadSummary();
    } finally {
      setBulkBusy(false);
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
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
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
      id: 'tags',
      header: 'Tags',
      enableSorting: false,
      cell: ({ row }) => {
        const tags = row.original.tags ?? [];
        if (tags.length === 0) return <span className="text-muted-foreground">-</span>;
        const shown = tags.slice(0, 3);
        return (
          <div className="flex flex-wrap gap-1">
            {shown.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
            {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
          </div>
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
      meta: { headerClassName: 'w-20', cellClassName: 'text-center p-0' },
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

  const bulkAction = BULK_ACTIONS[bulkMode];
  const BulkActionIcon = bulkAction.icon;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="News Management"
          subtitle="Manage announcements and news articles"
          actions={
            <>
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
            </>
          }
        />

        <NewsroomSummary summary={summary} loading={summaryLoading} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search news..."
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
                    {tagOptions.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Tags</span>
                          {tagFilter.length > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setTagFilter([]); localStorage.setItem('tagfilters_news', JSON.stringify([])); setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, []), filter: {} })); }}>Clear</Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {tagOptions.map((t) => (
                            <Button
                              key={t}
                              variant={tagFilter.includes(t) ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleTagFilter(t)}
                            >
                              {t}
                            </Button>
                          ))}
                        </div>
                      </div>
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
                    {cap(s)}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {tagFilter.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs gap-1 pr-1">
                    {t}
                    <button onClick={() => handleTagFilter(t)} className="ml-0.5 hover:text-foreground">
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
              <>
                {canSelect && selectedNews.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedNews.length} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => openBulk('publish')}>
                          <Send className="mr-2 h-4 w-4" />
                          Publish Selected
                        </Button>
                      )}
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => openBulk('archive')}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archive Selected
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="destructive" size="sm" onClick={() => openBulk('delete')}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Selected
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                <div className="relative">
                {loading && newsItems.length === 0 ? (
                  <TableSkeleton columns={canSelect ? 9 : 8} rows={paginate.perpage || 5} />
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
                      enableRowSelection={canSelect}
                      getRowId={(row) => row.id}
                      onSelectionChange={setSelectedNews}
                      selectionResetKey={selectionResetKey}
                      getRowSelectionLabel={(n) => `Select ${n.title || 'news'}`}
                    />
                  </>
                )}
                </div>
              </>
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

      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkBusy) { setBulkOpen(false); setBulkInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${bulkAction.destructive ? 'text-destructive' : ''}`}>
              <BulkActionIcon className="h-5 w-5" />
              {bulkAction.title} {selectedNews.length} News Article(s)
            </DialogTitle>
            <DialogDescription>
              {bulkAction.description(selectedNews.length)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`max-h-40 overflow-y-auto rounded-md border px-3 py-2 space-y-1 ${bulkAction.destructive ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/50'}`}>
              {selectedNews.map((n) => (
                <div key={n.id} className="text-sm font-medium">{n.title || '(untitled)'}</div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkNewsConfirm">
                Type <span className={`font-mono font-semibold ${bulkAction.destructive ? 'text-destructive' : ''}`}>{bulkCode}</span> to confirm
              </Label>
              <Input
                id="bulkNewsConfirm"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value.toUpperCase())}
                placeholder="Enter the 6-character code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(false); setBulkInput(''); }} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button
              variant={bulkAction.destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={handleConfirmBulk}
              disabled={bulkBusy || bulkInput !== bulkCode}
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BulkActionIcon className="mr-2 h-4 w-4" />}
              {bulkBusy ? bulkAction.busy : bulkAction.title}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DevDebugSheet title="API Response" endpoint="GET /api/news" data={rawResponse} />
    </Layout>
  );
};

export default NewsManagement;
