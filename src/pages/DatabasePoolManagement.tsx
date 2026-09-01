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
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Server, Download, Copy } from 'lucide-react';
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
import { poolDsn, isDerivedName } from '../utils/databasePool';
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

  /**
   * คัดลอกที่อยู่ของ pool ไปวางต่อได้ทันที
   *
   * เดิมคนดูแลที่อยากยิง psql ใส่เครื่องนี้ต้องกวาดตาสี่คอลัมน์แล้วพิมพ์ประกอบเอง ปุ่มนี้คือ
   * การกระทำถัดไปจริง ๆ ของแถว ไม่ใช่ของประดับ — จึงอยู่ติดกับที่อยู่ ไม่ใช่ในเมนู `...`
   *
   * useCallback เพราะมันอยู่ใน deps ของ `columns` — ฟังก์ชันที่สร้างใหม่ทุก render จะทำให้
   * useMemo ของคอลัมน์คำนวณใหม่ทุกครั้งจนไม่เหลือประโยชน์
   */
  const handleCopyDsn = useCallback(async (dsn: string) => {
    try {
      await navigator.clipboard.writeText(dsn);
      toast.success(t('pages.databasePools.dsnCopied'));
    } catch (err) {
      // คลิปบอร์ดถูกปฏิเสธได้ทั้งจากสิทธิ์และจากบริบทที่ไม่ใช่ secure context — บอกให้ผู้ใช้
      // คัดลอกเอง ดีกว่าเงียบแล้วปล่อยให้เขาเชื่อว่าคัดลอกสำเร็จ
      toast.error(t('pages.databasePools.dsnCopyFailed'));
      devLog('copyDsn', err);
    }
  }, [t]);

  const handleExport = () => {
    const rows = items.map((item) => ({ ...item, dsn: poolDsn(item), ...auditCsvFields(normalizeAudit(item)) }));
    const csv = generateCSV(rows, [
      // ที่อยู่ประกอบแล้วมาก่อน แล้วค่อยตามด้วยส่วนประกอบรายช่อง — ไฟล์ที่เปิดใน spreadsheet
      // ยังต้องกรอง/เรียงตาม host หรือ database รายช่องได้ จึงไม่ยุบสี่คอลัมน์นั้นทิ้งเหมือนบนหน้าจอ
      { key: 'dsn', label: t('pages.databasePools.columnConnection') },
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
      // id คือ 'host' ไม่ใช่ 'connection' เพราะ `handleSortChange` ส่ง id ตรงไปเป็นชื่อฟิลด์ให้
      // backend เรียง — 'connection' ไม่มีอยู่จริงในตาราง ส่วนการเรียงตาม host คือการจัดกลุ่ม
      // ตามเครื่อง ซึ่งเป็นสิ่งที่คนดูแลอยากได้จากคอลัมน์นี้อยู่แล้ว
      id: 'host',
      accessorFn: (row: DatabasePool) => row.host,
      header: t('pages.databasePools.columnConnection'),
      meta: { card: 'title' },
      cell: ({ row }) => {
        const pool = row.original;
        const dsn = poolDsn(pool);
        return (
          <div className="min-w-0 space-y-0.5 py-0.5">
            {/* ต่ำกว่า lg คือโหมดการ์ดของ DataTable ซึ่งห่อเซลล์ title ไว้ใน div เปล่าที่ไม่มี
                `min-w-0` — flex item จึงยุบไม่ได้ และ `truncate` เอาไม่อยู่: ที่อยู่ทะลุขอบการ์ด
                ออกไปพร้อมดันปุ่มคัดลอกหลุดจอ แก้จากฝั่งเซลล์ด้วยการยอมให้ตัดคำ (ซึ่งทำให้
                min-content ของมันเหลือหนึ่งตัวอักษร) แล้วค่อยกลับไป truncate บรรทัดเดียวบนตาราง */}
            <div className="flex min-w-0 items-start gap-1.5 lg:items-center">
              <Link
                to={`/platform/database-pools/${pool.id}/edit`}
                className="break-all font-mono text-[13px] font-medium hover:underline lg:truncate"
                title={dsn}
              >
                {dsn}
              </Link>
              {/* มองเห็นตลอด ไม่ใช่โผล่ตอน hover — จอสัมผัสไม่มี hover ให้โผล่ และปุ่มที่ปรากฏ
                  ตอนชี้ทำให้ความกว้างของเซลล์ขยับตอนกวาดสายตาไล่ลงมาทีละแถว

                  ไอคอน 14px แต่พื้นที่กดไม่ใช่ 14px — บนการ์ด (ต่ำกว่า lg) เป็น 44px ตามเกณฑ์เป้าสัมผัส
                  ส่วนบนตารางเป็น 24px ซึ่งกดด้วยเมาส์ได้จริง (ของเดิม ~18px กดพลาดสองครั้งติดกัน
                  ตอนทดสอบในเบราว์เซอร์) negative margin กันไม่ให้เป้าที่โตขึ้นดันความสูงแถว */}
              <button
                type="button"
                onClick={() => handleCopyDsn(dsn)}
                aria-label={t('pages.databasePools.copyDsn')}
                title={t('pages.databasePools.copyDsn')}
                className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:my-0 lg:h-6 lg:w-6"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* ชื่อพูดเฉพาะตอนที่มันไม่ได้พูดซ้ำที่อยู่ — ดู isDerivedName */}
            {!isDerivedName(pool) && (
              <div className="break-words text-xs text-muted-foreground lg:truncate" title={pool.name}>{pool.name}</div>
            )}
            {/* หมายเหตุเคยอยู่แค่ใน CSV ทั้งที่ประโยค "สร้างอัตโนมัติจาก tb_business_unit.db_connection"
                คือสิ่งที่อธิบายแถวนั้นได้ดีที่สุด และเป็นคำเตือนว่ามันไม่ได้ถูกตั้งขึ้นด้วยมือ */}
            {pool.note && (
              <div className="break-words text-[11px] text-muted-foreground/80 lg:truncate" title={pool.note}>{pool.note}</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { card: 'badge' },
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
  ], [navigate, t, handleCopyDsn]);

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
