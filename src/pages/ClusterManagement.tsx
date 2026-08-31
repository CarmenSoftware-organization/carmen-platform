import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import clusterService from '../services/clusterService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Network, Download, History } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
import { useRowActivityTrail } from '../components/activityTrail/useRowActivityTrail';
import { AUDIT_RECORDING_STARTED_ON_PHASE_2 } from '../components/activityTrail/constants';
import { BrandMark } from '../components/BrandMark';
import { FleetCapacity } from './clusterManagement/FleetCapacity';
import { CapacityMeter } from './clusterManagement/CapacityMeter';
import { isPerpetual } from '../utils/clusterLicense';
import { auditColumns } from '../components/auditColumns';
import { useI18n } from '../hooks/useI18n';
import { cn } from '../lib/utils';
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { FleetSummary } from '../types';
import type { Cluster, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

// วันที่ล้วน (yyyy-mm-dd) สำหรับคอลัมน์ Quota Expires — ตามแบบ inline formatter ของ repo
// (ดูหมวด DateTime ใน CLAUDE.md) แต่ตัดส่วนเวลาออกเพราะ end_date ของใบเป็นวันที่ ไม่ใช่ timestamp
// ที่ผู้ใช้สนใจนาที-วินาที
const fmtDate = (v?: string | null): string => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ClusterManagement: React.FC = () => {
  const navigate = useNavigate();
  const activityTrail = useRowActivityTrail();
  const { t } = useI18n();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_clusters') || '';
  const storedFilters = getStoredJSON<string[]>('filters_clusters', []);
  const storedPage = Number(localStorage.getItem('page_clusters')) || 1;
  const storedSort = localStorage.getItem('sort_clusters') || 'created_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showDeleted, setShowDeleted] = useState<boolean>(getStoredJSON<boolean>('filter_clusters_deleted', false));
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState(false);

  const buildAdvance = (filters: string[], includeDeleted: boolean, expiringSoon = false) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) {
      where.is_active = filters[0] === 'true';
    }
    if (!includeDeleted) {
      where.deleted_at = null;
    }
    if (expiringSoon) {
      // ไม่ใช่คอลัมน์จริง — backend ถอดคีย์นี้ออกแล้วแปลงเป็น id list ผ่าน view v_cluster_bu_cap
      // (เงื่อนไข "ใบไหนชนะ + เหลือกี่วัน" อยู่ในฐานข้อมูล ไม่ใช่ที่นี่) frontend จึงไม่มีสำเนา
      // ของกติกาให้เพี้ยนได้เลย
      // Not a real column: the backend strips this marker and resolves it through the view, so
      // the frontend holds no copy of the rule that could drift.
      where.bu_quota_expiring_soon = true;
    }
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem("perpage_clusters")) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(
      storedFilters,
      getStoredJSON<boolean>('filter_clusters_deleted', false),
      getStoredJSON<boolean>('filter_clusters_quota_expiring', false),
    ),
    filter: {},
  });

  // ตัวกรอง "โควตาใกล้หมดอายุ" — persist เหมือนตัวกรองอื่นของหน้านี้ เพื่อให้ผู้ใช้ที่กดไว้แล้ว
  // รีเฟรชหน้ายังเห็นชุดเดิม (pattern เดียวกับ filter_subscription_expiring_soon)
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<boolean>(
    getStoredJSON<boolean>('filter_clusters_quota_expiring', false),
  );

  const handleExpiringSoonToggle = () => {
    const next = !expiringSoonFilter;
    setExpiringSoonFilter(next);
    localStorage.setItem('filter_clusters_quota_expiring', JSON.stringify(next));
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({
      ...prev,
      page: 1,
      advance: buildAdvance(statusFilter, showDeleted, next),
    }));
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Latest clusters, so the (stable) delete handler can read bu_count without
  // re-memoising the columns each fetch.
  const clustersRef = useRef(clusters);
  useEffect(() => {
    clustersRef.current = clusters;
  }, [clusters]);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchClusters = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await clusterService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      // Created/Updated/Deleted are all read via `normalizeAudit`, which handles both the
      // nested `audit.*` shape and the older flat shape itself — no hand-rolled fallback here.
      const mapped = (Array.isArray(items) ? items : []).map((item: any) => {
        const deleted = normalizeAudit(item).deleted;
        return {
          ...item,
          bu_count: item.bu_count ?? item._count?.tb_business_unit ?? 0,
          users_count: item.users_count ?? item._count?.tb_cluster_user ?? 0,
          // โควตามาจากใบที่ชนะ (Task 7) — 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด", แทนที่ max_license_bu เดิม
          bu_cap: item.bu_cap ?? 0,
          bu_used: item.bu_used ?? item.bu_count ?? 0,
          total_max_license_users: item.total_max_license_users ?? undefined,
          deleted_at: deleted?.at,
          deleted_by_name: deleted?.name,
        };
      });
      setClusters(mapped);
      setTotalRows(data.paginate?.total ?? data.total ?? mapped.length);
      setError('');
    } catch (err: unknown) {
      setError(t('pages.clusters.loadFailed', { detail: getErrorDetail(err, t) }));
      devLog('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchClusters(paginate);
  }, [fetchClusters, paginate]);

  // แถบความจุอ่านจาก endpoint เฉพาะทางที่ไม่รับตัวกรองเลย ตัวเลขจึงเป็นของทั้ง fleet เสมอ
  // ไม่ขยับตามช่องค้นหาหรือ filter ของตารางด้านล่าง — ซึ่งเป็นสิ่งที่ปุ่มสถิติ "quota expiring"
  // ต้องการ เพราะมันมีไว้ *เปิด* filter ถ้าตัวเลขมาจากผลที่ filter แล้วปุ่มจะดับเมื่อค้นหาอย่างอื่น
  //
  // The band reads a dedicated endpoint that takes no filter, so the numbers always describe
  // the whole fleet. That is what the "quota expiring" stat needs: it exists to APPLY a filter,
  // so a count derived from an already-filtered set makes the button a dead end.
  //
  // จงใจไม่มี fallback ไปที่ `getAll({ perpage: 1 })` — fallback แบบนั้นคือสิ่งที่ทำให้หน้านี้
  // มีสามแหล่งข้อมูลตั้งแต่แรก ถ้า endpoint ยังไม่ deploy ให้แถบบอกตรงๆ ว่าโหลดไม่ได้
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const summary = await clusterService.getFleetSummary();
      setFleet(summary);
      setFleetError(false);
    } catch (err: unknown) {
      devLog('Error loading fleet summary:', err);
      setFleetError(true);
    } finally {
      setFleetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_clusters', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_clusters', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_clusters", String(perpage));
    localStorage.setItem('page_clusters', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_clusters', JSON.stringify(next));
    localStorage.setItem('page_clusters', '1');
    const advance = buildAdvance(next, showDeleted, expiringSoonFilter);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleShowDeletedToggle = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    localStorage.setItem('filter_clusters_deleted', JSON.stringify(next));
    localStorage.setItem('page_clusters', '1');
    const advance = buildAdvance(statusFilter, next, expiringSoonFilter);
    setPaginate(prev => ({ ...prev, page: 1, advance, filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_clusters', JSON.stringify([]));
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], showDeleted, expiringSoonFilter), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setShowDeleted(false);
    // ตัวกรอง "โควตาใกล้หมดอายุ" ถูกล้างด้วย แม้จะกดมาจากแถบสรุปไม่ใช่จาก Sheet ตัวกรอง —
    // สิ่งที่ผู้ใช้เห็นบนจอต้องเท่ากับสิ่งที่ส่งไป backend เสมอ ปล่อยไว้จะกลายเป็นตัวกรองที่ยัง
    // ทำงานอยู่โดยไม่มีอะไรบนหน้าจอบอกว่ามันเปิดอยู่
    // Cleared here too even though it is toggled from the summary band, not the filter Sheet:
    // what the user sees must equal what is sent, or this becomes an invisible active filter.
    setExpiringSoonFilter(false);
    localStorage.setItem('filters_clusters', JSON.stringify([]));
    localStorage.setItem('filter_clusters_deleted', JSON.stringify(false));
    localStorage.setItem('filter_clusters_quota_expiring', JSON.stringify(false));
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], false, false), filter: {} }));
  };

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) + (showDeleted ? 1 : 0) + (expiringSoonFilter ? 1 : 0);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_clusters', sort);
    localStorage.setItem('page_clusters', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    // Guard: deleting a cluster does not cascade to its business units on the
    // backend, so a cluster with BUs would orphan them (they'd keep pointing at
    // a soft-deleted cluster). Block it here until the backend cascades/reassigns.
    const cluster = clustersRef.current.find((c) => c.id === id);
    const buCount = cluster?.bu_count ?? 0;
    if (buCount > 0) {
      toast.error(
        t('pages.clusters.cantDelete', { name: cluster?.name || t('pages.clusters.thisCluster') }),
        {
          description:
            buCount === 1
              ? t('pages.clusters.stillHasBu', { count: buCount })
              : t('pages.clusters.stillHasBus', { count: buCount }),
        },
      );
      return;
    }
    setDeleteId(id);
  }, [t]);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await clusterService.delete(deleteId);
      toast.success(t('toast.deleted', { entity: t('entity.cluster.title') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
      loadFleet();
    } catch (err: unknown) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.cluster.lower') }), {
        description: getErrorDetail(err, t),
      });
    }
  };

  const handleExport = () => {
    // ใบตลอดชีพ (sentinel ปี 2099) ต้องไม่โชว์ปี 2099 ในไฟล์ CSV เหมือนกับที่ตารางไม่โชว์ — ต้อง
    // แปลงค่าก่อนส่งเข้า generateCSV เพราะมันอ่านฟิลด์ดิบตรง ๆ ไม่มี formatter ต่อคอลัมน์
    // The perpetual sentinel (year 2099) must not leak into the CSV any more than it does into
    // the table — generateCSV reads raw fields with no per-column formatter, so this pre-formats
    // the value before handing rows to it.
    const rows = clusters.map((c) => {
      const d = c.bu_cap_end_date;
      const buCapEndDate = !d ? '' : isPerpetual(d) ? t('common.state.noExpiry') : fmtDate(d);
      return { ...c, bu_cap_end_date: buCapEndDate, ...auditCsvFields(normalizeAudit(c)) };
    });
    const csv = generateCSV(rows, [
      { key: 'code', label: t('common.field.code') },
      { key: 'name', label: t('common.field.name') },
      { key: 'alias_name', label: t('common.field.alias') },
      { key: 'is_active', label: t('common.status.label') },
      { key: 'bu_cap', label: t('pages.clusters.columnBuQuota') },
      { key: 'bu_cap_end_date', label: t('common.state.quotaExpires') },
      { key: 'users_count', label: t('nav.users') },
      { key: 'total_max_license_users', label: t('pages.clusters.columnMaxLicensedUsers') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `clusters-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.field.code'),
      // Fixed width so the sticky offset of the 3rd frozen column (Name) is
      // deterministic — see `stickyLeftColumns={3}` and `.table-sticky-left-3`.
      meta: { headerClassName: 'w-24', cellClassName: 'w-24', card: 'title' },
      // Code กับ Name ชี้ปลายทางเดียวกันและซ้ำข้อความกันบ่อย (PPP/PPP, ZEBRA/ZEBRA) — เดิม
      // ทั้งคู่เป็นลิงก์สีน้ำเงิน ทำให้ทุกแถวมีจุดสีสองจุดที่ไม่ได้แปลว่าอะไรต่างกัน ตอนนี้ Name
      // ถือสีลิงก์ไว้คนเดียว ส่วน Code เป็นรหัสแบบ mono ที่ยังคลิกได้ (สีมาเมื่อ hover)
      cell: ({ row }) => (
        <Link
          to={`/clusters/${row.original.id}/edit`}
          className="text-muted-foreground hover:text-primary font-mono text-xs whitespace-nowrap"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('common.field.name'),
      meta: { card: 'title' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BrandMark
            src={row.original.avatar?.url}
            name={row.original.name}
            code={row.original.code}
          />
          <Link to={`/clusters/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
            {row.original.name}
          </Link>
          {row.original.deleted_at && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0" title={row.original.deleted_by_name ? t('pages.clusters.deletedByTitle', { name: row.original.deleted_by_name }) : undefined}>
              {t('common.status.deleted')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-32', cellClassName: 'w-32', card: 'badge' },
      // `Active` คือค่าปกติของเกือบทุกแถว — badge ทึบทำให้หมึกที่หนักที่สุดในหน้าไปกองอยู่กับ
      // ข้อมูลที่แทบไม่แปรผัน แล้วกลบแถวที่ชนเพดานจริง จุดเล็ก + คำที่จางพอสำหรับ active,
      // ตัวอักษรเข้มสำหรับ inactive ซึ่งเป็นตัวที่ผู้ใช้ต้องสังเกต (สีไม่ใช่สัญญาณเดียว: มีคำกำกับเสมอ)
      cell: ({ row }) => {
        const active = row.original.is_active;
        return (
          <span
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap text-xs',
              active ? 'text-muted-foreground' : 'text-foreground font-medium',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                active ? 'bg-success' : 'border border-muted-foreground/70',
              )}
            />
            {active ? t('common.status.active') : t('common.status.inactive')}
          </span>
        );
      },
    },
    {
      id: 'bu_count',
      // TanStack ให้ `getCanSort()` เป็น false เสมอถ้าคอลัมน์ไม่มี accessor — `enableSorting: true`
      // อย่างเดียวไม่พอ หัวคอลัมน์จะไม่กลายเป็นปุ่มด้วยซ้ำ · การเรียงจริงทำที่ backend (server-side)
      // ค่าที่ accessor คืนจึงไม่ได้ถูกใช้เรียง แต่ต้องมีเพื่อปลดล็อกปุ่ม
      accessorFn: (row) => row.bu_used,
      header: t('pages.clusters.columnBusinessUnits'),
      // โควตามาจากใบที่ชนะ (Task 7) — bu_cap เป็น 0 จริงเมื่อไม่มีใบ ไม่ใช่ "ไม่จำกัด" แทนที่
      // max_license_bu เดิม
      cell: ({ row }) => (
        <CapacityMeter used={row.original.bu_used} cap={row.original.bu_cap} finite />
      ),
      // เรียงตาม **used** (ตัวเลขตัวแรกที่หัวคอลัมน์แสดง) ไม่ใช่ cap — backend ทำใน SQL
      // ผ่านคิวรีที่ join view (`sortedClusterIdsByViewColumn`) เพราะค่าไม่ได้อยู่ใน tb_cluster
      enableSorting: true,
    },
    {
      id: 'bu_cap_end_date',
      // ดูเหตุผลที่ต้องมี accessor ในคอลัมน์ bu_count ด้านบน
      accessorFn: (row) => row.bu_cap_end_date,
      header: t('common.state.quotaExpires'),
      // ใบตลอดชีพ (sentinel ปี 2099) ต้องไม่โชว์ปี 2099 ให้ผู้ใช้เห็น
      // สาม state ที่ต้องแยกจากกันได้เสมอ (ห้ามยุบ "ไม่มีใบ" กับ "ไม่มีวันหมดอายุ" เข้าด้วยกัน
      // — คนละเรื่อง) แต่ไม่ต้องดังเท่ากัน: "No expiry" คือค่าที่แทบทุกแถวเป็น จึงจางที่สุด
      // ส่วนวันที่จริงคือแถวที่มีนาฬิกาเดินอยู่ — ตัวเดียวที่ควรสะดุดตาในคอลัมน์นี้
      cell: ({ row }) => {
        const d = row.original.bu_cap_end_date;
        if (!d) return <span className="text-muted-foreground/60">—</span>;
        return isPerpetual(d) ? (
          <span className="text-muted-foreground/70 text-[11px]">{t('common.state.noExpiry')}</span>
        ) : (
          <span className="text-foreground font-mono text-xs font-medium tabular-nums">{fmtDate(d)}</span>
        );
      },
      // cluster ที่ไม่มีใบโควตาจะอยู่ท้ายเสมอทั้งสองทิศ (NULLS LAST ฝั่ง SQL) — "ไม่มีใบ"
      // ไม่ใช่ "หมดอายุเร็วที่สุด"
      enableSorting: true,
    },
    {
      id: 'user_count',
      // ดูเหตุผลที่ต้องมี accessor ในคอลัมน์ bu_count ด้านบน
      accessorFn: (row) => row.users_count,
      header: t('nav.users'),
      // `total_max_license_users` = backend aggregate of per-BU caps; 0 / null / absent = no cap.
      cell: ({ row }) => (
        <CapacityMeter used={row.original.users_count} cap={row.original.total_max_license_users} />
      ),
      // เรียงตามจำนวนผู้ถือที่นั่งจริง (`users_count`) ด้วยนิยามเดียวกับที่ตัวเลขในช่องใช้ —
      // backend อ่านจาก `clusterHeadsSubquery()` ตัวเดียวกับ `countClusterHeads`
      enableSorting: true,
    },
    // สองคอลัมน์นี้เป็นเมตาดาต้า ไม่ใช่คำตอบของคำถามที่คนเปิดหน้านี้มาถาม — คงคอลัมน์ไว้ครบ
    // (ทั้งคู่ยังเรียงได้ และ created_at ยังเป็น default sort) แต่ลดน้ำหนักหัวคอลัมน์ลงจาก
    // ระดับเดียวกับ Name/Users และตรึงความกว้างไม่ให้ชื่อคนยาว ๆ ดันคอลัมน์ข้อมูลจริงให้แคบลง
    ...auditColumns<Cluster>({ hideUpdatedOnCard: true, t }).map((c) => ({
      ...c,
      meta: { ...(c.meta ?? {}), headerClassName: 'w-28 font-normal text-muted-foreground/70', cellClassName: 'w-28' },
    })),
    ...(showDeleted ? [{
      id: 'deleted_at',
      header: t('common.audit.deletedDate'),
      cell: ({ row }: { row: { original: Cluster } }) => (
        <AuditMeta
          variant="cell"
          actor={normalizeAudit(row.original).deleted}
          className="text-[11px] leading-tight text-destructive space-y-0.5"
        />
      ),
      enableSorting: false,
    } as ColumnDef<Cluster, unknown>] : []),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.action.rowActions', { name: row.original.name || row.original.code })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="cluster.update" clusterId={row.original.id}>
              <DropdownMenuItem onClick={() => navigate(`/clusters/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="activity_log.read" clusterId={row.original.id}>
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
            <Can permission="cluster.delete" clusterId={row.original.id}>
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, showDeleted, t, activityTrail]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('pages.clusters.title')}
          subtitle={t('pages.clusters.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || clusters.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="cluster.create">
                <Button onClick={() => navigate('/clusters/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.clusters.addCluster')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <FleetCapacity
          summary={fleet}
          loading={fleetLoading}
          error={fleetError}
          onExpiringSoonClick={handleExpiringSoonToggle}
          expiringSoonActive={expiringSoonFilter}
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('pages.clusters.searchPlaceholder')}
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
                    <SheetDescription>{t('pages.clusters.filtersDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStatusFilter}>{t('common.action.clear')}</Button>
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
                    <div className="space-y-3">
                      <span className="text-sm font-medium">{t('pages.clusters.deletedSectionLabel')}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showDeleted"
                          checked={showDeleted}
                          onChange={handleShowDeletedToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <Label htmlFor="showDeleted" className="text-sm text-muted-foreground cursor-pointer">
                          {t('pages.clusters.showSoftDeleted')}
                        </Label>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
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
                    {s === "true" ? t('common.status.active') : t('common.status.inactive')}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
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

            {!error && clusters.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Network}
                emptyTitle={t('pages.clusters.emptyTitle')}
                emptyDescription={t('pages.clusters.emptyDescription')}
                addAction={
                  <Can permission="cluster.create">
                    <Button size="sm" onClick={() => navigate('/clusters/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.clusters.addCluster')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && clusters.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count
                  // (including the conditional Deleted column when showDeleted is on).
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.clusters.loadingAria')}>
                    <div className="text-muted-foreground">{t('pages.clusters.loadingText')}</div>
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
        title={t('pages.clusters.deleteTitle')}
        description={t('pages.clusters.deleteDescription')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {/* แผ่นตัวเดียวสำหรับทั้งตาราง — สลับ entityId ตามแถวที่เลือก
          เรนเดอร์ตัวละแถวจะ mount คอมโพเนนต์เป็นร้อยตัวโดยเปล่าประโยชน์ */}
      <ActivityTrailSheet
        entityType="cluster"
        recordingStartedOn={AUDIT_RECORDING_STARTED_ON_PHASE_2}
        {...activityTrail.sheetProps}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/clusters" data={rawResponse} />
    </Layout>
  );
};

export default ClusterManagement;
