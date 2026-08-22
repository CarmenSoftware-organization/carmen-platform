import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import clusterService from '../../services/clusterService';
import { FleetCapacity } from '../clusterManagement/FleetCapacity';
import ClusterLicenseTable from './ClusterLicenseTable';
import SubscriptionTable from './SubscriptionTable';
import { PurchaseLicenseTable } from './PurchaseLicenseTable';
import { SEAT_CONFIG, BU_QUOTA_CONFIG } from './licenseKindConfig';
import type { FleetSummary } from '../../types';

type LicenseView = 'cluster' | 'subscription' | 'seat' | 'bu-quota';
const VIEW_KEY = 'license_center_view';
const VIEWS: LicenseView[] = ['cluster', 'subscription', 'seat', 'bu-quota'];
const VIEW_OPTIONS: { value: LicenseView; label: string }[] = [
  { value: 'cluster', label: 'By cluster' },
  { value: 'subscription', label: 'By subscription' },
  { value: 'seat', label: 'By seat licence' },
  { value: 'bu-quota', label: 'By BU quota' },
];

/**
 * ค่าจาก localStorage ต้องตรวจสมาชิกภาพก่อนใช้ — `as LicenseView` ดิบ ๆ แล้ว `|| 'cluster'`
 * จับได้แค่ null ไม่ใช่ค่าขยะ ตอนมีสองค่าไม่มีใครเจอ แต่พอเพิ่มเป็นสี่แล้วเปลี่ยนชื่อค่าเมื่อไร
 * ผู้ใช้เก่าจะได้มุมมองว่าง
 */
const readStoredView = (): LicenseView => {
  const raw = localStorage.getItem(VIEW_KEY);
  return VIEWS.includes(raw as LicenseView) ? (raw as LicenseView) : 'cluster';
};

/**
 * หน้าแรกของ License Center (`/licenses`) — แถบสรุป fleet capacity ด้านบน + สี่มุมมองสลับกันได้
 * ("By cluster" ตารางสถานะ license รายคลัสเตอร์ · "By subscription" ตารางใบสัญญาเดิมจาก Task 4 ·
 * "By seat licence"/"By BU quota" ตารางรายใบทั้ง fleet จาก Task 7)
 */
const LicenseCenter: React.FC = () => {
  const [view, setView] = useState<LicenseView>(readStoredView);
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
          subtitle="Fleet-wide license status by cluster, subscription, seat licence, or BU quota."
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

        {/* สี่ปุ่มเรียงแถวเดียวล้นจอ 390px — sm: ขึ้นไปเป็นปุ่ม ต่ำกว่านั้นยุบเป็น <Select> */}
        <div className="hidden sm:flex gap-2">
          {VIEW_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? 'default' : 'outline'}
              onClick={() => changeView(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="sm:hidden">
          <Select value={view} onValueChange={(v) => changeView(v as LicenseView)}>
            <SelectTrigger aria-label="Select license view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {view === 'cluster' ? (
          <ClusterLicenseTable
            expiringSoonFilter={expiringSoonFilter}
            onExpiringSoonChange={setExpiringSoonFilter}
          />
        ) : view === 'subscription' ? (
          <SubscriptionTable embedded />
        ) : view === 'seat' ? (
          <PurchaseLicenseTable config={SEAT_CONFIG} />
        ) : (
          <PurchaseLicenseTable config={BU_QUOTA_CONFIG} />
        )}
      </div>
    </Layout>
  );
};

export default LicenseCenter;
