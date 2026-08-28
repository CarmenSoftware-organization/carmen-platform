import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import broadcastService from '../services/broadcastService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Filter, X, Plus, Megaphone, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';

import { BroadcastSummary } from './broadcastManagement/BroadcastSummary';
import { BroadcastFilters } from './broadcastManagement/BroadcastFilters';
import { createBroadcastColumns } from './broadcastManagement/broadcastColumns';
import type { BroadcastListItem, BroadcastListParams, BroadcastSummary as SummaryType } from '../types';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const BroadcastManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<BroadcastListItem[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_broadcasts') || '';
  const storedStatus = getStoredJSON<string[]>('filters_broadcast_status', []);
  const storedScope = getStoredJSON<string[]>('filters_broadcast_scope', []);
  const storedPage = Number(localStorage.getItem('page_broadcasts')) || 1;
  const storedSort = localStorage.getItem('sort_broadcasts') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedStatus);
  const [scopeFilter, setScopeFilter] = useState<string[]>(storedScope);
  const [showDeleted, setShowDeleted] = useState<boolean>(getStoredJSON<boolean>('filter_broadcast_deleted', false));
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [summary, setSummary] = useState<SummaryType | null>(null);

  const [paginate, setPaginate] = useState<BroadcastListParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem("perpage_broadcasts")) || 20,
    search: storedSearch || undefined,
    sort: storedSort,
    status: storedStatus.length > 0 ? storedStatus.join(',') : undefined,
    scope: storedScope.length > 0 ? storedScope.join(',') : undefined,
    include_deleted: getStoredJSON<boolean>('filter_broadcast_deleted', false),
  });

  const [deleteId, setDeleteId] = useState<{ id: string; docVersion: number } | null>(null);
  const [expireNowId, setExpireNowId] = useState<{ id: string; docVersion: number } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchItems = useCallback(async (params: BroadcastListParams) => {
    try {
      setLoading(true);
      const data = await broadcastService.getAll(params);
      setRawResponse(data);
      const rows = data.data || [];
      setItems(rows);
      setTotalRows(data.paginate?.total ?? data.total ?? rows.length);
      if (data.summary) {
        setSummary(data.summary);
      }
      setError('');
    } catch (err: unknown) {
      setError(t('pages.broadcasts.loadFailedPrefix') + getErrorDetail(err, t));
      devLog('Error fetching broadcasts:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchItems(paginate);
  }, [fetchItems, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_broadcasts', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_broadcasts', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value || undefined }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_broadcasts", String(perpage));
    localStorage.setItem('page_broadcasts', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_broadcasts', sort);
    localStorage.setItem('page_broadcasts', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    if (status === 'all') {
      setStatusFilter([]);
      localStorage.setItem('filters_broadcast_status', JSON.stringify([]));
      setPaginate(prev => ({ ...prev, page: 1, status: undefined }));
      return;
    }
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_broadcast_status', JSON.stringify(next));
    localStorage.setItem('page_broadcasts', '1');
    setPaginate(prev => ({ ...prev, page: 1, status: next.length > 0 ? next.join(',') : undefined }));
  };

  const handleScopeFilter = (scope: string) => {
    const next = scopeFilter.includes(scope)
      ? scopeFilter.filter((s) => s !== scope)
      : [...scopeFilter, scope];
    setScopeFilter(next);
    localStorage.setItem('filters_broadcast_scope', JSON.stringify(next));
    localStorage.setItem('page_broadcasts', '1');
    setPaginate(prev => ({ ...prev, page: 1, scope: next.length > 0 ? next.join(',') : undefined }));
  };

  const handleShowDeletedToggle = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    localStorage.setItem('filter_broadcast_deleted', JSON.stringify(next));
    localStorage.setItem('page_broadcasts', '1');
    setPaginate(prev => ({ ...prev, page: 1, include_deleted: next }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setScopeFilter([]);
    setShowDeleted(false);
    localStorage.setItem('filters_broadcast_status', JSON.stringify([]));
    localStorage.setItem('filters_broadcast_scope', JSON.stringify([]));
    localStorage.setItem('filter_broadcast_deleted', JSON.stringify(false));
    localStorage.setItem('page_broadcasts', '1');
    setPaginate(prev => ({ ...prev, page: 1, status: undefined, scope: undefined, include_deleted: false }));
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await broadcastService.remove(deleteId.id, deleteId.docVersion);
      toast.success(t('toast.deleted', { entity: t('entity.broadcast.sentence') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.broadcast.lower') }), { description: getErrorDetail(err, t) });
    }
  };

  const handleConfirmExpireNow = async () => {
    if (!expireNowId) return;
    try {
      await broadcastService.update(expireNowId.id, {
        end_at: new Date().toISOString(),
        doc_version: expireNowId.docVersion,
      });
      toast.success(t('pages.broadcasts.toastExpired'));
      setExpireNowId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error(t('pages.broadcasts.toastExpireFailed'), { description: getErrorDetail(err, t) });
    }
  };

  const handleExport = () => {
    const rows = items.map((item) => ({ ...item, ...auditCsvFields(normalizeAudit(item)) }));
    const csv = generateCSV(rows, [
      { key: 'title', label: t('common.field.title') },
      { key: 'message', label: t('pages.broadcasts.message') },
      { key: 'scope', label: t('common.field.scope') },
      { key: 'bu_code', label: t('pages.broadcasts.buCode') },
      { key: 'severity', label: t('common.field.severity') },
      { key: 'status', label: t('common.status.label') },
      { key: 'scheduled_at', label: t('pages.broadcasts.scheduledAt') },
      { key: 'end_at', label: t('pages.broadcasts.expiresAt') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `broadcasts-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (scopeFilter.length > 0 ? 1 : 0) + (showDeleted ? 1 : 0);

  const columns = useMemo(() => createBroadcastColumns({
    showDeleted,
    onDelete: (id, docVersion) => setDeleteId({ id, docVersion }),
    onExpireNow: (id, docVersion) => setExpireNowId({ id, docVersion }),
    t,
  }), [showDeleted, t]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('breadcrumb.broadcasts')}
          subtitle={
            <div className="space-y-1">
              <div>{t('pages.broadcasts.subtitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.broadcasts.specificUserNote')}
              </div>
            </div>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="broadcast.send">
                <Button onClick={() => navigate('/broadcasts/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.broadcasts.newBroadcast')}</span>
                  <span className="sm:hidden">{t('breadcrumb.new')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <BroadcastSummary
          summary={summary}
          loading={loading}
          error={error}
          onRetry={() => fetchItems(paginate)}
          statusFilter={statusFilter}
          onStatusFilter={handleStatusFilter}
          showDeleted={showDeleted}
          onToggleDeleted={handleShowDeletedToggle}
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('pages.broadcasts.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
              <BroadcastFilters
                open={showFilters}
                onOpenChange={setShowFilters}
                statusFilter={statusFilter}
                onStatusFilter={handleStatusFilter}
                scopeFilter={scopeFilter}
                onScopeFilter={handleScopeFilter}
                showDeleted={showDeleted}
                onShowDeletedToggle={handleShowDeletedToggle}
                onClearAll={handleClearAllFilters}
                activeFilterCount={activeFilterCount}
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
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {statusFilter.map((s) => (
                  <Badge key={`status-${s}`} variant="secondary" className="text-xs gap-1 pr-1 capitalize">
                    {t(`common.status.${s}` as TKey) || s}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {scopeFilter.map((s) => (
                  <Badge key={`scope-${s}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === 'system' ? t('common.option.system') : t('entity.businessUnit.title')}
                    <button onClick={() => handleScopeFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {showDeleted && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {t('common.action.showDeleted')}
                    <button onClick={handleShowDeletedToggle} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {t('common.action.clearAll')}
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && items.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Megaphone}
                emptyTitle={t('pages.broadcasts.emptyTitle')}
                emptyDescription={t('pages.broadcasts.emptyDescription')}
                addAction={
                  <Can permission="broadcast.send">
                    <Button size="sm" onClick={() => navigate('/broadcasts/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.broadcasts.newBroadcast')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && items.length === 0 ? (
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 20} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.broadcasts.loading')}>
                        <div className="text-muted-foreground">{t('pages.broadcasts.loadingEllipsis')}</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={items}
                      serverSide
                      tableLayout="auto"
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
        title={t('pages.broadcasts.deleteTitle')}
        description={t('pages.broadcasts.deleteConfirm')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDialog
        open={expireNowId !== null}
        onOpenChange={(open) => { if (!open) setExpireNowId(null); }}
        title={t('pages.broadcasts.expireTitle')}
        description={`${t('pages.broadcasts.expireImmediateNote')} ${t('pages.broadcasts.expireConfirm')}`}
        confirmText={t('pages.broadcasts.expireNow')}
        onConfirm={handleConfirmExpireNow}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api/notifications/broadcasts" data={rawResponse} />
    </Layout>
  );
};

export default BroadcastManagement;
