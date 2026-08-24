import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import { useAuth } from '../../context/AuthContext';
import { devLog, isNotFoundError } from '../../utils/errorParser';
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

/**
 * `/licenses/:clusterId` (platform admin) — สาม "ชั้น" ของ license ของ cluster หนึ่งไว้ในหน้าเดียว:
 * โควตา BU (ใบที่ชนะใบเดียว) · ที่นั่ง (ผลรวมใบที่ active ต่อ BU) · สัญญา ใช้ scrollspy + nav
 * แบบเดียวกับ `ClusterEdit` (`useScrollSpy` + `ClusterEditNav` ที่ `../clusterEdit/`)
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
  const { hasPermission } = useAuth();
  const canManage = hasPermission('subscription.manage');

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

  // เรียก useScrollSpy เองอีกชุด (แยกจากตัวที่ ClusterEditNav ใช้ภายใน) เพื่อเอา `scrollTo` มารองรับ
  // deep-link ผ่าน hash (#seats, #subscriptions) — ลิงก์ "Manage licences" จาก BU/Cluster edit ใช้รูปนี้
  const { scrollTo } = useScrollSpy(ALL_SECTIONS.map((s) => s.id));

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    if (ALL_SECTIONS.some((s) => s.id === id)) scrollTo(id);
  }, [location.hash, scrollTo]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/licenses"
          title={clusterLoading
            ? 'Loading…'
            : (cluster?.name || (clusterMissing ? 'Cluster not found or deleted' : 'Cluster unavailable'))}
          subtitle={cluster?.code ? `Licenses · ${cluster.code}` : 'Licenses'}
        />

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-6 pb-24">
          <ClusterEditNav items={ALL_SECTIONS} />
          <div className="space-y-6">
            <section id="quota" className="scroll-mt-20">
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
              />
            </section>

            <section id="seats" className="scroll-mt-20">
              <SeatSection clusterId={clusterId!} businessUnits={bus} canManage={canManage} />
            </section>

            <section id="subscriptions" className="scroll-mt-20">
              <SubscriptionSection clusterId={clusterId!} canManage={canManage} />
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ClusterLicenseDetail;
