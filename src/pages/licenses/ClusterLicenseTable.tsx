import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import clusterService from '../../services/clusterService';
import { getErrorDetail, devLog } from '../../utils/errorParser';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { DataTable } from '../../components/ui/data-table';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { KeyRound } from 'lucide-react';
import { CapacityMeter } from '../clusterManagement/CapacityMeter';
import { isPerpetual, daysLeft, fmtDate, EXPIRING_SOON_DAYS } from './licenseDates';
import type { Cluster, PaginateParams } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';

// คีย์ localStorage เฉพาะของมุมมองนี้ — แยกจาก `perpage_clusters`/`page_clusters`/`sort_clusters`
// ของหน้า /clusters เพื่อไม่ให้ page/perpage/sort ของสองหน้าเหยียบกัน (คนละบริบทการใช้งาน)
const PERPAGE_KEY = 'perpage_cluster_license';
const PAGE_KEY = 'page_cluster_license';
const SORT_KEY = 'sort_cluster_license';
const DEFAULT_SORT = 'code:asc';

export interface ClusterLicenseTableProps {
  /**
   * true = กรองเฉพาะ cluster ที่ใบโควตา BU ที่ชนะใกล้หมดอายุ — มาจากการกดสถิติ "BU quota expiring"
   * ในแถบสรุปของ `LicenseCenter` (เทียบ `handleExpiringSoonToggle` ของ ClusterManagement.tsx)
   * ค่าเริ่มต้น `false` = พฤติกรรมเดิมทุกประการ
   */
  expiringSoonFilter?: boolean;
}

// สร้าง advance filter จากตัวกรอง "โควตาใกล้หมดอายุ" — `bu_quota_expiring_soon` ไม่ใช่คอลัมน์จริง
// backend ถอดคีย์นี้ออกแล้วแปลงเป็น id list ผ่าน view `v_cluster_bu_cap` (กติกาเดียวกับ
// ClusterManagement.tsx buildAdvance) frontend จึงไม่มีสำเนาของกติกาให้เพี้ยนได้เลย
const buildAdvance = (expiringSoon: boolean) => {
  const where: Record<string, unknown> = { deleted_at: null };
  if (expiringSoon) where.bu_quota_expiring_soon = true;
  return JSON.stringify({ where });
};

/** ตารางสถานะ license รายคลัสเตอร์ — มุมมอง "By cluster" ของ License Center */
const ClusterLicenseTable: React.FC<ClusterLicenseTableProps> = ({ expiringSoonFilter = false }) => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedPage = Number(localStorage.getItem(PAGE_KEY)) || 1;
  const storedSort = localStorage.getItem(SORT_KEY) || DEFAULT_SORT;

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem(PERPAGE_KEY)) || 10,
    sort: storedSort,
    // เห็นเฉพาะคลัสเตอร์ที่ยังไม่ถูกลบ — ตรงกับค่าเริ่มต้นของหน้า /clusters (showDeleted=false)
    advance: buildAdvance(expiringSoonFilter),
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
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(expiringSoonFilter) }));
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
      setError('Failed to load clusters: ' + getErrorDetail(err));
      devLog('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters(paginate);
  }, [fetchClusters, paginate]);

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

  const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Cluster',
      meta: { card: 'title' },
      cell: ({ row }) => (
        <Link to={`/licenses/${row.original.id}`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: 'Name', meta: { card: 'title' }, enableSorting: false },
    {
      id: 'bu_quota',
      header: 'BU quota',
      enableSorting: false,
      cell: ({ row }) => {
        const cap = row.original.bu_cap ?? 0;
        const used = row.original.bu_used ?? 0;
        // cap 0 = ไม่มีใบคุ้มครอง ไม่ใช่ "ไม่จำกัด" — ห้ามแสดง ∞ ที่นี่เด็ดขาด
        if (cap === 0) return <span className="text-xs text-destructive">No licence</span>;
        return (
          <span className={`font-mono text-xs${used > cap ? ' text-destructive' : ''}`}>
            {used} / {cap}
          </span>
        );
      },
    },
    {
      id: 'seats',
      header: 'Seats',
      enableSorting: false,
      cell: ({ row }) => (
        <CapacityMeter used={row.original.users_count} cap={row.original.total_max_license_users} />
      ),
    },
    {
      id: 'bu_cap_end',
      header: 'Quota expires',
      enableSorting: false,
      cell: ({ row }) => {
        const end = row.original.bu_cap_end_date;
        if (!end) return <span className="text-xs text-muted-foreground">-</span>;
        if (isPerpetual(end)) return <span className="text-xs text-muted-foreground">No expiry</span>;
        const left = daysLeft(end, new Date());
        return (
          <span className="text-xs whitespace-nowrap">
            {fmtDate(end)}
            {left <= EXPIRING_SOON_DAYS && left >= 0 && (
              <Badge variant="warning" className="ml-2">{left} days left</Badge>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ], []);

  return (
    <Card>
      {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

      {!error && (
        loading && clusters.length === 0 ? (
          // +1 เผื่อคอลัมน์ลำดับแถวที่ DataTable ใส่ให้เองเสมอ
          <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
        ) : clusters.length === 0 ? (
          <EmptyState icon={KeyRound} title="No clusters" description="ยังไม่มีคลัสเตอร์ในระบบ" />
        ) : (
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                   role="status" aria-label="Loading clusters">
                <div className="text-muted-foreground">Loading...</div>
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
    </Card>
  );
};

export default ClusterLicenseTable;
