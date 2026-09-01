import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import clusterLicenseService from '../../services/clusterLicenseService';
import { useAuth } from '../../context/AuthContext';
import { devLog, isNotFoundError } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import { LicenseHealthStrip, type LicenseHealthFacts, type LicenseTabId } from './LicenseHealthStrip';
import { useLicenseLedger } from './useLicenseLedger';
import { useClusterSeatLicenses } from './useClusterSeatLicenses';
import { useClusterSubscriptions } from './useClusterSubscriptions';
import { BuQuotaSection } from './sections/BuQuotaSection';
import { SeatSection } from './sections/SeatSection';
import { SubscriptionSection } from './sections/SubscriptionSection';
import { sumActiveLicenses } from '../../utils/buLicense';
import { activeLicense, isPerpetual, isExpiringSoon as quotaExpiringSoon } from '../../utils/clusterLicense';
import { isExpiringSoon as subExpiringSoon } from '../../utils/subscriptionState';
import { daysLeft } from './licenseDates';
import type { BusinessUnit, Cluster, ClusterLicense } from '../../types';

const TAB_IDS: LicenseTabId[] = ['quota', 'seats', 'subscriptions'];
const isTabId = (v: string | null): v is LicenseTabId =>
  v !== null && (TAB_IDS as string[]).includes(v);

/**
 * `/licenses/:clusterId` (platform admin) — สาม "ชั้น" ของ license ของ cluster หนึ่ง:
 * โควตา BU (ใบที่ชนะใบเดียว) · ที่นั่ง (ผลรวมใบที่ active ต่อ BU) · สัญญา
 *
 * **เพจนี้เป็นเจ้าของข้อมูลทั้งสามชั้น** แล้วส่งลงไปให้ section — ไม่ใช่ให้แต่ละ section ดึงเอง
 * แบบเดิม เพราะแถบสรุป (`LicenseHealthStrip`) ต้องนับจากชุดเดียวกันเป๊ะ ถ้าแยกกันดึง เพจจะยิง
 * คำขอชุดที่สองเพื่อนับสิ่งเดียวกัน แล้วสองที่จะเพี้ยนจากกันเงียบ ๆ ตอนหนึ่งในสองโหลดล้ม
 *
 * **แท็บ ไม่ใช่ scrollspy**: เดิมใช้ `ClusterEditNav` + `useScrollSpy` แบบ `ClusterEdit` ซึ่งกิน
 * คอลัมน์ถาวร 200px เพื่อลิงก์สามอัน ในหน้าที่ทั้งหน้าเลื่อนแค่รอบครึ่ง — ต้นทุนสูงกว่าประโยชน์
 * แถบสรุปด้านบนทำหน้าที่ "เห็นภาพรวมทั้งสามชั้นพร้อมกัน" ที่ scrollspy เคยให้แทนแล้ว และแท็บยัง
 * ตรงกับหน้ารายการ `/licenses?tab=` ที่ผู้ใช้เพิ่งมาจาก
 *
 * แท็บอ่าน/เขียนที่ `?tab=` และยังรับ hash เดิม (`#seats`, `#subscriptions`) — ลิงก์
 * "Manage licences" จากหน้าแก้ไข BU/Cluster ยังชี้มาด้วย hash อยู่ ห้ามทำให้มันตายเงียบ
 *
 * `canManage` คำนวณจาก `subscription.manage` — **ไม่ใช่** `cluster.update` — เพราะ backend บังคับ
 * `subscription.manage` บนทั้งสอง endpoint license (`platform_cluster-licenses.controller.ts:119,157`)
 * ค่านี้ถูกส่งลงทั้งสาม section เป็น prop เดียว ไม่มี `<Can>` ซ้อนอยู่ในคอมโพเนนต์ร่วมเหล่านั้นเลย
 *
 * เชลล์ cluster-admin เคยยืมหน้านี้ผ่านธง `readOnlyShell` ตอนนี้มีหน้าของตัวเองแล้ว
 * (`clusterAdmin/ClusterAdminLicenses.tsx`) เพราะสองบทบาทถามคนละคำถาม — ที่นั่นคือ "พอไหม"
 * ที่นี่คือ "ออกใบไหนไปแล้วบ้าง" ธงนั้นจึงถูกถอดทิ้งพร้อมกิ่งของมันทั้งหมด
 */
const ClusterLicenseDetail: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('subscription.manage');
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [clusterLoading, setClusterLoading] = useState(true);
  /** true = backend ตอบ 404 (ถูกลบหรือไม่เคยมี) · false = โหลดไม่สำเร็จด้วยเหตุอื่น */
  const [clusterMissing, setClusterMissing] = useState(false);
  const [bus, setBus] = useState<BusinessUnit[]>([]);

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    setClusterLoading(true);
    setClusterMissing(false);
    clusterService.getById(clusterId)
      .then((res) => {
        if (cancelled) return;
        const data = (res?.data ?? res) as Cluster;
        setCluster(data?.id ? data : null);
      })
      .catch((err) => {
        if (cancelled) return;
        devLog('Failed to load cluster:', err);
        setCluster(null);
        // 404 กับความล้มเหลวอื่นต้องพูดคนละอย่าง: detail endpoint กรอง `deleted_at: null` ขณะที่
        // รายการ cluster ตั้งใจแสดงตัวที่ถูกลบด้วย (แถบสรุปมีตัวนับ deleted) การคลิกจากรายการนั้น
        // จึงลงเอยที่ 404 ตามปกติ ไม่ใช่ความผิดพลาด — ส่วน network/403 คือคนละเรื่องและแก้คนละทาง
        setClusterMissing(isNotFoundError(err));
      })
      .finally(() => {
        if (!cancelled) setClusterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  useEffect(() => {
    void (async () => {
      try {
        // เส้นทางเดียวกับ ClusterEdit.tsx:205-219 — envelope `{ data }` ต้อง unwrap เอง
        const data = await businessUnitService.getAll({ perpage: -1 });
        const items = data.data || data;
        const all: BusinessUnit[] = Array.isArray(items) ? items : [];
        const filtered = all.filter((bu) => bu.cluster_id === clusterId);
        setBus([...filtered].sort((a, b) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())));
      } catch (err) {
        devLog('Failed to load business units:', err);
      }
    })();
  }, [clusterId]);

  const quotaLedger = useLicenseLedger<ClusterLicense>(clusterId, clusterLicenseService);
  const seats = useClusterSeatLicenses(clusterId, bus);
  const subs = useClusterSubscriptions(clusterId);

  // ── แท็บ ────────────────────────────────────────────────────────────────────────────
  const urlTab = searchParams.get('tab');
  const activeTab: LicenseTabId = isTabId(urlTab) ? urlTab : 'quota';

  const selectTab = useCallback((tab: LicenseTabId) => {
    // `replace` เพื่อไม่ให้การสลับแท็บถมประวัติเบราว์เซอร์จนปุ่ม Back กลับหน้าเดิมไม่ได้
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // รับ hash เดิมจากลิงก์ "Manage licences" ของหน้าแก้ไข BU/Cluster (`#seats`, `#subscriptions`)
  // แล้วแปลงเป็นแท็บ — ผูกกับการ "เปลี่ยน hash" เท่านั้น ไม่ล็อกแท็บค้างไว้ที่ค่านั้น
  useEffect(() => {
    const id = location.hash.slice(1);
    if (isTabId(id)) selectTab(id);
  }, [location.hash, selectTab]);

  // ── ตัวเลขของแถบสรุป ──────────────────────────────────────────────────────────────
  const facts = useMemo<LicenseHealthFacts>(() => {
    const now = new Date();
    const winning = activeLicense(quotaLedger.licenses, now);
    const okSeatRows = seats.rows.filter((r) => !r.failed);

    return {
      quota: {
        cap: winning?.licensed_bus ?? null,
        used: cluster?.bu_used ?? 0,
        // เตือนเฉพาะตอนใกล้หมดจริง — ใบ perpetual และใบที่ยังอีกนานไม่ควรกินที่บนแถบเตือน
        endsInDays: winning && !isPerpetual(winning.end_date) && quotaExpiringSoon(winning, thresholds.bu_quota_days, now)
          ? daysLeft(winning.end_date, now)
          : null,
        unavailable: quotaLedger.loadFailed,
      },
      seats: {
        total: okSeatRows.reduce((sum, r) => sum + sumActiveLicenses(r.licenses, now), 0),
        busWithoutSeats: okSeatRows.filter((r) => sumActiveLicenses(r.licenses, now) === 0).length,
        // BU แม้แต่ตัวเดียวที่โหลดไม่ได้ก็ทำให้ "ยอดรวมที่นั่ง" ไม่ใช่ยอดรวมอีกต่อไป — แสดงมัน
        // เป็นข้อเท็จจริงคือการรายงานตัวเลขที่ต่ำกว่าจริงโดยไม่บอกว่าต่ำ
        unavailable: seats.rows.some((r) => r.failed),
      },
      subscriptions: {
        total: subs.items.length,
        expired: subs.items.filter((s) => s.state === 'expired').length,
        expiringSoon: subs.items.filter((s) => subExpiringSoon(s.state, s.end_date, thresholds.subscription_days)).length,
        unavailable: subs.failed,
      },
    };
  }, [quotaLedger.licenses, quotaLedger.loadFailed, seats.rows, subs.items, subs.failed, cluster?.bu_used, thresholds.bu_quota_days, thresholds.subscription_days]);

  const stripLoading = clusterLoading || quotaLedger.loading || seats.loading || subs.loading;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/licenses"
          title={clusterLoading
            ? t('common.busy.loadingEllipsis')
            : (cluster?.name || (clusterMissing
              ? t('pages.licenses.clusterNotFoundOrDeleted')
              : t('pages.licenses.clusterUnavailable')))}
          subtitle={cluster?.code
            ? t('pages.licenses.subtitleWithCode', { code: cluster.code })
            : t('pages.licenses.title')}
        />

        <LicenseHealthStrip facts={facts} loading={stripLoading} onJump={selectTab} />

        <Tabs value={activeTab} onValueChange={(v) => isTabId(v) && selectTab(v)}>
          <TabsList aria-label={t('pages.licenses.licenseLayersNav')}>
            <TabsTrigger value="quota">{t('pages.licenses.buQuota')}</TabsTrigger>
            <TabsTrigger value="seats">{t('common.field.seats')}</TabsTrigger>
            <TabsTrigger value="subscriptions">{t('common.label.subscriptions')}</TabsTrigger>
          </TabsList>

          <TabsContent value="quota" className="mt-4">
            <BuQuotaSection
              clusterId={clusterId!}
              clusterCode={cluster?.code ?? ''}
              clusterName={cluster?.name ?? ''}
              canManage={canManage}
              // ต้องอ่านจากแหล่งเดียวกับ ClusterEdit.tsx:637-639 และ ClusterLicenseTable.tsx:102
              // (`cluster.bu_used` จาก backend view) ไม่ใช่นับ `bus.length` เองฝั่ง client —
              // ถ้า backend กรอง soft-deleted หรือ scope ต่างจาก client เมื่อไร สามหน้านี้จะ
              // แสดงเลขไม่ตรงกันเงียบ ๆ
              buUsed={cluster?.bu_used ?? 0}
              businessUnits={bus}
              ledger={quotaLedger}
              // ตารางอันดับ BU ในแท็บนี้แสดงแกนเวลา "สัญญา" ของแต่ละ BU — ใช้ชุดเดียวกับ
              // แท็บ Subscriptions และแถบสรุป ไม่ยิงคำขอของตัวเอง
              subscriptions={subs.items}
              subscriptionsLoading={subs.loading}
              subscriptionsFailed={subs.failed}
            />
          </TabsContent>

          <TabsContent value="seats" className="mt-4">
            <SeatSection
              rows={seats.rows}
              loading={seats.loading}
              reload={() => void seats.reload()}
              canManage={canManage}
            />
          </TabsContent>

          <TabsContent value="subscriptions" className="mt-4">
            <SubscriptionSection
              clusterId={clusterId!}
              canManage={canManage}
              items={subs.items}
              loading={subs.loading}
              failed={subs.failed}
              errorMsg={subs.errorMsg}
              reload={() => void subs.reload()}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ClusterLicenseDetail;
