import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { NewsroomSummary } from './newsManagement/NewsroomSummary';
import type { NewsSummaryData } from '../types';
import newsService from '../services/newsService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Download, Newspaper, Globe, Building2, Loader2, Archive, Send, History } from "lucide-react";
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { getDocVersion } from '../utils/docVersion';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
import { useRowActivityTrail } from '../components/activityTrail/useRowActivityTrail';
import { AUDIT_RECORDING_STARTED_ON_PHASE_2 } from '../components/activityTrail/constants';
import { PLATFORM_SCOPED_RECORD } from '../utils/permissions';
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';
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

// Fallback for a status/label lookup miss — `translate` returns '' on a miss, so this is
// load-bearing (see statusLabel below, defined inside the component).
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

// Translation KEYS, not translated strings — the actual text is resolved with `t` at each
// render call site (this object is module-level, outside the component, so it has no
// access to the hook). `dialogTitleKey`/`descriptionKey` are whole-sentence templates
// (see pages.news.bulk* in the catalog) rather than a verb interpolated into a frame —
// Thai word order differs from English here, same reasoning as summarizeBulk below.
const BULK_ACTIONS: Record<BulkMode, {
  titleKey: TKey;        // verb — dialog title prefix + confirm button label
  busyKey: TKey;         // in-flight button label, e.g. 'Deleting...'
  dialogTitleKey: TKey;  // whole '{verb} {{count}} News Article(s)' template
  descriptionKey: TKey;  // whole sentence template, takes {{count}}
  icon: LucideIcon;
  destructive: boolean;  // destructive styling (delete only)
  status?: NewsStatus;   // status to set for update-based actions; absent ⇒ delete
}> = {
  delete: {
    titleKey: 'common.action.delete', busyKey: 'common.busy.deleting',
    dialogTitleKey: 'pages.news.bulkDeleteTitle', descriptionKey: 'pages.news.bulkDeleteDescription',
    icon: Trash2, destructive: true,
  },
  archive: {
    titleKey: 'pages.news.archive', busyKey: 'pages.news.archiving',
    dialogTitleKey: 'pages.news.bulkArchiveTitle', descriptionKey: 'pages.news.bulkArchiveDescription',
    icon: Archive, destructive: false, status: 'archived',
  },
  publish: {
    titleKey: 'pages.news.publish', busyKey: 'pages.news.publishing',
    dialogTitleKey: 'pages.news.bulkPublishTitle', descriptionKey: 'pages.news.bulkPublishDescription',
    icon: Send, destructive: false, status: 'published',
  },
};

const NewsManagement: React.FC = () => {
  const navigate = useNavigate();
  const activityTrail = useRowActivityTrail();
  const { t } = useI18n();
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
  const [summaryError, setSummaryError] = useState(false);

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
      setError(t('pages.news.loadFailedPrefix') + getErrorDetail(err, t));
      devLog('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNews(paginate);
  }, [fetchNews, paginate]);

  useEffect(() => {
    newsService.getTags().then(setTagOptions).catch(() => setTagOptions([]));
  }, []);

  // Newsroom masthead reads a dedicated endpoint that takes no filter, so the pipeline counts
  // and lead story always describe the whole desk — not the current search/advance view. On a
  // failed refresh the last known numbers are kept (not cleared) and `summaryError` drives a
  // dimmed "couldn't refresh" cue — see NewsroomSummary's `error` handling, mirrored from
  // ClusterManagement's FleetCapacity.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await newsService.getNewsroomSummary();
      setSummary(data);
    } catch (err: unknown) {
      devLog('Error loading newsroom summary:', err);
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
      toast.success(t('toast.deleted', { entity: t('entity.news.sentence') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.news.lower') }), { description: getErrorDetail(err, t) });
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

  // Nine whole-sentence keys (three verbs × three outcomes) instead of an English verb
  // interpolated into a frame — English puts the verb first and inflects it, Thai does
  // neither, so the sentence has to be translated as a whole per verb/outcome pair.
  const summarizeBulk = (results: PromiseSettledResult<unknown>[], verb: BulkMode) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(t(`pages.news.bulk.${verb}.ok` as TKey, { count: ok }));
    else if (ok === 0) toast.error(t(`pages.news.bulk.${verb}.failed` as TKey, { count: fail }));
    else toast.warning(t(`pages.news.bulk.${verb}.partial` as TKey, { count: ok, failed: fail }));
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
      summarizeBulk(results, bulkMode);
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
    const rows = newsItems.map((n) => ({ ...n, ...auditCsvFields(normalizeAudit(n)) }));
    const csv = generateCSV(rows, [
      { key: 'title', label: t('common.field.title') },
      { key: 'status', label: t('common.status.label') },
      { key: 'url', label: 'URL' },
      { key: 'published_at', label: t('common.audit.publishedDate') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `news-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  // 'draft' has no common.status.* entry (only published/archived/updated do) — routed
  // explicitly to pages.news.draft BEFORE the fallback. Fix-round-1: writing this as
  // `t(\`common.status.${s}\`) || t('pages.news.draft') || cap(s)` looks equivalent but is
  // not — it silently renders "Draft" for ANY unrecognised status, repeating the exact
  // "missing key produces plausible English" illusion this fix closes. `translate` returns
  // '' for an unknown key, so `|| cap(s)` stays as the last-resort fallback for a status
  // this switch has never heard of, not as a way to paper over 'draft'.
  const statusLabel = useCallback(
    (s: string) => (s === 'draft' ? t('pages.news.draft') : t(`common.status.${s}` as TKey)) || cap(s),
    [t],
  );

  const columns = useMemo<ColumnDef<News, unknown>[]>(() => [
    {
      accessorKey: 'title',
      header: t('common.field.title'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/news/${row.original.id}/edit`}
            className="text-primary hover:underline whitespace-nowrap"
            title={row.original.title || t('pages.news.untitled')}
          >
            {row.original.title || t('pages.news.untitled')}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {statusLabel(row.original.status || 'draft')}
        </Badge>
      ),
    },
    {
      id: 'target',
      header: t('pages.news.target'),
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
            {t('common.option.global')}
          </Badge>
        );
      },
    },
    {
      id: 'tags',
      header: t('pages.news.tags'),
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
      header: t('common.audit.publishedDate'),
      cell: ({ row }) => (
        <span className="text-[11px] whitespace-nowrap text-muted-foreground">{fmt(row.original.published_at)}</span>
      ),
    },
    {
      id: 'updated_at',
      header: t('common.audit.updatedDate'),
      enableSorting: false,
      cell: ({ row }) => <AuditMeta variant="cell" actor={normalizeAudit(row.original).updated} />,
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.action.rowActions', { name: row.original.title || '' })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="news.update">
              <DropdownMenuItem onClick={() => navigate(`/news/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="activity_log.read" clusterId={PLATFORM_SCOPED_RECORD}>
              {/* onSelect ไม่ใช่ onClick — ให้เมนูปิดเสร็จก่อนแผ่นเปิด ไม่งั้น focus trap
                  ของ Radix สองชั้นจะชนกัน */}
              <DropdownMenuItem
                onSelect={() => activityTrail.openFor(row.original.id)}
                className="cursor-pointer"
              >
                <History className="mr-2 h-4 w-4" />
                {t('pages.activityTrail.buttonLabel')}
              </DropdownMenuItem>
            </Can>
            <Can permission="news.delete">
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, t, statusLabel, activityTrail]);

  const bulkAction = BULK_ACTIONS[bulkMode];
  const BulkActionIcon = bulkAction.icon;

  // `pages.news.typeCodeToConfirm` interpolates a single point in the sentence ("Type
  // {{code}} to confirm" / "พิมพ์ {{code}} เพื่อยืนยัน"). The code itself has to stay a
  // styled <span>, not plain text, so it can't be baked into the translated string. Render
  // the template with a marker in place of the value, then split on that marker so the real
  // JSX span can be re-inserted at the exact point the sentence puts it — mirrors
  // UserManagement's typeUsernameToConfirm.
  const CONFIRM_CODE_MARKER = '@@CODE@@';
  const [confirmBefore, confirmAfter = ''] = t('pages.news.typeCodeToConfirm', { code: CONFIRM_CODE_MARKER }).split(CONFIRM_CODE_MARKER);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.news.title')}
          subtitle={t('pages.news.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || newsItems.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="news.create">
                <Button onClick={() => navigate('/news/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.news.addNews')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <NewsroomSummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('pages.news.searchPlaceholder')}
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
                    <SheetDescription>{t('pages.news.filterDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearAllFilters}>{t('common.action.clear')}</Button>
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
                            {statusLabel(s)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {tagOptions.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t('pages.news.tags')}</span>
                          {tagFilter.length > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setTagFilter([]); localStorage.setItem('tagfilters_news', JSON.stringify([])); setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, []), filter: {} })); }}>{t('common.action.clear')}</Button>
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
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {statusFilter.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {statusLabel(s)}
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
                  {t('common.action.clearAll')}
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && newsItems.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Newspaper}
                emptyTitle={t('pages.news.emptyTitle')}
                emptyDescription={t('pages.news.emptyDescription')}
                addAction={
                  <Can permission="news.create">
                    <Button size="sm" onClick={() => navigate('/news/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.news.addNews')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <>
                {canSelect && selectedNews.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{t('common.state.nSelected', { count: selectedNews.length })}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => openBulk('publish')}>
                          <Send className="mr-2 h-4 w-4" />
                          {t('pages.news.publishSelected')}
                        </Button>
                      )}
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => openBulk('archive')}>
                          <Archive className="mr-2 h-4 w-4" />
                          {t('pages.news.archiveSelected')}
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="destructive" size="sm" onClick={() => openBulk('delete')}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('pages.news.deleteSelected')}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        {t('common.action.clear')}
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
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.news.loading')}>
                        <div className="text-muted-foreground">{t('pages.news.loadingEllipsis')}</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={newsItems}
                      serverSide
                      tableLayout="auto"
                      stickyLeftColumns={canSelect ? 3 : 2}
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
                      getRowSelectionLabel={(n) => t('pages.news.selectRow', { name: n.title || t('entity.news.lower') })}
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
        title={t('pages.news.deleteTitle')}
        description={t('pages.news.deleteConfirm')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkBusy) { setBulkOpen(false); setBulkInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${bulkAction.destructive ? 'text-destructive' : ''}`}>
              <BulkActionIcon className="h-5 w-5" />
              {t(bulkAction.dialogTitleKey, { count: selectedNews.length })}
            </DialogTitle>
            <DialogDescription>
              {t(bulkAction.descriptionKey, { count: selectedNews.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`max-h-40 overflow-y-auto rounded-md border px-3 py-2 space-y-1 ${bulkAction.destructive ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/50'}`}>
              {selectedNews.map((n) => (
                <div key={n.id} className="text-sm font-medium">{n.title || t('pages.news.untitled')}</div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkNewsConfirm">
                {confirmBefore}<span className={`font-mono font-semibold ${bulkAction.destructive ? 'text-destructive' : ''}`}>{bulkCode}</span>{confirmAfter}
              </Label>
              <Input
                id="bulkNewsConfirm"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value.toUpperCase())}
                placeholder={t('pages.news.confirmCodePlaceholder')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(false); setBulkInput(''); }} disabled={bulkBusy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={bulkAction.destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={handleConfirmBulk}
              disabled={bulkBusy || bulkInput !== bulkCode}
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BulkActionIcon className="mr-2 h-4 w-4" />}
              {t(bulkBusy ? bulkAction.busyKey : bulkAction.titleKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActivityTrailSheet

        entityType="news"

        recordingStartedOn={AUDIT_RECORDING_STARTED_ON_PHASE_2}

        {...activityTrail.sheetProps}

      />


      <DevDebugSheet title="API Response" endpoint="GET /api/news" data={rawResponse} />
    </Layout>
  );
};

export default NewsManagement;
