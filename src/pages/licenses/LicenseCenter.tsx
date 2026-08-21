import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import clusterService from '../../services/clusterService';
import { summarizeFleet } from '../../utils/capacity';
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

  const changeView = (v: LicenseView) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  // แถบสรุปต้องเห็นภาพรวมทั้ง fleet ไม่ใช่แค่หน้าปัจจุบันของตาราง cluster (ซึ่งเป็น serverSide
  // จึงเห็นแค่หน้าเดียว) — ยิงคำขอเดียวแยกต่างหาก ไม่แบ่งหน้า เอาเฉพาะคลัสเตอร์ที่ยังไม่ถูกลบ
  // ใช้ `summary` จาก backend ถ้ามี ไม่งั้น fallback คำนวณเองฝั่ง frontend (เหมือน ClusterManagement)
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const data = await clusterService.getAll({
        perpage: -1,
        advance: JSON.stringify({ where: { deleted_at: null } }),
      });
      if (data.summary) {
        setFleet(data.summary);
        return;
      }
      const items = ((data as { data?: unknown }).data ?? data) as Record<string, unknown>[];
      const mapped = (Array.isArray(items) ? items : []).map((item) => ({
        is_active: item.is_active as boolean | undefined,
        bu_count: (item.bu_count ?? (item._count as { tb_business_unit?: number })?.tb_business_unit ?? 0) as number,
        bu_cap: (item.bu_cap ?? 0) as number,
        bu_used: (item.bu_used ?? item.bu_count ?? (item._count as { tb_business_unit?: number })?.tb_business_unit ?? 0) as number,
        users_count: (item.users_count ?? (item._count as { tb_cluster_user?: number })?.tb_cluster_user ?? 0) as number,
        total_max_license_users: item.total_max_license_users as number | null | undefined,
      }));
      setFleet(summarizeFleet(mapped));
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
        <FleetCapacity summary={fleet} loading={fleetLoading} expiringLabel="BU quota expiring" />

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

        {view === 'cluster' ? <ClusterLicenseTable /> : <SubscriptionTable embedded />}
      </div>
    </Layout>
  );
};

export default LicenseCenter;
