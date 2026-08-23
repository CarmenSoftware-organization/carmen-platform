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
  { value: 'seat', label: 'By seat license' },
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
 * "By seat license"/"By BU quota" ตารางรายใบทั้ง fleet จาก Task 7)
 */
const LicenseCenter: React.FC = () => {
  const [view, setView] = useState<LicenseView>(readStoredView);
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState(false);
  // ตัวกรอง "โควตาใกล้หมดอายุ" มาจากการกดสถิติ "BU quota expiring" ในแถบสรุป — กรองเฉพาะตาราง
  // "By cluster" ด้านล่าง (แถบสรุปเองยังนับทั้ง fleet เสมอ ไม่ถูกกรองตามนี้)
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);

  const changeView = (v: LicenseView) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const toggleExpiringSoonFilter = () => setExpiringSoonFilter((v) => !v);

  // แถบสรุปอ่านจาก endpoint เฉพาะทางที่ไม่รับตัวกรองเลย จึงเป็นตัวเลขทั้ง fleet เสมอ
  // ตัวกรอง "โควตาใกล้หมดอายุ" ด้านล่างกรองแค่ตาราง ไม่แตะแถบนี้ — พฤติกรรมเดิมไม่เปลี่ยน
  // เปลี่ยนแค่แหล่งที่มา (เดิมขอ `perpage: 1` แล้วหยิบ `summary` ที่แนบมา ซึ่งต้องขอ 1 แถว
  // ที่ไม่ได้ใช้เลยเพื่อให้ backend คำนวณให้)
  //
  // The band reads a dedicated no-filter endpoint. The expiring-soon toggle below filters only
  // the table; it never touched this band and still does not.
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const summary = await clusterService.getFleetSummary();
      setFleet(summary);
      setFleetError(false);
    } catch {
      setFleetError(true); // แถบบอกว่าโหลดไม่ได้ — ตารางด้านล่างยังทำงานได้ตามปกติ
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
          subtitle="Fleet-wide license status by cluster, subscription, seat license, or BU quota."
        />

        {/* expiring_soon นับเฉพาะใบโควตา BU ไม่รวมใบที่นั่งและใบสัญญา (src/types/index.ts) —
            ป้ายต้องระบุมิติชัดเจน ไม่เขียนกว้าง ๆ ว่า "Licenses expiring" */}
        <FleetCapacity
          summary={fleet}
          loading={fleetLoading}
          error={fleetError}
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
