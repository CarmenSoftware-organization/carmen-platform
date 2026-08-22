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
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { devLog } from '../../utils/errorParser';
import { fmtDate, isPerpetual } from './licenseDates';
import { licenseStatus as buLicenseStatus } from '../../utils/buLicense';
import { licenseStatus as clusterLicenseStatus } from '../../utils/clusterLicense';
import type { LicenseKind, LicenseKindConfig } from './licenseKindConfig';
import type { SeatLicenseRow, BuQuotaLicenseRow, PaginateParams } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';

type StatusFilterValue = 'active' | 'scheduled' | 'expired';

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
];

const STATUS_VARIANT: Record<StatusFilterValue, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'secondary',
  expired: 'destructive',
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
 * (column cells, CSV) อ่านจากรูปกลางนี้อย่างเดียว ไม่ต้องแตกสาขาตามชนิดซ้ำอีก — วันที่และสถานะ
 * ถูก format/คำนวณไว้ล่วงหน้าแล้วเพื่อให้ตารางกับ CSV เห็นค่าเดียวกันเป๊ะเสมอ
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
}

function toFleetRow(
  kind: LicenseKind,
  row: SeatLicenseRow | BuQuotaLicenseRow,
  now: Date,
  showNoExpiry: boolean,
): FleetLicenseRow {
  const isSeat = kind === 'seat';
  const seat = row as SeatLicenseRow;
  const quota = row as BuQuotaLicenseRow;
  // สูตรสถานะสองชนิดไม่เท่ากัน (ดูคอมเมนต์ใน utils/buLicense.ts กับ utils/clusterLicense.ts) —
  // ห้ามคิดสูตรใหม่ที่นี่ เรียกของเดิมเท่านั้น เหมือนที่ LicensePurchaseForm.tsx ทำ
  const status = isSeat ? buLicenseStatus(seat, now) : clusterLicenseStatus(quota, now);
  return {
    id: row.id,
    license_number: row.license_number,
    owner_code: isSeat ? seat.business_unit_code : quota.cluster_code,
    owner_name: isSeat ? seat.business_unit_name : quota.cluster_name,
    amount: isSeat ? seat.licensed_users : quota.licensed_bus,
    start_date: fmtDate(row.start_date),
    end_date: showNoExpiry && isPerpetual(row.end_date) ? 'No expiry' : fmtDate(row.end_date),
    status,
    reference_no: row.reference_no || '-',
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
    return STATUS_OPTIONS.some((o) => o.value === raw) ? (raw as StatusFilterValue) : null;
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
      setRows(data.data.map((r) => toFleetRow(config.kind, r, now, config.showNoExpiry)));
      setTotalRows(data.paginate?.total ?? data.data.length);
      setLoadFailed(false);
    } catch (err: unknown) {
      // รีเซ็ตกลับค่าปลอดภัย — ไม่ปล่อยแถวเก่าค้างไว้เบื้องหลัง error state (ดูคอมเมนต์ที่
      // `loadFailed` ด้านล่าง: 0 ใบกับโหลดไม่ได้ต้องแยกกันเด็ดขาด ไม่ใช่แค่ตอนแสดงผล)
      setRows([]);
      setTotalRows(0);
      setLoadFailed(true);
      devLog(`Failed to load ${config.kind} licences:`, err);
    } finally {
      setLoading(false);
    }
  }, [config, paginate, debouncedSearch, statusFilter]);

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
    const csv = generateCSV(rows, [
      { key: 'license_number', label: 'License Number' },
      { key: 'owner_code', label: `${config.ownerLabel} Code` },
      { key: 'owner_name', label: `${config.ownerLabel} Name` },
      { key: 'amount', label: config.amountLabel },
      { key: 'start_date', label: 'Start Date' },
      { key: 'end_date', label: 'End Date' },
      { key: 'status', label: 'Status' },
      { key: 'reference_no', label: 'Reference No' },
    ]);
    downloadCSV(csv, `${config.kind}-licenses-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const columns = useMemo<ColumnDef<FleetLicenseRow, unknown>[]>(() => [
    {
      accessorKey: 'license_number',
      header: 'License Number',
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
    {
      id: 'owner',
      header: config.ownerLabel,
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
      header: config.amountLabel,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.amount}</span>,
    },
    {
      id: 'coverage',
      header: 'Coverage',
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
      header: 'Status',
      // คำนวณฝั่ง FE จากวันที่ ไม่ใช่คอลัมน์จริงบน backend (controller ruling R21) — เรียงไม่ได้
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'reference_no',
      header: 'Reference No',
      // ค้นหาได้ (`license_number`/`reference_no` เป็นสอง searchfields เดียวที่ backend รับ)
      // แต่ไม่อยู่ในรายการคอลัมน์ที่ยืนยันว่าเรียงได้
      enableSorting: false,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reference_no}</span>,
    },
  ], [config]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || loadFailed || rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export
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
              placeholder="Search by license number or reference..."
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
                  <SheetDescription>Filter by licence status</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6 px-1">
                  <div className="space-y-3">
                    <span className="text-sm font-medium">Status</span>
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map(({ value, label }) => (
                        <Button
                          key={value}
                          variant={statusFilter === value ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearFilters}>
                      <X className="mr-1 h-3 w-3" />
                      Clear all filters
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {activeFilterCount > 0 && statusFilter && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 capitalize">
                {statusFilter}
                <button type="button" onClick={handleClearFilters} aria-label="Remove status filter">
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
              title="Could not load licences"
              description="The list could not be loaded — this does not mean there are none."
              action={
                <Button variant="outline" size="sm" onClick={() => fetchRows()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
                  {loading ? 'Retrying...' : 'Retry'}
                </Button>
              }
            />
          ) : loading && rows.length === 0 ? (
            // +1 เผื่อคอลัมน์ลำดับแถวที่ DataTable ใส่ให้เองเสมอ
            <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No licences"
              description={
                search || activeFilterCount > 0
                  ? 'No licence matches the current search and filters.'
                  : 'No licences have been issued yet.'
              }
              action={
                search || activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => { handleSearchClear(); handleClearFilters(); }}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                     role="status" aria-label="Loading licences">
                  <div className="text-muted-foreground">Loading...</div>
                </div>
              )}
              <DataTable
                columns={columns}
                data={rows}
                serverSide
                tableLayout="auto"
                stickyLeftColumns={3}
                totalRows={totalRows}
                page={paginate.page}
                perpage={paginate.perpage}
                onPaginateChange={handlePaginateChange}
                onSortChange={handleSortChange}
                defaultSort={{ id: 'license_number', desc: false }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PurchaseLicenseTable;
