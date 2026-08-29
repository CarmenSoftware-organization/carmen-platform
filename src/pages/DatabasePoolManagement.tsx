import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import databasePoolService from '../services/databasePoolService';
import { getErrorDetail, devLog, parseApiError } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Server, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { auditColumns } from '../components/auditColumns';
import { useI18n } from '../hooks/useI18n';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { DatabasePool, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const DatabasePoolManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<DatabasePool[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_database_pools') || '';
  const storedFilters = getStoredJSON<string[]>('filters_database_pools', []);
  const storedPage = Number(localStorage.getItem('page_database_pools')) || 1;
  // ค่าตั้งต้นคือ created_at ไม่ใช่ updated_at — normalizeAudit ตัด `updated` ทิ้งสำหรับ pool ที่
  // ไม่เคยแก้ (ดู utils/audit.ts) เรียงตามคอลัมน์ที่ส่วนใหญ่ไม่มีค่าทำให้เปิดหน้ามาแล้วดูสุ่ม
  const storedSort = localStorage.getItem('sort_database_pools') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (filters: string[]) =>
    filters.length === 1 ? JSON.stringify({ where: { is_active: filters[0] === 'true' } }) : '';

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_database_pool')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters),
    filter: {},
  });

  const [deleteTarget, setDeleteTarget] = useState<DatabasePool | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchPools = useCallback(async (params: PaginateParams = paginate) => {
    try {
      setLoading(true);
      const data = await databasePoolService.getAll(params);
      setRawResponse(data);
      const list = data.data ?? [];
      setItems(list);
      setTotalRows(data.paginate?.total ?? data.total ?? list.length);
      setError('');
    } catch (err: unknown) {
      setError(t('pages.databasePools.loadFailed', { detail: getErrorDetail(err, t) }));
      devLog('Error fetching database pools:', err);
    } finally {
      setLoading(false);
    }
  }, [paginate, t]);

  useEffect(() => {
    fetchPools(paginate);
  }, [fetchPools, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_database_pools', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_database_pools', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_database_pool', String(perpage));
    localStorage.setItem('page_database_pools', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_database_pools', JSON.stringify(next));
    localStorage.setItem('page_database_pools', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next), filter: {} }));
  };

  const handleClearFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_database_pools', JSON.stringify([]));
    localStorage.setItem('page_database_pools', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_database_pools', sort);
    localStorage.setItem('page_database_pools', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await databasePoolService.delete(deleteTarget.id);
      toast.success(`Deleted pool "${deleteTarget.name}"`);
      setDeleteTarget(null);
      fetchPools();
    } catch (err) {
      // 409 DATABASE_POOL_IN_USE — backend เติมรายชื่อ BU ลงในข้อความให้แล้วผ่าน
      // placeholder {business_units} จึงต้องใช้ข้อความของ backend ตรงๆ ทุกกรณี — getErrorDetail
      // จะตัดเหลือ "Please try again later." ใน production ซึ่งกลืนรายชื่อ BU ที่บล็อกอยู่ไปหมด
      toast.error(parseApiError(err).message);
      devLog('deleteDatabasePool', err);
    }
  };

  const handleExport = () => {
    const rows = items.map((item) => ({ ...item, ...auditCsvFields(normalizeAudit(item)) }));
    const csv = generateCSV(rows, [
      { key: 'name', label: t('common.field.name') },
      { key: 'host', label: t('pages.databasePools.columnHost') },
      { key: 'port', label: t('pages.databasePools.columnPort') },
      { key: 'database', label: t('pages.databasePools.columnDatabase') },
      { key: 'username', label: t('common.field.username') },
      { key: 'is_active', label: t('common.status.label') },
      { key: 'note', label: t('pages.databasePools.columnNote') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `database-pools-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<DatabasePool, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('common.field.name'),
      cell: ({ row }) => (
        <Link to={`/platform/database-pools/${row.original.id}/edit`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'endpoint',
      header: t('pages.databasePools.columnHost'),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.host}:{row.original.port}</span>
      ),
    },
    { accessorKey: 'database', header: t('pages.databasePools.columnDatabase') },
    { accessorKey: 'username', header: t('common.field.username') },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    ...auditColumns<DatabasePool>({ t }),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      cell: ({ row }) => (
        <Can permission="database_pool.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('pages.databasePools.actionsAria')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/platform/database-pools/${row.original.id}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      ),
    },
  ], [navigate, t]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('pages.databasePools.title')}
          subtitle={t('pages.databasePools.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.exportCsv')}
              </Button>
              <Can permission="database_pool.manage">
                <Button onClick={() => navigate('/platform/database-pools/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.databasePools.addPool')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
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
                placeholder={t('pages.databasePools.searchPlaceholder')}
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
                    <SheetDescription>{t('pages.databasePools.filterDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearFilters}>{t('common.action.clear')}</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant={statusFilter.includes("true") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("true")}
                        >
                          {t('common.status.active')}
                        </Button>
                        <Button
                          variant={statusFilter.includes("false") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("false")}
                        >
                          {t('common.status.inactive')}
                        </Button>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearFilters}>
                        {t('common.action.clearAllFilters')}
                      </Button>
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
                    {s === "true" ? "Active" : "Inactive"}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
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
                icon={Server}
                emptyTitle={t('pages.databasePools.emptyTitle')}
                emptyDescription={t('pages.databasePools.emptyDescription')}
                addAction={
                  <Can permission="database_pool.manage">
                    <Button size="sm" onClick={() => navigate('/platform/database-pools/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.databasePools.addPool')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && items.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.databasePools.loadingAria')}>
                    <div className="text-muted-foreground">{t('pages.databasePools.loading')}</div>
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
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('pages.databasePools.deleteTitle')}
        description={t('pages.databasePools.deleteDescription')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/database-pools" data={rawResponse} />
    </Layout>
  );
};

export default DatabasePoolManagement;
