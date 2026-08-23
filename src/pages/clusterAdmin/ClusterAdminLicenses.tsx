import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import clusterLicenseService from '../../services/clusterLicenseService';
import { devLog } from '../../utils/errorParser';
import { activeLicense } from '../../utils/clusterLicense';
import { CapacityStrip } from './CapacityStrip';
import { SeatsByBuTable } from './licenses/SeatsByBuTable';
import { QuotaLedgerCard } from './licenses/QuotaLedgerCard';
import { BuRankingCard } from './licenses/BuRankingCard';
import { useLicenseLedger } from '../licenses/useLicenseLedger';
import { useClusterSeatLicenses } from '../licenses/useClusterSeatLicenses';
import type { BusinessUnit, Cluster, ClusterLicense } from '../../types';

/**
 * `/cluster-admin/:clusterId/licenses` — สิทธิ์ที่คลัสเตอร์นี้ซื้อไว้ อ่านอย่างเดียว
 *
 * หน้านี้แยกไฟล์จาก `licenses/ClusterLicenseDetail.tsx` (ของ platform admin) โดยตั้งใจ ไม่ใช่
 * ธงเปิด-ปิดในไฟล์เดียว: สองหน้าตอบคนละคำถาม platform admin มาที่นี่เพื่อ *ออกใบ* — หน้าจึงเป็น
 * ledger ราย BU พร้อมปุ่มเพิ่ม/แก้/ลบต่อการ์ด ส่วน cluster admin มาเพื่อรู้ว่า *พอไหม* — หน้าจึง
 * เปิดด้วยสองสระว่ายน้ำที่ใช้อยู่จริง แล้วค่อยเป็นตารางเทียบราย BU ส่วนตัวใบยุบไว้ข้างล่าง
 *
 * ไม่มีทางเขียนใด ๆ ที่นี่ และไม่ใช่เพราะซ่อนปุ่ม: cluster admin ไม่มีสิทธิ์ใดใน
 * EffectivePermissions เลย (สมาชิกภาพมาจากตารางคลัสเตอร์ ไม่ใช่ `tb_user_tb_platform_role`)
 * ทุก endpoint เขียนของ license บังคับ `subscription.manage` จึงตอบ 403 เสมอ — และหน้านี้
 * ไม่ยิง `GET /platform/subscriptions` เลยด้วยเหตุผลเดียวกัน (403 ทุกครั้ง ไม่ใช่ edge case)
 */
export default function ClusterAdminLicenses() {
  const { clusterId } = useParams<{ clusterId: string }>();

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [clusterLoading, setClusterLoading] = useState(true);
  const [bus, setBus] = useState<BusinessUnit[]>([]);

  const quota = useLicenseLedger<ClusterLicense>(clusterId, clusterLicenseService);
  const seats = useClusterSeatLicenses(clusterId, bus);

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    setClusterLoading(true);
    clusterService
      .getById(clusterId)
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
    let cancelled = false;
    void (async () => {
      try {
        // เส้นทางเดียวกับ ClusterEdit.tsx — envelope `{ data }` ต้อง unwrap เอง
        const data = await businessUnitService.getAll({ perpage: -1 });
        const items = data.data || data;
        const all: BusinessUnit[] = Array.isArray(items) ? items : [];
        if (cancelled) return;
        setBus(
          all
            .filter((bu) => bu.cluster_id === clusterId)
            .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())),
        );
      } catch (err) {
        devLog('Failed to load business units:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  // โควตาที่มีผล = ใบที่ชนะใบเดียว · `null` เมื่อโหลดใบไม่สำเร็จ เพื่อไม่ให้ป้าย Beyond quota
  // ขึ้นจากตัวเลขที่ไม่ใช่ข้อเท็จจริง (กติกาเดียวกับ BuQuotaSection ของหน้า platform)
  const quotaCap = quota.loadFailed ? null : (activeLicense(quota.licenses)?.licensed_bus ?? 0);

  return (
    <ClusterAdminLayout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={clusterLoading ? 'Loading…' : (cluster?.name || '(unknown cluster)')}
          subtitle={cluster?.code ? `Licences · ${cluster.code}` : 'Licences'}
        />

        {clusterLoading ? (
          <Card className="p-0">
            <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-3 p-5 sm:p-6">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          </Card>
        ) : (
          // ตัวเลขทั้งสี่มาจาก detail endpoint ของ cluster ตรง ๆ (`bu_used`/`bu_cap`/`users_count`/
          // `total_max_license_users`) ไม่ใช่นับจากรายการที่หน้านี้โหลดมาเอง — แหล่งเดียวกับที่
          // ClusterProfile และ ClusterEdit ใช้ ถ้า backend เปลี่ยน scope เมื่อไร ทุกหน้าขยับพร้อมกัน
          <CapacityStrip
            bu={{
              used: cluster?.bu_used ?? 0,
              cap: cluster?.bu_cap ?? 0,
              endDate: cluster?.bu_cap_end_date ?? null,
            }}
            seats={{ used: cluster?.users_count ?? 0, cap: cluster?.total_max_license_users ?? null }}
          />
        )}

        <SeatsByBuTable
          rows={seats.rows}
          loading={seats.loading}
          clusterId={clusterId!}
          onRetry={() => void seats.reload()}
        />

        <QuotaLedgerCard
          licenses={quota.licenses}
          loading={quota.loading}
          loadFailed={quota.loadFailed}
          onRetry={quota.reload}
        />

        <BuRankingCard businessUnits={bus} clusterId={clusterId!} cap={quotaCap} />
      </div>
    </ClusterAdminLayout>
  );
}
