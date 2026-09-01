import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureGroupService from '../services/licenseFeatureGroupService';
import subscriptionService from '../services/subscriptionService';
import type { LicenseFeatureGroup } from '../types';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useI18n } from '../hooks/useI18n';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import Can from '../components/Can';
import { FeatureCompositionBar } from './licenses/FeatureCompositionBar';
import { cn } from '../lib/utils';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { LayoutGrid, Plus, Search, Download, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ตารางชุดสิทธิ์ license — client-filtered ไม่ใช่ server-side
 *
 * จำนวนกลุ่มมีเพดานเชิงโครงสร้าง (เป็นรายการขายที่คนตั้งเอง ไม่ใช่ข้อมูลที่งอกตามการใช้งาน)
 * จึงดึงครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce** เพราะการพิมพ์ไม่ทำให้เกิด fetch
 *
 * ตารางนี้ไม่ใช่ตารางเลขล้วน: คอลัมน์ Features ถือแถบสัดส่วนที่ใช้ **ตัวหารร่วมทั้งหน้า**
 * (ขนาดแค็ตตาล็อก) ไม่ใช่ตัวเลขลอย ๆ — นั่นคือสิ่งที่ทำให้เทียบชุดข้ามแถวได้ และเป็นเหตุผล
 * ที่คอลัมน์นั้นถูกตรึงความกว้างไว้ ไม่ปล่อยให้ยืดตามเนื้อหา
 *
 * เรียงเริ่มต้นตาม `sort_order` — ลำดับนี้คือลำดับที่ชุดจะโผล่บนฟอร์มขายจริง คอลัมน์ `#`
 * ที่ DataTable แถมมาเป็นเลขแถวของมุมมองปัจจุบัน ไม่ใช่ค่านั้น จึงต้องมีคอลัมน์ `sort_order`
 * แยกต่างหากที่มีป้ายกำกับของตัวเอง
 */
const PAGE_SIZE = 200;

const LicenseFeatureGroupManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [groups, setGroups] = useState<LicenseFeatureGroup[]>([]);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [pendingDelete, setPendingDelete] = useState<LicenseFeatureGroup | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await licenseFeatureGroupService.getAll({
        page: 1,
        perpage: PAGE_SIZE,
        sort: 'sort_order:asc',
      });
      setRawResponse(response);
      setGroups(Array.isArray(response?.data) ? response.data : []);
    } catch (err: unknown) {
      devLog('fetch license feature groups failed', err);
      setError(getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // ตัวหารของแถบส่วนประกอบ — แยก request และ **ห้ามพ่วงกับ error ของรายการ** แค็ตตาล็อกโหลดไม่ได้
  // แปลว่าซ่อนแถบ ไม่ใช่ทั้งหน้าพัง (ตัวเลข feature_count ยังอ่านได้อยู่โดยไม่ต้องมีตัวหาร)
  useEffect(() => {
    let cancelled = false;
    subscriptionService
      .getFeatureCatalog()
      .then((res) => {
        if (!cancelled) setCatalogTotal(Array.isArray(res?.data) ? res.data.length : null);
      })
      .catch((err) => {
        devLog('fetch license feature catalog failed', err);
        if (!cancelled) setCatalogTotal(null);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (activeOnly && !g.is_active) return false;
      if (!q) return true;
      return g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
    });
  }, [groups, search, activeOnly]);

  // ค่า sort_order ที่มีเจ้าของมากกว่าหนึ่งกลุ่ม — คิดจาก `groups` ทั้งชุด ไม่ใช่ `filtered`
  // เพราะกลุ่มที่ถูกกรองออกก็ยังแย่งลำดับบนฟอร์มขายอยู่ดี
  const duplicateOrders = useMemo(() => {
    const seen = new Map<number, number>();
    groups.forEach((g) => seen.set(g.sort_order, (seen.get(g.sort_order) ?? 0) + 1));
    const dupes = new Set<number>();
    // forEach บน Map แทนการกาง [...map.entries()] — target ของ tsconfig ต่ำกว่า es2015
    // การกาง iterator จึงเป็น TS2802 ไม่ใช่แค่เรื่องสไตล์
    seen.forEach((count, order) => { if (count > 1) dupes.add(order); });
    return dupes;
  }, [groups]);

  const handleExport = () => {
    const csv = generateCSV(
      filtered,
      [
        { key: 'sort_order', label: t('pages.licenseFeatureGroups.sortOrder') },
        { key: 'code', label: t('pages.licenseFeatureGroups.code') },
        { key: 'name', label: t('pages.licenseFeatureGroups.name') },
        { key: 'description', label: t('pages.licenseFeatureGroups.description') },
        { key: 'feature_count', label: t('pages.licenseFeatureGroups.featureCount') },
        { key: 'subscription_count', label: t('pages.licenseFeatureGroups.subscriptionCount') },
        { key: 'is_active', label: t('pages.licenseFeatureGroups.active') },
      ],
    );
    downloadCSV(csv, `license-feature-groups-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await licenseFeatureGroupService.delete(pendingDelete.id);
      toast.success(t('pages.licenseFeatureGroups.deleted'));
      setPendingDelete(null);
      await fetchAll();
    } catch (err: unknown) {
      toast.error(getErrorDetail(err, t));
      setPendingDelete(null);
    }
  };

  const columns = useMemo<ColumnDef<LicenseFeatureGroup, unknown>[]>(() => [
    {
      accessorKey: 'sort_order',
      header: t('pages.licenseFeatureGroups.sortOrder'),
      meta: { headerClassName: 'w-24', cellClassName: 'w-24', card: 'badge' },
      // ลำดับที่ชนกันถูกทำให้เห็น ไม่ใช่ทำให้เนียน: ถ้าสองกลุ่มถือเลขเดียวกัน ลำดับบนฟอร์มขาย
      // ตกไปอยู่กับ tie-break ของ backend ซึ่งไม่มีใครตั้งใจ — การวาดชิปให้เท่ากันหมดจะทำให้
      // ตารางนี้รับรองลำดับที่ตัวเองไม่รู้
      cell: ({ row }) => {
        const dupe = duplicateOrders.has(row.original.sort_order);
        return (
          <span
            title={
              dupe
                ? t('pages.licenseFeatureGroups.ordinalDuplicateHint', { n: row.original.sort_order })
                : t('pages.licenseFeatureGroups.ordinalHint', { n: row.original.sort_order })
            }
            className={cn(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-background px-1.5 font-mono text-xs tabular-nums',
              dupe ? 'border-warning text-warning' : 'text-muted-foreground',
            )}
          >
            {row.original.sort_order}
          </span>
        );
      },
    },
    {
      accessorKey: 'code',
      header: t('pages.licenseFeatureGroups.code'),
      meta: { headerClassName: 'w-48', cellClassName: 'w-48', card: 'title' },
      cell: ({ row }) => (
        <Link
          to={`/license-feature-groups/${row.original.id}/edit`}
          className="font-mono text-xs text-primary hover:underline"
          title={row.original.code}
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('pages.licenseFeatureGroups.name'),
      // คำอธิบายอยู่ใต้ชื่อในเซลล์เดียวกัน ไม่แยกคอลัมน์ — มันคือประโยคที่บอกว่าชุดนี้ขายให้ใคร
      // คอลัมน์คำอธิบายของตัวเองจะถูกบีบจนเหลือแต่ ellipsis ในทุกความกว้างจอที่ใช้จริง
      cell: ({ row }) => (
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">{row.original.name}</div>
          {row.original.description && (
            <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      id: 'features',
      accessorFn: (g) => g.feature_count,
      header: t('pages.licenseFeatureGroups.featureCount'),
      // ความกว้างคงที่ — แถบใช้แกนร่วม ถ้าคอลัมน์ยืดตามเนื้อหา ความยาวเท่ากันจะเลิกแปลว่าเท่ากัน
      meta: { headerClassName: 'w-56', cellClassName: 'w-56' },
      cell: ({ row }) => {
        const g = row.original;
        /**
         * ตัวหารที่ใช้ได้จริง — `null` เมื่อโหลดแค็ตตาล็อกไม่ได้ **หรือเมื่อ count เกิน total**
         *
         * เกินได้จริง ไม่ใช่กรณีสมมติ: `getFeatureCatalog()` ยิง `/license-features` ซึ่ง**ตัดแถวที่
         * `hide` ทิ้ง** (หน้าจัดการยิง `/license-features/all` ที่รวมไว้) ส่วน `feature_count`
         * นับทุกคีย์ที่กลุ่มถืออยู่ รวมคีย์ที่หลุดจากแค็ตตาล็อกไปแล้ว · วันนี้ยังไม่มีใครถูกซ่อน
         * (ทั้งสอง endpoint คืน 76 เท่ากัน) แต่พอมีเมื่อไหร่ ป้ายจะอ่านว่า "76 จาก 75 สิทธิ์"
         * และแถบจะ clamp ที่ 100% เงียบ ๆ — ตกไปใช้ตัวเลขเปล่าดีกว่าแสดงเศษส่วนที่เป็นไปไม่ได้
         */
        const usableTotal =
          catalogTotal !== null && g.feature_count <= catalogTotal ? catalogTotal : null;
        const label = usableTotal !== null
          ? t('pages.licenseFeatureGroups.featuresOfTotal', {
              count: g.feature_count,
              total: usableTotal,
            })
          : t('pages.licenseFeatureGroups.featuresOnly', { count: g.feature_count });
        return (
          <div className="space-y-1.5">
            <span className="block text-xs tabular-nums text-muted-foreground">{label}</span>
            {usableTotal !== null && (
              <FeatureCompositionBar count={g.feature_count} total={usableTotal} label={label} />
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'subscription_count',
      header: t('pages.licenseFeatureGroups.subscriptionCount'),
      meta: { headerClassName: 'w-44', cellClassName: 'w-44' },
      // บนหน้ารายการเลขนี้คือ "รู้ไว้" — มันกลายเป็นคำเตือนสีส้มบนหน้าแก้ไข ซึ่งเป็นจุดที่
      // การกระทำเกิดจริง ถ้าเตือนตั้งแต่หน้ารายการ ทุกชุดที่ขายได้ก็จะเป็นสีเตือนตลอดเวลา
      cell: ({ row }) => {
        const n = row.original.subscription_count;
        return (
          <span className={cn('text-xs tabular-nums', n > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {/* คีย์เอกพจน์แยกต่างหาก — `translate()` เป็นการแทนที่ {{}} ล้วน ไม่มีกลไก plural
                ป้ายที่คนอ่านทุกครั้งจึงไม่ควรขึ้นว่า "Used by 1 contracts" */}
            {n === 0
              ? t('pages.licenseFeatureGroups.inUseNone')
              : n === 1
                ? t('pages.licenseFeatureGroups.inUseCountOne')
                : t('pages.licenseFeatureGroups.inUseCount', { count: n })}
          </span>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-12', cellClassName: 'w-12' },
      cell: ({ row }) => (
        <Can permission="license_feature_group.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.action.rowActions', { name: row.original.name })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/license-feature-groups/${row.original.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.action.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setPendingDelete(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      ),
    },
  ], [t, duplicateOrders, catalogTotal]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.licenseFeatureGroups.title')}
          subtitle={t('pages.licenseFeatureGroups.subtitle')}
          actions={
            <div className="flex gap-3">
              <Button size="sm" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="license_feature_group.manage">
                <Button size="sm" onClick={() => navigate('/license-feature-groups/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pages.licenseFeatureGroups.newGroup')}
                </Button>
              </Can>
            </div>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pages.licenseFeatureGroups.searchPlaceholder')}
                className="pl-9"
                aria-label={t('pages.licenseFeatureGroups.searchPlaceholder')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              {t('pages.licenseFeatureGroups.activeOnly')}
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            {error ? (
              <FetchErrorState message={error} onRetry={() => void fetchAll()} />
            ) : loading && groups.length === 0 ? (
              <TableSkeleton columns={7} rows={6} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title={t('pages.licenseFeatureGroups.emptyTitle')}
                description={t('pages.licenseFeatureGroups.emptyDescription')}
                action={
                  <Can permission="license_feature_group.manage">
                    <Button size="sm" onClick={() => navigate('/license-feature-groups/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.licenseFeatureGroups.newGroup')}
                    </Button>
                  </Can>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                data={filtered}
                pageSize={25}
                tableLayout="auto"
                stickyLeftColumns={3}
                defaultSort={{ id: 'sort_order', desc: false }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t('pages.licenseFeatureGroups.deleteTitle')}
        // ชุดที่มีสัญญาผูกอยู่ได้คำถามคนละคำถาม — จำนวนสัญญาคือรัศมีความเสียหาย ต้องอยู่ในกล่อง
        // ที่กำลังจะถูกกดยืนยัน ไม่ใช่อยู่แค่ในแถวที่ผู้ใช้เพิ่งเลื่อนผ่าน
        description={
          pendingDelete && pendingDelete.subscription_count > 0
            ? t('pages.licenseFeatureGroups.deleteBodyInUse', {
                count: pendingDelete.subscription_count,
              })
            : t('pages.licenseFeatureGroups.deleteBody')
        }
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title={t('pages.licenseFeatureGroups.title')}
          endpoint="/api-system/platform/license-feature-groups"
          tabs={[
            { key: 'response', label: 'response', data: rawResponse },
            { key: 'filtered', label: 'filtered', data: filtered },
            { key: 'catalog', label: 'catalog', data: { catalogTotal } },
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureGroupManagement;
