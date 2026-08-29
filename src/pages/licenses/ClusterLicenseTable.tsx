import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import clusterService from '../../services/clusterService';
import { getErrorDetail, devLog } from '../../utils/errorParser';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { DataTable } from '../../components/ui/data-table';
import { EmptyState } from '../../components/EmptyState';
import { SearchInput } from '../../components/SearchInput';
import { TableSkeleton } from '../../components/TableSkeleton';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '../../components/ui/sheet';
import { Filter, KeyRound, X } from 'lucide-react';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useI18n } from '../../hooks/useI18n';
import { CapacityMeter } from '../clusterManagement/CapacityMeter';
import { isPerpetual, daysLeft, fmtDate, EXPIRING_SOON_DAYS } from './licenseDates';
import { auditColumns } from '../../components/auditColumns';
import type { Cluster, PaginateParams } from '../../types';
import type { TKey } from '../../i18n/types';
import type { ColumnDef } from '@tanstack/react-table';

// คีย์ localStorage เฉพาะของมุมมองนี้ — แยกจาก `perpage_clusters`/`page_clusters`/`sort_clusters`
// ของหน้า /clusters เพื่อไม่ให้ page/perpage/sort ของสองหน้าเหยียบกัน (คนละบริบทการใช้งาน)
const PERPAGE_KEY = 'perpage_cluster_license';
const PAGE_KEY = 'page_cluster_license';
const SORT_KEY = 'sort_cluster_license';
const SEARCH_KEY = 'search_cluster_license';
const STATUS_KEY = 'filters_cluster_license_status';
const LICENSE_KEY = 'filters_cluster_license_state';
const DEFAULT_SORT = 'code:asc';

/**
 * ตัวกรองสถานะ license — ค่าแต่ละตัวคือ **คีย์พิเศษที่ backend รู้จัก** ไม่ใช่คอลัมน์จริง
 * (`cluster.service.ts` ถอดคีย์ออกจาก where แล้วแปลงเป็น id list ผ่าน view เดียวกับที่หน้าจอแสดงผล
 * ตัวกรองกับตัวเลขในตารางจึงมาจากนิยามเดียวกันเสมอ)
 *
 * **ส่งคีย์เหล่านี้ไปยัง backend ที่ยังไม่รู้จักมันไม่ได้** — มันจะกลายเป็นคอลัมน์ที่ไม่มีจริงแล้ว
 * Prisma โยน error ทันที นี่คือเหตุผลที่ frontend ต้อง deploy ตามหลัง backend เสมอ
 */
const LICENSE_FILTER_KEYS = ['bu_quota_missing', 'bu_over_limit', 'seats_full'] as const;

type LicenseFilterKey = (typeof LICENSE_FILTER_KEYS)[number];

// One catalog key per filter key — single source of truth for the label, read inside the
// component's own useMemo below (see `licenseFilters`) so it stays in step with `t`.
const LICENSE_FILTER_LABEL_KEYS: Record<LicenseFilterKey, TKey> = {
  bu_quota_missing: 'pages.licenses.noLicence',
  bu_over_limit: 'pages.licenses.overBuLimit',
  seats_full: 'pages.licenses.seatsFull',
};

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export interface ClusterLicenseTableProps {
  /**
   * true = กรองเฉพาะ cluster ที่ใบโควตา BU ที่ชนะใกล้หมดอายุ — เจ้าของ state คือ `LicenseCenter`
   * เพราะสถิติ "BU quota expiring" ในแถบสรุปกดกรองได้ด้วย · ตัวกรองใน Sheet ของตารางนี้จึงเป็น
   * controlled ไม่ใช่ state ของตัวเอง ไม่งั้นจะมีสองแหล่งความจริงที่เพี้ยนจากกันได้
   */
  expiringSoonFilter?: boolean;
  /** ให้ Sheet ปรับตัวกรองเดียวกันได้โดยไม่ต้องถือ state ซ้ำ — ไม่ส่งมา = Sheet ไม่แสดงตัวเลือกนั้น */
  onExpiringSoonChange?: (next: boolean) => void;
}

/**
 * สร้าง `advance.where` — คีย์สถานะ license ทุกตัวไม่ใช่คอลัมน์จริง backend เป็นคนถอดออกและ
 * แปลงเป็น id list เอง frontend จึงไม่มีสำเนาของกติกาให้เพี้ยนได้เลย · เปิดพร้อมกันหลายตัว = AND
 */
const buildAdvance = (
  statuses: string[],
  licenseKeys: LicenseFilterKey[],
  expiringSoon: boolean,
) => {
  const where: Record<string, unknown> = { deleted_at: null };
  if (statuses.length === 1) where.is_active = statuses[0] === 'true';
  for (const key of licenseKeys) where[key] = true;
  if (expiringSoon) where.bu_quota_expiring_soon = true;
  return JSON.stringify({ where });
};

/** ตารางสถานะ license รายคลัสเตอร์ — มุมมอง "By cluster" ของ License Center */
const ClusterLicenseTable: React.FC<ClusterLicenseTableProps> = ({
  expiringSoonFilter = false,
  onExpiringSoonChange,
}) => {
  const { t } = useI18n();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // `noLicence` (bu_quota_missing) reuses the same key as the BU Quota column cell below —
  // same string, same call site pattern the catalog documents.
  const licenseFilters = useMemo<{ key: LicenseFilterKey; label: string }[]>(
    () => LICENSE_FILTER_KEYS.map((key) => ({ key, label: t(LICENSE_FILTER_LABEL_KEYS[key]) })),
    [t],
  );

  const storedPage = Number(localStorage.getItem(PAGE_KEY)) || 1;
  const storedSort = localStorage.getItem(SORT_KEY) || DEFAULT_SORT;
  const storedSearch = localStorage.getItem(SEARCH_KEY) || '';
  const storedStatus = getStoredJSON<string[]>(STATUS_KEY, []);
  const storedLicense = getStoredJSON<LicenseFilterKey[]>(LICENSE_KEY, []);

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedStatus);
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilterKey[]>(storedLicense);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem(PERPAGE_KEY)) || 10,
    sort: storedSort,
    search: storedSearch,
    // เห็นเฉพาะคลัสเตอร์ที่ยังไม่ถูกลบ — ตรงกับค่าเริ่มต้นของหน้า /clusters (showDeleted=false)
    advance: buildAdvance(storedStatus, storedLicense, expiringSoonFilter),
  });

  // `expiringSoonFilter` เป็น prop จากหน้าแม่ ไม่ใช่ state ภายในตารางเอง — sync เข้า paginate.advance
  // ทุกครั้งที่ค่าเปลี่ยน (ข้าม mount แรกเพราะ initial state ข้างบนคำนวณตรงกันอยู่แล้ว ไม่งั้นหน้าที่
  // จำ page ไว้จาก localStorage จะถูกรีเซ็ตกลับ 1 ทุกครั้งที่โหลดหน้าโดยไม่มีใครกด) แล้วรีเซ็ตกลับ
  // หน้า 1 เหมือนตัวกรองอื่นทั้งหมดของ repo นี้เมื่อผู้ใช้กดจริง
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    localStorage.setItem(PAGE_KEY, '1');
    setPaginate((prev) => ({
      ...prev,
      page: 1,
      advance: buildAdvance(statusFilter, licenseFilter, expiringSoonFilter),
    }));
    // ตัวกรองในเครื่อง (status/license) เรียก setPaginate เองตอนกดอยู่แล้ว — effect นี้มีไว้ตาม
    // prop จากหน้าแม่เท่านั้น จึงไม่ใส่สองตัวนั้นใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiringSoonFilter]);

  const fetchClusters = useCallback(async (params: PaginateParams) => {
    setLoading(true);
    try {
      const data = await clusterService.getAll(params);
      const items = data.data || data;
      // โควตามาจากใบที่ชนะ (Task 7) — 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด" (ตรงกับ ClusterManagement)
      const mapped = (Array.isArray(items) ? items : []).map((item: any) => ({
        ...item,
        bu_cap: item.bu_cap ?? 0,
        bu_used: item.bu_used ?? item.bu_count ?? 0,
        users_count: item.users_count ?? item._count?.tb_cluster_user ?? 0,
        total_max_license_users: item.total_max_license_users ?? undefined,
      }));
      setClusters(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? mapped.length);
      setError('');
    } catch (err: unknown) {
      setError(t('pages.licenses.loadFailedPrefix') + getErrorDetail(err, t));
      devLog('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchClusters(paginate);
  }, [fetchClusters, paginate]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem(SEARCH_KEY, value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem(PAGE_KEY, '1');
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const applyFilters = (statuses: string[], licenses: LicenseFilterKey[]) => {
    localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    localStorage.setItem(LICENSE_KEY, JSON.stringify(licenses));
    localStorage.setItem(PAGE_KEY, '1');
    setPaginate((prev) => ({
      ...prev,
      page: 1,
      advance: buildAdvance(statuses, licenses, expiringSoonFilter),
    }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    applyFilters(next, licenseFilter);
  };

  const handleLicenseFilter = (key: LicenseFilterKey) => {
    const next = licenseFilter.includes(key)
      ? licenseFilter.filter((k) => k !== key)
      : [...licenseFilter, key];
    setLicenseFilter(next);
    applyFilters(statusFilter, next);
  };

  const handleClearFilters = () => {
    setStatusFilter([]);
    setLicenseFilter([]);
    applyFilters([], []);
    onExpiringSoonChange?.(false);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem(PERPAGE_KEY, String(perpage));
    localStorage.setItem(PAGE_KEY, String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    // header toggle วนกลับมาที่ "ไม่เรียง" (สตริงว่าง) ได้ — ตกกลับไปที่ค่าเริ่มต้นเสมอ ไม่ส่ง
    // sort ว่างให้ backend
    const next = sort || DEFAULT_SORT;
    localStorage.setItem(SORT_KEY, next);
    localStorage.setItem(PAGE_KEY, '1');
    setPaginate(prev => ({ ...prev, sort: next, page: 1 }));
  };

  const activeFilterCount =
    statusFilter.length + licenseFilter.length + (expiringSoonFilter ? 1 : 0);

  const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => {
    const [createdColumn, updatedColumn] = auditColumns<Cluster>({ hideUpdatedOnCard: true, t });
    return [
      {
        accessorKey: 'code',
        header: t('common.label.cluster'),
        meta: { card: 'title' },
        cell: ({ row }) => (
          <Link to={`/licenses/${row.original.id}`} className="text-primary hover:underline whitespace-nowrap">
            {row.original.code}
          </Link>
        ),
      },
      // เรียงได้เพราะเป็นคอลัมน์จริงของ tb_cluster — backend แปลง `sort` เป็น orderBy ของ Prisma ตรง ๆ
      { accessorKey: 'name', header: t('common.field.name'), meta: { card: 'title' } },
      {
        id: 'bu_quota',
        header: t('pages.licenses.buQuotaColumn'),
        // เรียงไม่ได้: `bu_cap`/`bu_used` มาจาก view ไม่ใช่คอลัมน์ของ tb_cluster — `orderBy` ของ Prisma
        // จึงอ้างถึงไม่ได้ (ตัวกรองทำได้เพราะแปลงเป็น id list ก่อน แต่ `id: { in }` ไม่รักษาลำดับ)
        enableSorting: false,
        cell: ({ row }) => {
          const cap = row.original.bu_cap ?? 0;
          const used = row.original.bu_used ?? 0;
          // cap 0 = ไม่มีใบคุ้มครอง ไม่ใช่ "ไม่จำกัด" — ห้ามแสดง ∞ ที่นี่เด็ดขาด
          if (cap === 0) return <span className="text-xs text-destructive">{t('pages.licenses.noLicence')}</span>;
          return (
            <span className={`font-mono text-xs${used > cap ? ' text-destructive' : ''}`}>
              {used} / {cap}
            </span>
          );
        },
      },
      {
        id: 'seats',
        header: t('common.field.seats'),
        enableSorting: false,
        cell: ({ row }) => (
          <CapacityMeter used={row.original.users_count} cap={row.original.total_max_license_users} />
        ),
      },
      {
        id: 'bu_cap_end',
        header: t('common.state.quotaExpires'),
        enableSorting: false,
        cell: ({ row }) => {
          const end = row.original.bu_cap_end_date;
          if (!end) return <span className="text-xs text-muted-foreground">-</span>;
          if (isPerpetual(end)) return <span className="text-xs text-muted-foreground">{t('common.state.noExpiry')}</span>;
          const left = daysLeft(end, new Date());
          return (
            <span className="text-xs whitespace-nowrap">
              {fmtDate(end)}
              {left <= EXPIRING_SOON_DAYS && left >= 0 && (
                <Badge variant="warning" className="ml-2">{t('common.state.daysLeft', { count: left })}</Badge>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: 'is_active',
        header: t('common.status.label'),
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
            {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
          </Badge>
        ),
      },
      createdColumn,
      updatedColumn,
    ];
  }, [t]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            ref={searchInputRef}
            value={searchTerm}
            onValueChange={handleSearchChange}
            placeholder={t('pages.licenses.searchClustersPlaceholder')}
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
                <SheetDescription>{t('pages.licenses.filtersSheetDescription')}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6 px-1">
                <div className="space-y-3">
                  <span className="text-sm font-medium">{t('common.status.label')}</span>
                  <div className="flex flex-wrap gap-1">
                    {[['true', t('common.status.active')], ['false', t('common.status.inactive')]].map(([value, label]) => (
                      <Button
                        key={value}
                        variant={statusFilter.includes(value) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleStatusFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-sm font-medium">{t('pages.licenses.licenceStateLabel')}</span>
                  <div className="flex flex-wrap gap-1">
                    {licenseFilters.map(({ key, label }) => (
                      <Button
                        key={key}
                        variant={licenseFilter.includes(key) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleLicenseFilter(key)}
                      >
                        {label}
                      </Button>
                    ))}
                    {onExpiringSoonChange && (
                      <Button
                        variant={expiringSoonFilter ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onExpiringSoonChange(!expiringSoonFilter)}
                      >
                        {t('pages.licenses.quotaExpiringToggle')}
                      </Button>
                    )}
                  </div>
                  {/* เปิดหลายตัวพร้อมกันได้ ผลคือ AND — บอกไว้เพราะ "ไม่มีใบ" กับ "เกินโควตา"
                      ทับซ้อนกันโดยธรรมชาติ (cap 0 ทำให้ทุก BU เกินอันดับ) ผู้ใช้จึงอาจงงว่าทำไม
                      เปิดสองอันแล้วผลไม่ใช่ผลรวม */}
                  <p className="text-xs text-muted-foreground">
                    {t('pages.licenses.filterNarrowsHint')}
                  </p>
                </div>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearFilters}>
                    <X className="mr-1 h-3 w-3" />
                    {t('pages.licenses.clearAllFilters')}
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {statusFilter.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1">
                {s === 'true' ? t('common.status.active') : t('common.status.inactive')}
                <button
                  type="button"
                  onClick={() => handleStatusFilter(s)}
                  aria-label={t('pages.licenses.removeFilterAria', { value: s === 'true' ? t('common.status.active') : t('common.status.inactive') })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {licenseFilter.map((key) => (
              <Badge key={key} variant="secondary" className="gap-1">
                {licenseFilters.find((f) => f.key === key)?.label ?? key}
                <button
                  type="button"
                  onClick={() => handleLicenseFilter(key)}
                  aria-label={t('pages.licenses.removeFilterAria', { value: key })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {expiringSoonFilter && onExpiringSoonChange && (
              <Badge variant="secondary" className="gap-1">
                {t('pages.licenses.quotaExpiringToggle')}
                <button type="button" onClick={() => onExpiringSoonChange(false)} aria-label={t('pages.licenses.removeQuotaExpiringFilterAria')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

        {!error && (
          loading && clusters.length === 0 ? (
            // +1 เผื่อคอลัมน์ลำดับแถวที่ DataTable ใส่ให้เองเสมอ
            <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
          ) : clusters.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title={t('pages.licenses.noClustersTitle')}
              description={
                searchTerm || activeFilterCount > 0
                  ? t('pages.licenses.noClustersMatchFilters')
                  : t('pages.licenses.noClustersYet')
              }
              action={
                searchTerm || activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>{t('pages.licenses.clearFiltersAction')}</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                     role="status" aria-label={t('pages.licenses.loadingClustersAria')}>
                  <div className="text-muted-foreground">{t('common.busy.loading')}</div>
                </div>
              )}
              <DataTable
                columns={columns}
                data={clusters}
                serverSide
                tableLayout="auto"
                stickyLeftColumns={3}
                totalRows={totalRows}
                page={paginate.page}
                perpage={paginate.perpage}
                onPaginateChange={handlePaginateChange}
                onSortChange={handleSortChange}
                defaultSort={{ id: 'code', desc: false }}
              />
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default ClusterLicenseTable;
