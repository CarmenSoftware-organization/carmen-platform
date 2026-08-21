import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import Layout from '../../components/Layout';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import { PageHeader } from '../../components/PageHeader';
import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import { useAuth } from '../../context/AuthContext';
import { devLog } from '../../utils/errorParser';
import { ClusterEditNav, type NavItem } from '../clusterEdit/ClusterEditNav';
import { useScrollSpy } from '../clusterEdit/useScrollSpy';
import { BuQuotaSection } from './sections/BuQuotaSection';
import { SeatSection } from './sections/SeatSection';
import { SubscriptionSection } from './sections/SubscriptionSection';
import type { BusinessUnit, Cluster } from '../../types';

const ALL_SECTIONS: NavItem[] = [
  { id: 'quota', label: 'BU quota' },
  { id: 'seats', label: 'Seats' },
  { id: 'subscriptions', label: 'Subscriptions' },
];

interface ClusterLicenseDetailProps {
  /**
   * เปิดในเชลล์ cluster-admin — หน้านั้นไม่ใช่พื้นผิวสำหรับเขียนไม่ว่าใครเปิด และสิทธิ์ของ
   * cluster admin ไม่ได้อยู่ใน EffectivePermissions เลย จึงตัดสินจากเชลล์ ไม่ใช่จากสิทธิ์
   */
  readOnlyShell?: boolean;
}

/**
 * `/licenses/:clusterId` (platform admin) และ `/cluster-admin/:clusterId/licenses` (cluster
 * admin, อ่านอย่างเดียว) — สาม "ชั้น" ของ license ของ cluster หนึ่งไว้ในหน้าเดียว: โควตา BU
 * (ใบที่ชนะใบเดียว) · ที่นั่ง (ผลรวมใบที่ active ต่อ BU) · สัญญา ใช้ scrollspy + nav แบบเดียวกับ
 * `ClusterEdit` (`useScrollSpy` + `ClusterEditNav` ที่ `../clusterEdit/`)
 *
 * `canManage` คำนวณจาก `subscription.manage` — **ไม่ใช่** `cluster.update` — เพราะ backend บังคับ
 * `subscription.manage` บนทั้งสอง endpoint license (`platform_cluster-licenses.controller.ts:119,157`)
 * ค่านี้ถูกส่งลงทั้งสาม section เป็น prop เดียว ไม่มี `<Can>` ซ้อนอยู่ในคอมโพเนนต์ร่วมเหล่านั้นเลย
 *
 * ในเชลล์ cluster-admin (`readOnlyShell`) `canManage` ถูกล็อกเป็น `false` เสมอ — ไม่ใช่
 * `hasPermission(...)` — เพราะ cluster admin ไม่มีสิทธิ์ใดใน `EffectivePermissions` เลย (มาจาก
 * ตารางสมาชิกคลัสเตอร์ ไม่ใช่ `tb_user_tb_platform_role`) และแม้ platform admin ที่ถือ
 * `subscription.manage` จะเปิดหน้านี้ผ่านเชลล์ cluster-admin ได้ หน้านั้นก็ไม่ใช่พื้นผิวสำหรับ
 * เขียนไม่ว่าใครเปิดอยู่ดี
 */
const ClusterLicenseDetail: React.FC<ClusterLicenseDetailProps> = ({ readOnlyShell }) => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const canManage = readOnlyShell ? false : hasPermission('subscription.manage');
  const Shell = readOnlyShell ? ClusterAdminLayout : Layout;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [clusterLoading, setClusterLoading] = useState(true);
  const [bus, setBus] = useState<BusinessUnit[]>([]);

  // เชลล์ cluster-admin ต้องไม่ยิง GET /api-system/platform/subscriptions เลย — backend บังคับ
  // `subscription.read` ผ่าน PlatformPermissionGuard ซึ่งประกอบสิทธิ์จาก `tb_user_tb_platform_role`
  // เท่านั้น cluster admin แบบสมาชิกภาพไม่มีสิทธิ์นี้ใน EffectivePermissions เลยเสมอ (403 ทุกครั้ง
  // ไม่ใช่ edge case) endpoint ใบโควตา/ใบที่นั่งจงใจไม่ใส่ decorator นี้ด้วยเหตุผลเดียวกัน
  // (platform_cluster-licenses.controller.ts:40-46) — ตัด section ออกทั้งจาก nav (ไม่งั้นเมนูจะชี้
  // ไปที่ที่ไม่มี) และจาก render เพราะปัญหาไม่ใช่เรื่อง UI ที่ซ่อนปุ่มแล้วจบ
  const SECTIONS = useMemo(
    () => (readOnlyShell ? ALL_SECTIONS.filter((s) => s.id !== 'subscriptions') : ALL_SECTIONS),
    [readOnlyShell],
  );

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    setClusterLoading(true);
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

  // เรียก useScrollSpy เองอีกชุด (แยกจากตัวที่ ClusterEditNav ใช้ภายใน) เพื่อเอา `scrollTo` มารองรับ
  // deep-link ผ่าน hash (#seats, #subscriptions) — ลิงก์ "Manage licences" จาก BU/Cluster edit ใช้รูปนี้
  const { scrollTo } = useScrollSpy(SECTIONS.map((s) => s.id));

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    if (SECTIONS.some((s) => s.id === id)) scrollTo(id);
  }, [location.hash, scrollTo, SECTIONS]);

  return (
    <Shell>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo={readOnlyShell ? undefined : '/licenses'}
          title={clusterLoading ? 'Loading…' : (cluster?.name || '(unknown cluster)')}
          subtitle={cluster?.code ? `Licenses · ${cluster.code}` : 'Licenses'}
        />

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-6 pb-24">
          <ClusterEditNav items={SECTIONS} />
          <div className="space-y-6">
            <section id="quota" className="scroll-mt-20">
              <BuQuotaSection
                clusterId={clusterId!}
                canManage={canManage}
                // ต้องอ่านจากแหล่งเดียวกับ ClusterEdit.tsx:637-639 และ ClusterLicenseTable.tsx:102
                // (`cluster.bu_used` จาก backend view) ไม่ใช่นับ `bus.length` เองฝั่ง client —
                // ถ้า backend กรอง soft-deleted หรือ scope ต่างจาก client เมื่อไร สามหน้านี้จะ
                // แสดงเลขไม่ตรงกันเงียบ ๆ
                buUsed={cluster?.bu_used ?? 0}
                businessUnits={bus}
              />
            </section>

            <section id="seats" className="scroll-mt-20">
              <SeatSection clusterId={clusterId!} businessUnits={bus} canManage={canManage} />
            </section>

            {!readOnlyShell && (
              <section id="subscriptions" className="scroll-mt-20">
                <SubscriptionSection clusterId={clusterId!} canManage={canManage} />
              </section>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
};

export default ClusterLicenseDetail;
