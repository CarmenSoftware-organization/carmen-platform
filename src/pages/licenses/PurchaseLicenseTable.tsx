import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FileText, Filter, Loader2, RotateCw, X } from 'lucide-react';
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
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useI18n } from '../../hooks/useI18n';
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { devLog } from '../../utils/errorParser';
import { fmtDate, isPerpetual } from './licenseDates';
import { auditColumns } from '../../components/auditColumns';
import { normalizeAudit, auditCsvFields } from '../../utils/audit';
import { licenseStatus as buLicenseStatus } from '../../utils/buLicense';
import { licenseStatus as clusterLicenseStatus } from '../../utils/clusterLicense';
import type { LicenseKind, LicenseKindConfig } from './licenseKindConfig';
import type { SeatLicenseRow, BuQuotaLicenseRow, PaginateParams } from '../../types';
import type { TKey } from '../../i18n/types';
import type { ColumnDef, Row } from '@tanstack/react-table';

type StatusFilterValue = 'active' | 'scheduled' | 'expired';

// The complete enumeration of `StatusFilterValue` — used both for the Sheet's filter
// buttons and to type-check STATUS_VARIANT/STATUS_LABEL_KEYS below. Pure data, module scope
// is fine; the label lookup itself happens inside the component (see `statusLabel`).
const STATUS_VALUES: StatusFilterValue[] = ['active', 'scheduled', 'expired'];

const STATUS_VARIANT: Record<StatusFilterValue, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'secondary',
  expired: 'destructive',
};

// Catalog KEYS only — resolved with `t` inside the component (see `statusLabel`). Reuses
// common.status.* (Task 1) rather than a page-local key: every value this table's two
// status badges (and this filter list) can render already has one.
const STATUS_LABEL_KEYS: Record<StatusFilterValue, TKey> = {
  active: 'common.status.active',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};

// See the identical note in LicensePurchaseForm.tsx: licenseKindConfig.ts used to carry
// `ownerLabel`/`amountLabel` as plain English strings but nothing ever rendered them, so
// this file resolves its own per-kind translated value locally instead. The dead fields
// were deleted from `LicenseKindConfig` in the i18n fix wave (2026-08-28).
const OWNER_LABEL_KEYS: Record<LicenseKind, TKey> = {
  seat: 'entity.businessUnit.title',
  'bu-quota': 'common.label.cluster',
};
const AMOUNT_LABEL_KEYS: Record<LicenseKind, TKey> = {
  seat: 'common.field.seats',
  'bu-quota': 'pages.licenses.buQuota',
};

const DEFAULT_SORT_ID = 'license_number';
const DEFAULT_SORT_DESC = false;
// tiebreaker เดียวกับที่ SubscriptionTable.tsx ใช้แก้บั๊กนี้มาก่อน — `license_number` เดี่ยว ๆ
// unique อยู่แล้วเลยปลอดภัย แต่ `start_date`/`end_date`/จำนวน (ที่ผู้ใช้เรียงได้จริงจาก header)
// ไม่มีตัวไหน unique เลย ค่าเท่ากันหลายแถวทำให้ backend orderBy ไม่นิ่งข้ามหน้า (แถวซ้ำ/หายเงียบ ๆ
// โดยไม่มี error — ดูคอมเมนต์ `withTiebreaker` ใน SubscriptionTable.tsx) `id` เป็น primary key
// จริงของ tb_business_unit_license/tb_cluster_license จึง unique เสมอและตัดเสมอทุกกรณี
const SORT_TIEBREAKER = 'id:asc';
const DEFAULT_SORT = `${DEFAULT_SORT_ID}:${DEFAULT_SORT_DESC ? 'desc' : 'asc'},${SORT_TIEBREAKER}`;

/**
 * ต่อ tiebreaker ให้ค่า sort **ทุกค่า** ที่ `DataTable` ส่งมา ไม่ใช่เฉพาะค่าเริ่มต้น — เรียงตาม
 * `start_date`/`end_date`/จำนวนก็มีค่าซ้ำได้เหมือนกัน · ค่าว่าง (header toggle วนกลับมาที่
 * "ไม่เรียง") ตกกลับไปเป็น DEFAULT_SORT ไม่ใช่ส่งสตริงว่างให้ backend · ค่าที่อ่านจาก localStorage
 * (อาจเป็นสตริงเก่าก่อนแก้บั๊กนี้ที่ยังไม่มี tiebreaker) ก็ต้องผ่านฟังก์ชันนี้ก่อนใช้เสมอ
 */
const withTiebreaker = (sort: string): string => {
  const s = sort.trim();
  if (!s) return DEFAULT_SORT;
  const alreadyHasId = s.split(/[;,]/).some((part) => part.trim().startsWith('id:'));
  return alreadyHasId ? s : `${s},${SORT_TIEBREAKER}`;
};

/**
 * แถวกลางที่ใช้ทั้งแสดงผลและ export — จุดเดียวในไฟล์นี้ที่ต้องรู้ว่าแถวดิบมาจากชนิดไหน
 * (`SeatLicenseRow` มี `business_unit_*` ส่วน `BuQuotaLicenseRow` มี `cluster_*`) ที่เหลือ
 * (column cells, CSV) อ่านจากรูปกลางนี้อย่างเดียว ไม่ต้องแตกสาขาตามชนิดซ้ำอีก — วันที่ถูก
 * format ไว้ล่วงหน้าแล้วเพื่อให้ตารางกับ CSV เห็นค่าเดียวกันเป๊ะเสมอ ส่วน `status` เก็บเป็น
 * enum ดิบ (`StatusFilterValue`) ไม่ใช่ label ที่แปลแล้ว — badge ในตารางและคอลัมน์ CSV
 * ต้อง resolve ผ่าน `statusLabel()` เองคนละจุด (ตารางใน `columns`, CSV ใน `handleExport`)
 * เพื่อไม่ผูก locale ไว้ในแถวกลาง แต่ทั้งสองจุดต้องเรียก `statusLabel()` ตัวเดียวกันเสมอ
 * ไม่งั้นค่าที่เห็นในตารางกับไฟล์ที่ export จะไม่ตรงกัน
 */
interface FleetLicenseRow {
  id: string;
  license_number: string;
  owner_code: string;
  owner_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  status: StatusFilterValue;
  reference_no: string;
  /**
   * มีค่าจริงเฉพาะใบโควตา BU (อ่านผ่าน `normalizeAudit` ไม่ใช่ `quota.created_at` ตรง ๆ — ดู
   * คอมเมนต์ที่ `toFleetRow`) ใบที่นั่ง (`BusinessUnitLicense`) ไม่มีคอลัมน์นี้ในฝั่ง backend เลย
   * จึงเป็น `null` เสมอ — ไม่ใช่บั๊ก
   */
  created_at?: string | null;
  /** ชื่อคนสร้างใบ — มีค่าจริงเฉพาะใบโควตา BU เช่นเดียวกับ `created_at` */
  created_by_name?: string;
  /**
   * คลัสเตอร์ที่เจ้าของใบสังกัด — มีค่าเฉพาะใบที่นั่ง (`SeatLicenseRow` พ่วง `cluster_*` มาให้)
   * ใบโควตา BU ไม่เซ็ตค่านี้เพราะคลัสเตอร์ **คือ** เจ้าของใบอยู่แล้ว (ดู `showCluster`)
   */
  cluster_code?: string;
  cluster_name?: string;
}

function toFleetRow(
  kind: LicenseKind,
  row: SeatLicenseRow | BuQuotaLicenseRow,
  now: Date,
  showNoExpiry: boolean,
  noExpiryLabel: string,
): FleetLicenseRow {
  const isSeat = kind === 'seat';
  const seat = row as SeatLicenseRow;
  const quota = row as BuQuotaLicenseRow;
  // สูตรสถานะสองชนิดไม่เท่ากัน (ดูคอมเมนต์ใน utils/buLicense.ts กับ utils/clusterLicense.ts) —
  // ห้ามคิดสูตรใหม่ที่นี่ เรียกของเดิมเท่านั้น เหมือนที่ LicensePurchaseForm.tsx ทำ
  const status = isSeat ? buLicenseStatus(seat, now) : clusterLicenseStatus(quota, now);
  // ใบที่นั่ง (BusinessUnitLicense) ไม่มี audit ในฝั่ง backend เลย — ใบโควตา BU มีจริงเพราะ
  // cluster-license.service.ts select มาให้แล้ว อ่านผ่าน normalizeAudit ไม่ใช่ quota.created_at
  // ตรง ๆ (เดิมทำแบบนั้นและไม่ได้ชื่อคนสร้างมาด้วย) เพื่อรองรับทั้งรูปแบนและรูป nested เหมือนทุกจุดอื่น
  const quotaAudit = isSeat ? {} : normalizeAudit(quota);
  return {
    id: row.id,
    license_number: row.license_number,
    owner_code: isSeat ? seat.business_unit_code : quota.cluster_code,
    owner_name: isSeat ? seat.business_unit_name : quota.cluster_name,
    amount: isSeat ? seat.licensed_users : quota.licensed_bus,
    start_date: fmtDate(row.start_date),
    end_date: showNoExpiry && isPerpetual(row.end_date) ? noExpiryLabel : fmtDate(row.end_date),
    status,
    reference_no: row.reference_no || '-',
    created_at: quotaAudit.created?.at ?? null,
    created_by_name: quotaAudit.created?.name,
    cluster_code: isSeat ? seat.cluster_code : undefined,
    cluster_name: isSeat ? seat.cluster_name : undefined,
  };
}

/**
 * เงื่อนไข `advance.where` จากสถานะที่เลือก — backend **ไม่มีคอลัมน์ status** ให้กรอง (controller
 * ruling R21) ต้องแปลเป็นช่วงวันที่บน `start_date`/`end_date` เอง และห้ามส่ง `filter=status:active`
 * เด็ดขาด เพราะ `status` ไม่ใช่คอลัมน์จริง ค่านั้นจะไหลเข้า Prisma ตรง ๆ แล้วได้ 500 ไม่ใช่ 400
 *
 * ขอบเขตสองชนิดไม่เท่ากัน: ที่นั่ง (`buLicense.ts`) นับ `end_date` เป็นวันสุดท้ายที่ยังคุ้มครองอยู่
 * (`t <= end` ยังถือว่า active) ส่วนโควตา BU (`clusterLicense.ts`) หมดอายุทันทีที่ถึง `end_date`
 * (`t < end` ถึงจะยัง active) — เงื่อนไข `lt`/`lte` ของ "expired"/"active" จึงต้องแยกตาม `kind`
 * ไม่งั้นแถวที่ badge ขึ้น "Active" จะไม่โผล่ในผลกรอง "Active" (หรือกลับกัน) พอดีวันที่ตรงขอบเขต
 */
function buildAdvance(kind: LicenseKind, status: StatusFilterValue | null): string {
  if (!status) return '';
  const now = new Date().toISOString();
  if (status === 'scheduled') return JSON.stringify({ where: { start_date: { gt: now } } });
  if (status === 'expired') {
    return JSON.stringify({ where: { end_date: kind === 'seat' ? { lt: now } : { lte: now } } });
  }
  return JSON.stringify({
    where: kind === 'seat'
      ? { start_date: { lte: now }, end_date: { gte: now } }
      : { start_date: { lte: now }, end_date: { gt: now } },
  });
}

export interface PurchaseLicenseTableProps {
  config: LicenseKindConfig;
}

/**
 * ตารางรายใบทั้ง fleet ของใบชนิดใดชนิดหนึ่ง (ที่นั่ง หรือ โควตา BU) — server-side ทั้งหมด
 * โครงตาม `ClusterLicenseTable.tsx`: search debounce + filter Sheet + ป้ายกดปิดทีละอัน + sort
 *
 * `loadFailed` แยกจาก "ไม่มีใบ" โดยตั้งใจ: ในระบบนี้ 0 ใบแปลว่าไม่มีความจุจริง การกลืน error
 * เป็นตารางว่างคือการโกหกผู้ใช้ว่าเขาไม่ได้ซื้ออะไรไว้เลย
 */
export function PurchaseLicenseTable({ config }: PurchaseLicenseTableProps) {
  const { t } = useI18n();
  // One lookup for every rendering of a status value in this file — both badges (the
  // license-status column and the active-filter chip) and the Sheet's filter buttons all
  // call this, so a given status can never read two ways on one page.
  const statusLabel = useCallback((s: StatusFilterValue) => t(STATUS_LABEL_KEYS[s]), [t]);
  const ownerLabel = t(OWNER_LABEL_KEYS[config.kind]);
  const amountLabel = t(AMOUNT_LABEL_KEYS[config.kind]);

  // คีย์ localStorage ผูกกับ config.kind เพื่อไม่ให้สองมุมมอง (seat / bu-quota) เหยียบ
  // page/perpage/sort/search/filter กันเอง — คอมโพเนนต์เดียวกันแต่ mount คนละอินสแตนซ์
  const pageKey = `page_${config.kind}_license`;
  const perpageKey = `perpage_${config.kind}_license`;
  const sortKey = `sort_${config.kind}_license`;
  const searchKey = `search_${config.kind}_license`;
  const statusKey = `filters_${config.kind}_license_status`;

  const [rows, setRows] = useState<FleetLicenseRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState(() => localStorage.getItem(searchKey) || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue | null>(() => {
    const raw = localStorage.getItem(statusKey);
    return (STATUS_VALUES as string[]).includes(raw ?? '') ? (raw as StatusFilterValue) : null;
  });

  const [paginate, setPaginate] = useState(() => ({
    page: Number(localStorage.getItem(pageKey)) || 1,
    perpage: Number(localStorage.getItem(perpageKey)) || 20,
    // ผ่าน withTiebreaker เสมอแม้ค่าที่อ่านมาจาก localStorage เพราะอาจเป็นค่าที่บันทึกไว้ก่อน
    // แก้บั๊กนี้ (ยังไม่มี `,id:asc` ต่อท้าย)
    sort: withTiebreaker(localStorage.getItem(sortKey) || ''),
  }));

  const resetPage = useCallback(() => {
    localStorage.setItem(pageKey, '1');
    setPaginate((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [pageKey]);

  // ค้นหา debounce 400ms — พิมพ์แต่ละตัวอักษรอัปเดตแค่ state ดิบที่ผูกกับ <SearchInput>
  // `onSettle` (=resetPage) รีเซ็ตหน้ากลับ 1 "ในจังหวะเดียวกัน" กับตอนค่า debounce นิ่งจริง
  // (ดูคอมเมนต์ยาวใน hooks/useDebouncedValue.ts) ปุ่ม clear ใช้ flushSearch แทนเพื่อไม่ต้องรอ
  const [debouncedSearch, flushSearch] = useDebouncedValue(search, 400, resetPage);

  const searchInputRef = useRef<HTMLInputElement>(null);
  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: PaginateParams = {
        page: paginate.page,
        perpage: paginate.perpage,
        sort: paginate.sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        advance: buildAdvance(config.kind, statusFilter),
      };
      const data = await config.service.listPlatform(params);
      const now = new Date();
      const noExpiryLabel = t('common.state.noExpiry');
      setRows(data.data.map((r) => toFleetRow(config.kind, r, now, config.showNoExpiry, noExpiryLabel)));
      setTotalRows(data.paginate?.total ?? data.data.length);
      setLoadFailed(false);
    } catch (err: unknown) {
      // รีเซ็ตกลับค่าปลอดภัย — ไม่ปล่อยแถวเก่าค้างไว้เบื้องหลัง error state (ดูคอมเมนต์ที่
      // `loadFailed` ด้านล่าง: 0 ใบกับโหลดไม่ได้ต้องแยกกันเด็ดขาด ไม่ใช่แค่ตอนแสดงผล)
      setRows([]);
      setTotalRows(0);
      setLoadFailed(true);
      devLog(`Failed to load ${config.kind} licenses:`, err);
    } finally {
      setLoading(false);
    }
  }, [config, paginate, debouncedSearch, statusFilter, t]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    localStorage.setItem(searchKey, value);
  };

  const handleSearchClear = () => {
    setSearch('');
    localStorage.setItem(searchKey, '');
    flushSearch('');
    resetPage();
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem(perpageKey, String(perpage));
    localStorage.setItem(pageKey, String(page));
    setPaginate((p) => ({ ...p, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    const next = withTiebreaker(sort);
    localStorage.setItem(sortKey, next);
    localStorage.setItem(pageKey, '1');
    setPaginate((p) => ({ ...p, sort: next, page: 1 }));
  };

  // สถานะเป็น partition ตามเวลา — active/scheduled/expired ไม่มีวันทับกัน ต่างจากตัวกรองบูลีน
  // อิสระต่อกันของ ClusterLicenseTable (ที่นั่น AND กันได้เพราะแกนต่างกันจริง) ตัวกรองนี้จึงเลือก
  // ได้ทีละสถานะ (คลิกซ้ำ = ล้างกลับเป็น "ทั้งหมด") ไม่ใช่ multi-select ที่ต้องประกอบ OR
  const handleStatusFilter = (value: StatusFilterValue) => {
    const next = statusFilter === value ? null : value;
    setStatusFilter(next);
    localStorage.setItem(statusKey, next ?? '');
    resetPage();
  };

  const handleClearFilters = () => {
    setStatusFilter(null);
    localStorage.setItem(statusKey, '');
    resetPage();
  };

  const activeFilterCount = statusFilter ? 1 : 0;

  const handleExport = () => {
    // export เฉพาะหน้าปัจจุบันที่โหลดมาแล้ว (`rows`) ไม่ยิงคำขอ perpage:-1 แยกต่างหาก —
    // แพทเทิร์นเดิมเคยทำแบบนั้นแล้วเลิกใช้ (ดู memory: List summary block เลิก perpage:-1)
    // และตรงกับ SubscriptionTable.tsx ที่ export `items` ของหน้าปัจจุบันเช่นกัน
    const csvRows = rows.map((r) => ({
      ...r,
      ...auditCsvFields(normalizeAudit(r)),
      status: statusLabel(r.status),
    }));
    const csv = generateCSV(csvRows, [
      { key: 'license_number', label: t('pages.licenses.licenseNumber') },
      { key: 'owner_code', label: t('pages.licenses.ownerCodeColumn', { owner: ownerLabel }) },
      { key: 'owner_name', label: t('pages.licenses.ownerNameColumn', { owner: ownerLabel }) },
      { key: 'amount', label: amountLabel },
      { key: 'start_date', label: t('common.field.startDate') },
      { key: 'end_date', label: t('common.field.endDate') },
      { key: 'status', label: t('common.status.label') },
      { key: 'reference_no', label: t('pages.licenses.referenceNoColumn') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `${config.kind}-licenses-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const columns = useMemo<ColumnDef<FleetLicenseRow, unknown>[]>(() => {
    // FleetLicenseRow ไม่มี updated_at เลย และ toFleetRow() ก็ไม่มีทางเซ็ตให้ได้ เพราะ DTO
    // ทั้งสองฝั่ง backend (BusinessUnitLicenseListRowDto, ClusterLicenseListRowDto) ไม่ส่ง
    // updated_at มาเลยสักตัว — ต่างจาก created_at (ดูคอมเมนต์ที่ interface ด้านบน) ที่ใบโควตา
    // BU มีข้อมูลจริง คอลัมน์ Updated ที่นี่จะว่างถาวรเพราะ mapping เป็นตัวกั้น ไม่ใช่รอ backend
    // ส่งเพิ่มในอนาคตเหมือนตาราง licenses/ อื่น (เจอกรณีเดียวกันมาแล้วที่ SuperAdminManagement
    // และ broadcastColumns.tsx) จึงหยิบมาแค่คอลัมน์ Created ตัวเดียว
    const [createdColumn] = auditColumns<FleetLicenseRow>({ t });
    return [
      {
        accessorKey: 'license_number',
        header: t('pages.licenses.licenseNumber'),
        meta: { card: 'title' },
        cell: ({ row }) => (
          <Link
            to={`/licenses/${config.editPathSegment}/${row.original.id}/edit?ownerLabel=${
              encodeURIComponent(`${row.original.owner_code} - ${row.original.owner_name}`)
            }`}
            className="text-primary hover:underline whitespace-nowrap"
          >
            {row.original.license_number}
          </Link>
        ),
      },
      ...(config.showCluster
        ? [{
            id: 'cluster',
            header: t('common.label.cluster'),
            // cluster_code/cluster_name มาจาก join ผ่าน business_unit_id → tb_cluster ไม่ใช่คอลัมน์
            // จริงบนตารางใบ — เรียงไม่ได้ ด้วยเหตุผลเดียวกับคอลัมน์ owner ข้างล่าง
            enableSorting: false,
            cell: ({ row }: { row: Row<FleetLicenseRow> }) => (
              <div className="flex flex-col">
                <span>{row.original.cluster_name || '-'}</span>
                <span className="text-xs text-muted-foreground font-mono">{row.original.cluster_code}</span>
              </div>
            ),
          } as ColumnDef<FleetLicenseRow, unknown>]
        : []),
      {
        id: 'owner',
        header: ownerLabel,
        // เจ้าของมาจาก join ผ่าน business_unit_id/cluster_id ไม่ใช่คอลัมน์ตรงบนตารางใบ — ไม่อยู่ใน
        // รายการคอลัมน์ที่ design doc ยืนยันว่าเรียงได้ (license_number, start_date, end_date, จำนวน)
        // ปิดการเรียงไว้ก่อนเพื่อความปลอดภัยแทนที่จะเดา
        enableSorting: false,
        meta: { card: 'title' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.owner_name}</span>
            <span className="text-xs text-muted-foreground font-mono">{row.original.owner_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'amount',
        // id คือชื่อฟิลด์จริงบนสาย (`licensed_users`/`licensed_bus`) ไม่ใช่ `amount` ที่เป็นชื่อ
        // ฟิลด์กลางในไฟล์นี้ — DataTable ส่ง id นี้ตรงไปเป็นค่า `sort` ให้ backend
        id: config.amountField,
        header: amountLabel,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.amount}</span>,
      },
      {
        id: 'coverage',
        header: t('pages.licenses.coverageColumn'),
        // ครอบคลุมสองคอลัมน์จริง (start_date, end_date) การเรียงคลิกเดียวไม่มีความหมายชัดเจนว่า
        // เรียงด้วยฟิลด์ไหน จึงปิดไว้ — สองฟิลด์นั้นเรียงได้จริงถ้าจะเปิดคอลัมน์แยกในอนาคต
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {row.original.start_date} – {row.original.end_date}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('common.status.label'),
        // คำนวณฝั่ง FE จากวันที่ ไม่ใช่คอลัมน์จริงบน backend (controller ruling R21) — เรียงไม่ได้
        enableSorting: false,
        // การ์ดมือถือ: เหมือน SubscriptionTable.tsx's `state` column — badge ไปโผล่ที่หัวการ์ดคู่กับ
        // title แทนที่จะตกลงไปเป็นแถว "Status: [badge]" ใน <dl> เฉย ๆ — สองแท็บของหน้าเดียวกันต้อง
        // เรนเดอร์การ์ดแบบเดียวกัน
        meta: { card: 'badge' },
        // ไม่มี `className="capitalize"` แล้ว — ค่าจากตัวคำนวณเป็น Title Case อยู่แล้วตอนภาษาอังกฤษ
        // (ดู statusLabel/common.status.*) ภาษาไทยไม่มี case ให้ capitalize เลยแปล
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {statusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: 'reference_no',
        header: t('pages.licenses.referenceNoColumn'),
        // ค้นหาได้ (`license_number`/`reference_no` เป็นสอง searchfields เดียวที่ backend รับ)
        // แต่ไม่อยู่ในรายการคอลัมน์ที่ยืนยันว่าเรียงได้
        enableSorting: false,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reference_no}</span>,
      },
      createdColumn,
    ];
  }, [config, t, ownerLabel, amountLabel, statusLabel]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || loadFailed || rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {t('common.action.export')}
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              ref={searchInputRef}
              value={search}
              onValueChange={handleSearchChange}
              onClear={handleSearchClear}
              placeholder={t('pages.licenses.searchLicensesPlaceholder')}
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
                  <SheetDescription>{t('pages.licenses.filterByStatusDescription')}</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6 px-1">
                  <div className="space-y-3">
                    <span className="text-sm font-medium">{t('common.status.label')}</span>
                    <div className="flex flex-wrap gap-1">
                      {STATUS_VALUES.map((value) => (
                        <Button
                          key={value}
                          variant={statusFilter === value ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter(value)}
                        >
                          {statusLabel(value)}
                        </Button>
                      ))}
                    </div>
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

          {activeFilterCount > 0 && statusFilter && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                {statusLabel(statusFilter)}
                <button type="button" onClick={handleClearFilters} aria-label={t('pages.licenses.removeStatusFilterAria')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loadFailed ? (
            <EmptyState
              icon={AlertTriangle}
              title={t('pages.licenses.loadFailedTitle')}
              description={t('pages.licenses.loadFailedDescription')}
              action={
                <Button variant="outline" size="sm" onClick={() => fetchRows()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
                  {loading ? t('pages.licenses.retryingEllipsis') : t('common.action.retry')}
                </Button>
              }
            />
          ) : loading && rows.length === 0 ? (
            // +1 เผื่อคอลัมน์ลำดับแถวที่ DataTable ใส่ให้เองเสมอ
            <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('pages.licenses.noLicensesTitle')}
              description={
                search || activeFilterCount > 0
                  ? t('pages.licenses.noLicensesMatchFilters')
                  : t('pages.licenses.noLicensesIssuedYet')
              }
              action={
                search || activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => { handleSearchClear(); handleClearFilters(); }}>
                    {t('pages.licenses.clearFiltersAction')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                     role="status" aria-label={t('pages.licenses.loadingLicensesAria')}>
                  <div className="text-muted-foreground">{t('common.busy.loading')}</div>
                </div>
              )}
              <DataTable
                columns={columns}
                data={rows}
                serverSide
                tableLayout="auto"
                // 2 = # + License Number เท่านั้น — คอลัมน์ที่ 3 (Cluster สำหรับใบที่นั่ง /
                // Business Unit ก่อนหน้านี้) เลื่อนหายไปกับตารางได้: ทุกคอลัมน์ที่ตรึงคือความกว้าง
                // ที่ผู้อ่านเลื่อนหนีไม่ได้ (agent-os/standards/styling/table-sticky-columns.md)
                stickyLeftColumns={2}
                totalRows={totalRows}
                page={paginate.page}
                perpage={paginate.perpage}
                onPaginateChange={handlePaginateChange}
                onSortChange={handleSortChange}
                defaultSort={{ id: DEFAULT_SORT_ID, desc: DEFAULT_SORT_DESC }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
