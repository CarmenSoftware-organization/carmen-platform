import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { TabStrip, type TabStripItem } from '../../components/TabStrip';
import clusterService from '../../services/clusterService';
import { devLog } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { FleetCapacity } from '../clusterManagement/FleetCapacity';
import ClusterLicenseTable from './ClusterLicenseTable';
import SubscriptionTable from './SubscriptionTable';
import { PurchaseLicenseTable } from './PurchaseLicenseTable';
import { SEAT_CONFIG, BU_QUOTA_CONFIG } from './licenseKindConfig';
import type { FleetSummary } from '../../types';

type LicenseView = 'cluster' | 'subscription' | 'seat' | 'bu-quota';
const VIEW_KEY = 'license_center_view';
const VIEW_PARAM = 'tab';
const VIEWS: LicenseView[] = ['cluster', 'subscription', 'seat', 'bu-quota'];

/**
 * ค่าที่มาจากภายนอก (localStorage และ `?tab=`) ต้องตรวจสมาชิกภาพก่อนใช้ — `as LicenseView`
 * ดิบ ๆ แล้ว `|| 'cluster'` จับได้แค่ null ไม่ใช่ค่าขยะ ตอนมีสองค่าไม่มีใครเจอ แต่พอเพิ่มเป็นสี่
 * แล้วเปลี่ยนชื่อค่าเมื่อไร ผู้ใช้เก่า (หรือลิงก์เก่า) จะได้มุมมองว่าง
 */
const isLicenseView = (v: string | null): v is LicenseView =>
  !!v && (VIEWS as string[]).includes(v);

const readStoredView = (): LicenseView => {
  const raw = localStorage.getItem(VIEW_KEY);
  return isLicenseView(raw) ? raw : 'cluster';
};

/**
 * หน้าแรกของ License Center (`/licenses`) — แถบสรุป fleet capacity ด้านบน + สี่มุมมองสลับกันได้
 * ("By cluster" ตารางสถานะ license รายคลัสเตอร์ · "By subscription" ตารางใบสัญญาเดิมจาก Task 4 ·
 * "By seat license"/"By BU quota" ตารางรายใบทั้ง fleet จาก Task 7)
 */
const LicenseCenter: React.FC = () => {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  // ลำดับความสำคัญ: `?tab=` > localStorage > 'cluster' — ลิงก์ที่ระบุมุมมองมาต้องชนะเสมอ
  // ไม่งั้นการส่งลิงก์ให้เพื่อนจะเปิดไม่ตรงกับที่เห็น เพราะปลายทางมี localStorage ของตัวเอง
  const [view, setView] = useState<LicenseView>(() => {
    const fromUrl = searchParams.get(VIEW_PARAM);
    return isLicenseView(fromUrl) ? fromUrl : readStoredView();
  });
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState(false);
  // ตัวกรอง "โควตาใกล้หมดอายุ" มาจากการกดสถิติ "BU quota expiring" ในแถบสรุป — กรองเฉพาะตาราง
  // "By cluster" ด้านล่าง (แถบสรุปเองยังนับทั้ง fleet เสมอ ไม่ถูกกรองตามนี้)
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);

  const changeView = useCallback((v: LicenseView) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
    const next = new URLSearchParams(searchParams);
    next.set(VIEW_PARAM, v);
    // เขียนพารามิเตอร์เสมอ ไม่ลบทิ้งตอนเป็นค่าเริ่มต้นแบบที่ BusinessUnitEdit ทำ — หน้านั้นไม่มี
    // localStorage มาแข่ง แต่หน้านี้มี ถ้าลบ `?tab=cluster` ทิ้งแล้วโหลดใหม่ ค่าเก่าใน storage
    // จะชนะและพาผู้ใช้ไปคนละมุมมองกับที่เพิ่งเลือก
    // replace: true — สลับแท็บไม่ใช่การเดินทาง ปุ่ม Back ควรพากลับหน้าก่อนหน้า ไม่ใช่ไล่แท็บถอยหลัง
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ซิงก์เมื่อ URL ถูกเปลี่ยนจากข้างนอก (วางลิงก์ใหม่ทั้งที่อยู่หน้านี้อยู่แล้ว หรือกดลิงก์ที่ชี้มา
  // ที่ route เดิม ซึ่ง React Router จะไม่ remount ให้) — ตอน changeView เขียนเอง fromUrl จะเท่ากับ
  // view อยู่แล้ว เงื่อนไขนี้จึงไม่ทำงานซ้ำและไม่เกิดลูป
  //
  // ไม่เขียน localStorage ตรงนี้โดยตั้งใจ: storage จำ "แท็บที่ผู้ใช้คนนี้กดเอง" ส่วน `?tab=` คือ
  // การสั่งเฉพาะการเข้าครั้งนั้น ลิงก์ที่คนอื่นส่งมาจึงไม่ควรไปทับความจำของเจ้าของเครื่อง
  // (กฎเดียวกับตอน init ด้านบนที่อ่านจาก URL แล้วก็ไม่เขียน storage เหมือนกัน)
  useEffect(() => {
    const fromUrl = searchParams.get(VIEW_PARAM);
    if (isLicenseView(fromUrl)) {
      if (fromUrl !== view) setView(fromUrl);
      return;
    }
    // มีพารามิเตอร์แต่อ่านไม่ออก (พิมพ์ผิด/ลิงก์เก่าที่ชื่อค่าถูกเปลี่ยน) — จอแสดงมุมมองสำรอง
    // อยู่แล้ว แต่ถ้าปล่อย `?tab=bogus` ค้างไว้ URL จะพูดคนละอย่างกับที่เห็น และถูกส่งต่อไป
    // หลอกคนถัดไปได้ เขียนทับด้วยมุมมองที่แสดงจริง (รอบถัดไป fromUrl จะถูกต้องแล้วจึง return)
    if (fromUrl !== null) {
      const next = new URLSearchParams(searchParams);
      next.set(VIEW_PARAM, view);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, view]);

  const toggleExpiringSoonFilter = () => setExpiringSoonFilter((v) => !v);

  const VIEW_TABS = useMemo<TabStripItem<LicenseView>[]>(() => [
    { id: 'cluster', label: t('pages.licenses.viewByCluster') },
    { id: 'subscription', label: t('pages.licenses.viewBySubscription') },
    { id: 'seat', label: t('pages.licenses.viewBySeat') },
    { id: 'bu-quota', label: t('pages.licenses.viewByBuQuota') },
  ], [t]);

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
    } catch (err: unknown) {
      devLog('Error loading fleet summary:', err);
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
          title={t('pages.licenses.title')}
          subtitle={t('pages.licenses.subtitle')}
        />

        {/* expiring_soon นับเฉพาะใบโควตา BU ไม่รวมใบที่นั่งและใบสัญญา (src/types/index.ts) —
            ป้ายต้องระบุมิติชัดเจน ไม่เขียนกว้าง ๆ ว่า "Licenses expiring" */}
        <FleetCapacity
          summary={fleet}
          loading={fleetLoading}
          error={fleetError}
          expiringLabel={t('pages.licenses.buQuotaExpiring')}
          onExpiringSoonClick={toggleExpiringSoonFilter}
          expiringSoonActive={expiringSoonFilter}
        />

        {/* สี่มุมมองนี้คือ "แง่มุมของข้อมูลชุดเดียวกัน" ไม่ใช่คำสั่งสี่อย่าง — เดิมวาดเป็นปุ่มสี่ตัว
            ลอย ๆ ที่ไม่มีอะไรมัดว่าเป็นชุดเดียวที่เลือกได้ทีละอัน ใช้ TabStrip ซึ่งเป็นภาษาที่รีโป
            ใช้อยู่แล้วสำหรับ "สลับส่วนของสิ่งเดียวกัน" (หน้าแก้ไข BU และ Cluster) แทน

            การแยกสองตัวควบคุมที่ sm ยังอยู่เหมือนเดิมโดยตั้งใจ: TabStrip เลื่อนแนวนอนได้ก็จริง
            แต่วัดที่ 386px แล้วแถบกว้าง 348 ส่วนเนื้อในกว้าง 450 — "By BU quota" เหลือโผล่ 4px
            ซึ่งอ่านไม่ออกว่ามีแท็บที่สี่อยู่ <Select> โชว์ครบสี่ตัวเสมอ จอแคบจึงยังเป็นของมัน */}
        <div className="hidden sm:block">
          <TabStrip tabs={VIEW_TABS} value={view} onChange={changeView} />
        </div>
        <div className="sm:hidden">
          <Select value={view} onValueChange={(v) => changeView(v as LicenseView)}>
            <SelectTrigger aria-label={t('pages.licenses.selectViewAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_TABS.map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
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
