import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { DataTable } from '../../components/ui/data-table';
import { TableSkeleton } from '../../components/TableSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { FetchErrorState } from '../../components/FetchErrorState';
import { SearchInput } from '../../components/SearchInput';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import Can from '../../components/Can';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import CronJobFilterSheet from './CronJobFilterSheet';
import { AlertTriangle, Clock, Download, Filter, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import cronjobService from '../../services/cronjobService';
import { getErrorDetail } from '../../utils/errorParser';
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { describeCron } from '../../utils/cronExpression';
import { relativeTime } from '../../utils/relativeTime';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useI18n } from '../../hooks/useI18n';
import { useAuth } from '../../context/AuthContext';
import type { CronJob } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';
import type { TKey } from '../../i18n/types';

// No date library in this repo (see CLAUDE.md · DateTime) — copied from the shared shape
// (ActivityEventManagement.tsx / AuditMeta.tsx, 21+ call sites) rather than hand-rolled here.
const fmt = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
    </div>
  );
}

const CronJobManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('cronjob.manage');

  const [items, setItems] = useState<CronJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perpage, setPerpage] = useState(() => Number(localStorage.getItem('perpage_cronjob')) || 10);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name:asc');
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [activeJobs, setActiveJobs] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null);
  // The id of the row currently mid-flight on Start/Stop/Run now — disables those three
  // buttons on that row so a double-click cannot dispatch the action twice. Delete already
  // has its own guard (ConfirmDialog manages its own loading/disabled state), so it's not
  // tracked here. A single id is enough since a row can only have one of these in flight at
  // once (all three buttons for a row are disabled together while it is set).
  const [actingJobId, setActingJobId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('perpage_cronjob', String(perpage));
  }, [perpage]);

  const resetPage = useCallback(() => setPage(1), []);
  // Server-side list (the gateway paginates) — search IS debounced here, unlike the
  // client-filtered pages elsewhere in this app. `onSettle` resets the page atomically with
  // the debounce firing; the SearchInput `onClear` path below bypasses the timer via `flush`
  // and resets the page itself in the same handler — see useDebouncedValue's own doc comment.
  const [debouncedSearch, flushSearch] = useDebouncedValue(search, 300, resetPage);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cronjobService.getAll({ page, perpage, search: debouncedSearch, sort, filter });
      return res;
    } catch (err) {
      setError(getErrorDetail(err, t));
      return null;
    } finally {
      setLoading(false);
    }
  }, [page, perpage, debouncedSearch, sort, filter, t]);

  useEffect(() => {
    let ignore = false; // a slow response for an abandoned query must not overwrite newer state
    void (async () => {
      const res = await load();
      if (ignore || !res) return;
      setItems(res.data ?? []);
      setTotal(res.paginate?.total ?? 0);
    })();
    return () => { ignore = true; };
  }, [load]);

  // Manual re-fetch after a mutation (start/stop/delete) — none of those change
  // page/perpage/search/sort/filter, so the effect above would not refire on its own.
  const refresh = useCallback(async () => {
    const res = await load();
    if (!res) return;
    setItems(res.data ?? []);
    setTotal(res.paginate?.total ?? 0);
  }, [load]);

  // Scheduler's in-memory count — deliberately separate from the DB-derived counts below,
  // since a disagreement between the two is itself the signal that the scheduler is stuck.
  useEffect(() => {
    let ignore = false;
    void cronjobService.getStatus()
      .then((s) => { if (!ignore) setActiveJobs(s.active_jobs); })
      .catch(() => { if (!ignore) setActiveJobs(null); });
    return () => { ignore = true; };
  }, []);

  const handleStart = useCallback(async (job: CronJob) => {
    setActingJobId(job.id);
    try {
      await cronjobService.start(job.id);
      toast.success(t('cronjob.toast.started'));
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err, t));
    } finally {
      // finally, not just the success path — an error must still release the row, or a
      // failed Start/Stop/Run-now would leave those buttons permanently disabled.
      setActingJobId(null);
    }
  }, [refresh, t]);

  const handleStop = useCallback(async (job: CronJob) => {
    setActingJobId(job.id);
    try {
      await cronjobService.stop(job.id);
      toast.success(t('cronjob.toast.stopped'));
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err, t));
    } finally {
      setActingJobId(null);
    }
  }, [refresh, t]);

  const handleExecute = useCallback(async (job: CronJob) => {
    setActingJobId(job.id);
    try {
      await cronjobService.execute(job.id);
      // info, NOT success: POST /execute returns the moment the job is handed to a background
      // worker. We do not know the outcome yet, and "succeeded" would be a claim the operator
      // acts on.
      toast.info(t('cronjob.toast.dispatched'));
    } catch (err) {
      toast.error(getErrorDetail(err, t));
    } finally {
      setActingJobId(null);
    }
  }, [t]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await cronjobService.remove(deleteTarget.id);
      toast.success(t('cronjob.toast.deleted'));
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err, t));
    }
  }, [deleteTarget, refresh, t]);

  const columns = useMemo<ColumnDef<CronJob, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('cronjob.column.name'),
      enableSorting: true,
      meta: { card: 'title' },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.description && (
            <div className="text-xs text-muted-foreground">{row.original.description}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'job_type',
      header: t('cronjob.column.type'),
      enableSorting: true,
      meta: { card: 'badge' },
      cell: ({ row }) => <Badge variant="secondary">{t(`cronjob.type.${row.original.job_type}` as TKey)}</Badge>,
    },
    {
      accessorKey: 'cron_expression',
      header: t('cronjob.column.schedule'),
      cell: ({ row }) => {
        // describeCron returns '' for an untouched/empty expression and null only for a
        // genuinely invalid one — both must fall back to a dash here, not just the null case.
        const sentence = describeCron(row.original.cron_expression, lang === 'th' ? 'th' : 'en');
        return (
          <div>
            <code className="text-[10px] sm:text-xs font-mono">{row.original.cron_expression}</code>
            <div className="text-xs text-muted-foreground">{sentence ? sentence : '—'}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: t('cronjob.column.status'),
      enableSorting: true,
      meta: { card: 'badge' },
      cell: ({ row }) => row.original.is_active
        ? <Badge variant="success">{t('cronjob.status.running')}</Badge>
        : <Badge variant="secondary">{t('cronjob.status.stopped')}</Badge>,
    },
    {
      id: 'owner',
      accessorFn: (r) => r.source_service ?? '',
      header: t('cronjob.column.owner'),
      cell: ({ row }) => row.original.source_service
        ? <Badge variant="outline">{row.original.source_service}</Badge>
        : <span className="text-xs text-muted-foreground">{t('cronjob.owner.platform')}</span>,
    },
    {
      accessorKey: 'last_run_at',
      header: t('cronjob.column.lastRun'),
      enableSorting: true,
      cell: ({ row }) => {
        const job = row.original;
        if (!job.last_run_at) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" title={fmt(job.last_run_at)}>
              {relativeTime(job.last_run_at, new Date(), t) || '-'}
            </span>
            {job.last_error && (
              <span title={job.last_error} className="shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'next_run_at',
      header: t('cronjob.column.nextRun'),
      enableSorting: true,
      cell: ({ row }) => <span className="text-xs">{fmt(row.original.next_run_at)}</span>,
    },
    {
      accessorKey: 'run_count',
      header: t('cronjob.column.runs'),
      enableSorting: true,
      cell: ({ row }) => <span className="tabular-nums">{row.original.run_count ?? 0}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const job = row.original;
        const foreign = Boolean(job.source_service);
        // A row's own Start/Stop/Run-now going inert while it's mid-flight is the guard — no
        // whole-table disable, no spinner overlay. Without this a double-click on a slow
        // connection dispatches the action twice; for Run-now that's not a harmless retry —
        // the endpoint hands the job to a background worker and returns before the outcome
        // is known, so two clicks genuinely start two independent runs (duplicate report
        // emails, duplicate notifications, a cleanup job's deletion running twice).
        const acting = actingJobId === job.id;
        if (!canManage) return null;
        return (
          <div className="flex items-center gap-3">
            {job.is_active ? (
              <Button variant="ghost" size="icon" disabled={acting} onClick={() => handleStop(job)} title={t('cronjob.action.stop')} aria-label={t('cronjob.action.stop')}>
                <Pause className="h-5 w-5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" disabled={acting} onClick={() => handleStart(job)} title={t('cronjob.action.start')} aria-label={t('cronjob.action.start')}>
                <Play className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" disabled={acting} onClick={() => handleExecute(job)} title={t('cronjob.action.runNow')} aria-label={t('cronjob.action.runNow')}>
              <Zap className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={foreign}
              title={foreign ? t('cronjob.action.foreignOwnedTooltip', { service: job.source_service ?? '' }) : t('common.action.edit')}
              aria-label={t('common.action.edit')}
              onClick={() => navigate(`/cronjobs/${job.id}/edit`)}
            >
              <Pencil className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={foreign}
              title={foreign ? t('cronjob.action.foreignOwnedTooltip', { service: job.source_service ?? '' }) : t('common.action.delete')}
              aria-label={t('common.action.delete')}
              onClick={() => setDeleteTarget(job)}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        );
      },
    },
  ], [t, lang, canManage, navigate, handleStart, handleStop, handleExecute, actingJobId]);

  // Four of six figures are computed from the rows currently loaded — labelled as covering
  // only this page (see the caption rendered below the band). Total (paginate.total) and
  // Active in scheduler (getStatus()) are the two page-independent figures.
  const pageStats = useMemo(() => ({
    running: items.filter((j) => j.is_active).length,
    stopped: items.filter((j) => !j.is_active).length,
    withErrors: items.filter((j) => !!j.last_error).length,
    foreignOwned: items.filter((j) => !!j.source_service).length,
  }), [items]);

  const handlePaginateChange = useCallback(({ page: newPage, perpage: newPerpage }: { page: number; perpage: number }) => {
    setPage(newPage);
    setPerpage(newPerpage);
  }, []);

  const handleSortChange = useCallback((newSort: string) => setSort(newSort), []);

  const handleExport = () => {
    const rows = items.map((item) => ({
      ...item,
      job_type_label: t(`cronjob.type.${item.job_type}` as TKey),
      status_label: item.is_active ? t('cronjob.status.running') : t('cronjob.status.stopped'),
      owner_label: item.source_service || t('cronjob.owner.platform'),
    }));
    const csv = generateCSV(rows, [
      { key: 'name', label: t('cronjob.column.name') },
      { key: 'description', label: t('common.field.description') },
      { key: 'job_type_label', label: t('cronjob.column.type') },
      { key: 'cron_expression', label: t('cronjob.column.schedule') },
      { key: 'status_label', label: t('cronjob.column.status') },
      { key: 'owner_label', label: t('cronjob.column.owner') },
      { key: 'last_run_at', label: t('cronjob.column.lastRun') },
      { key: 'next_run_at', label: t('cronjob.column.nextRun') },
      { key: 'run_count', label: t('cronjob.column.runs') },
    ]);
    // perpage: -1 is NOT honoured by this endpoint (it silently returns 10 rows), so this
    // exports the rows currently loaded on this page — never a full-set refetch.
    downloadCSV(csv, `cronjobs-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const activeFilterCount = Object.keys(filter).length;

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('cronjob.pluralTitle')}
          subtitle={t('cronjob.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.exportCsv')}
              </Button>
              <Can permission="cronjob.manage">
                <Button onClick={() => navigate('/cronjobs/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('cronjob.addJob')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryStat label={t('cronjob.summary.total')} value={total} />
            <SummaryStat label={t('cronjob.summary.running')} value={pageStats.running} />
            <SummaryStat label={t('cronjob.summary.stopped')} value={pageStats.stopped} />
            <SummaryStat label={t('cronjob.summary.withErrors')} value={pageStats.withErrors} />
            <SummaryStat label={t('cronjob.summary.foreignOwned')} value={pageStats.foreignOwned} />
            <SummaryStat
              label={t('cronjob.summary.activeInScheduler')}
              value={activeJobs === null ? t('cronjob.summary.unavailable') : activeJobs}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('cronjob.summary.pageScopeCaption')}</p>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onValueChange={setSearch}
                onClear={() => { setSearch(''); flushSearch(''); resetPage(); }}
                placeholder={t('cronjob.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowFilters(true)}>
                <Filter className="mr-2 h-4 w-4" />
                {t('common.label.filters')}
                {activeFilterCount > 0 && (
                  <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && <FetchErrorState message={error ?? undefined} onRetry={refresh} />}

            {!error && items.length === 0 && !loading ? (
              <EmptyState
                icon={Clock}
                title={t('cronjob.emptyTitle')}
                description={t('cronjob.emptyDescription')}
                action={
                  <Can permission="cronjob.manage">
                    <Button size="sm" onClick={() => navigate('/cronjobs/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('cronjob.addJob')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && items.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends, so the
                  // skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={perpage || 5} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('cronjob.loadingAria')}>
                        <div className="text-muted-foreground">{t('cronjob.loading')}</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={items}
                      serverSide
                      tableLayout="auto"
                      totalRows={total}
                      page={page}
                      perpage={perpage}
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

      <CronJobFilterSheet
        open={showFilters}
        onOpenChange={setShowFilters}
        filter={filter}
        onApply={(next) => { setFilter(next); setPage(1); }}
        onClear={() => { setFilter({}); setPage(1); }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('cronjob.confirm.deleteTitle')}
        description={t('cronjob.confirm.deleteBody', { name: deleteTarget?.name ?? '' })}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirmed}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="Scheduled Jobs Debug"
          tabs={[
            { key: 'items', label: 'Items', data: items, endpoint: 'GET /api-system/platform/cronjobs' },
            { key: 'query', label: 'Query', data: { page, perpage, search: debouncedSearch, sort, filter } },
            { key: 'meta', label: 'Meta', data: { total, activeJobs } },
          ]}
        />
      )}
    </Layout>
  );
};

export default CronJobManagement;
