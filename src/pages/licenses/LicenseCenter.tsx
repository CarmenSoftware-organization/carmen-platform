import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import clusterService from '../../services/clusterService';
import { FleetCapacity } from '../clusterManagement/FleetCapacity';
import ClusterLicenseTable from './ClusterLicenseTable';
import SubscriptionTable from './SubscriptionTable';
import type { FleetSummary } from '../../types';

type LicenseView = 'cluster' | 'subscription';
const VIEW_KEY = 'license_center_view';

/**
 * หน้าแรกของ License Center (`/licenses`) — แถบสรุป fleet capacity ด้านบน + สองมุมมองสลับกันได้
 * ("By cluster" ตารางสถานะ license รายคลัสเตอร์ · "By subscription" ตารางใบสัญญาเดิมจาก Task 4)
 */
const LicenseCenter: React.FC = () => {
  const [view, setView] = useState<LicenseView>(
    () => (localStorage.getItem(VIEW_KEY) as LicenseView) || 'cluster',
  );
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  // ตัวกรอง "โควตาใกล้หมดอายุ" มาจากการกดสถิติ "BU quota expiring" ในแถบสรุป — กรองเฉพาะตาราง
  // "By cluster" ด้านล่าง (แถบสรุปเองยังนับทั้ง fleet เสมอ ไม่ถูกกรองตามนี้)
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);

  const changeView = (v: LicenseView) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const toggleExpiringSoonFilter = () => setExpiringSoonFilter((v) => !v);

  // แถบสรุปต้องเห็นภาพรวมทั้ง fleet ไม่ใช่แค่หน้าปัจจุบันของตาราง cluster (ซึ่งเป็น serverSide
  // จึงเห็นแค่หน้าเดียว) — ยิงคำขอเดียวแยกต่างหาก เอาเฉพาะคลัสเตอร์ที่ยังไม่ถูกลบ
  //
  // สเปก §3.2: แถบสรุปอ่านจาก `summary` ที่คำขอเดียวนี้คืนมา ไม่ใช่ยิงคำขอที่สองเพื่อลากทุกแถว —
  // `perpage: -1` เป็นรูปแบบที่เลิกใช้แล้วสำหรับตัวเลขสรุปในหน้านี้ (ก่อนแก้: perpage:-1 ลากทุกแถว
  // ทั้งที่ backend สรุปให้แล้วใน `summary` — เปิดหน้าหนึ่งครั้งเท่ากับยิง cluster สองคำขอโดยไม่จำเป็น)
  // `perpage: 1` พอสำหรับให้ endpoint คำนวณและแนบ `summary` มาด้วย ไม่ต้องพึ่งแถวที่คืนมาเลย ·
  // fallback คำนวณเองฝั่ง frontend (แบบที่ ClusterManagement ทำ) ใช้ไม่ได้อีกต่อไปเมื่อขอมาแค่ 1 แถว
  // (จะได้ตัวเลขที่ผิดแทนที่จะไม่มีตัวเลข) จึงตัดทิ้ง — ถ้า `summary` ไม่มา แถบสรุปตกไปที่ skeleton
  // แทนการเดาตัวเลขจากแถวเดียว
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const data = await clusterService.getAll({
        perpage: 1,
        advance: JSON.stringify({ where: { deleted_at: null } }),
      });
      setFleet(data.summary ?? null);
    } catch {
      setFleet(null); // แถบสรุปตกกลับไปที่ skeleton — ตารางด้านล่างยังทำงานได้ตามปกติ
    } finally {
      setFleetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Licenses"
          subtitle="Fleet-wide license status by cluster or by subscription contract."
        />

        {/* expiring_soon นับเฉพาะใบโควตา BU ไม่รวมใบที่นั่งและใบสัญญา (src/types/index.ts) —
            ป้ายต้องระบุมิติชัดเจน ไม่เขียนกว้าง ๆ ว่า "Licenses expiring" */}
        <FleetCapacity
          summary={fleet}
          loading={fleetLoading}
          expiringLabel="BU quota expiring"
          onExpiringSoonClick={toggleExpiringSoonFilter}
          expiringSoonActive={expiringSoonFilter}
        />

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'cluster' ? 'default' : 'outline'}
            onClick={() => changeView('cluster')}
          >
            By cluster
          </Button>
          <Button
            size="sm"
            variant={view === 'subscription' ? 'default' : 'outline'}
            onClick={() => changeView('subscription')}
          >
            By subscription
          </Button>
        </div>

        {view === 'cluster' ? (
          <ClusterLicenseTable expiringSoonFilter={expiringSoonFilter} />
        ) : (
          <SubscriptionTable embedded />
        )}
      </div>
    </Layout>
  );
};

export default LicenseCenter;
