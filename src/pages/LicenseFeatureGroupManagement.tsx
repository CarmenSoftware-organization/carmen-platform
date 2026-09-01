import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { FeatureGroupCard } from './licenses/FeatureGroupCard';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { LayoutGrid, Plus, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ชั้นวางชุดสิทธิ์ license — client-filtered ไม่ใช่ server-side
 *
 * จำนวนกลุ่มมีเพดานเชิงโครงสร้าง (เป็นรายการขายที่คนตั้งเอง ไม่ใช่ข้อมูลที่งอกตามการใช้งาน)
 * จึงดึงครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce** เพราะการพิมพ์ไม่ทำให้เกิด fetch
 * และด้วยเหตุผลเดียวกันจึง **ไม่มีแถบแบ่งหน้า** — เฟอร์นิเจอร์ "Showing 1–3 of 3 · Show 10 25 50 100"
 * ที่ DataTable แถมมาให้ เป็นคำสัญญาว่าข้อมูลจะยาวเกินหน้า ซึ่งไม่จริงสำหรับแค็ตตาล็อกชุดนี้
 *
 * เรียงตาม `sort_order` เสมอ ไม่ให้ผู้ใช้สลับ — ลำดับนี้คือลำดับที่ชุดจะโผล่บนฟอร์มขายจริง
 * การเรียงใหม่ตามชื่อหรือจำนวนจะทำให้หน้านี้เลิกเป็นภาพแทนของสิ่งที่ฝ่ายขายเห็น
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

        {/* แถบกรองแบบเปลือย ไม่ห่อ Card — การ์ดรอบช่องค้นหาเดี่ยว ๆ ทำให้ตัวควบคุมมีน้ำหนักทาง
            สายตาเท่ากับชุดสิทธิ์ที่มันกรอง ทั้งที่ของจริงบนหน้านี้คือชั้นวางด้านล่าง */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          {!loading && !error && groups.length > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('pages.licenseFeatureGroups.showingCount', {
                shown: filtered.length,
                total: groups.length,
              })}
            </span>
          )}
        </div>

        {error ? (
          <Card>
            <CardContent className="py-4">
              <FetchErrorState message={error} onRetry={() => void fetchAll()} />
            </CardContent>
          </Card>
        ) : loading && groups.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3 py-4">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-5 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-4">
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
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => (
              <FeatureGroupCard
                key={group.id}
                group={group}
                catalogTotal={catalogTotal}
                duplicateOrder={duplicateOrders.has(group.sort_order)}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t('pages.licenseFeatureGroups.deleteTitle')}
        // ชุดที่มีสัญญาผูกอยู่ได้คำถามคนละคำถาม — จำนวนสัญญาคือรัศมีความเสียหาย ต้องอยู่ในกล่อง
        // ที่กำลังจะถูกกดยืนยัน ไม่ใช่อยู่แค่บนการ์ดที่ผู้ใช้เพิ่งเลื่อนผ่าน
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
