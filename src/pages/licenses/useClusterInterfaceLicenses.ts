import { useCallback, useEffect, useRef, useState } from 'react';
import businessUnitInterfaceLicenseService from '../../services/businessUnitInterfaceLicenseService';
import type { BusinessUnit, InterfaceLicense } from '../../types';

export interface InterfaceRow {
  bu: BusinessUnit;
  license: InterfaceLicense;
}

/**
 * ใบสิทธิ์ interface ของทุก BU ใน cluster — รูปเดียวกับ `useClusterSeatLicenses`: ไม่มี endpoint
 * ราย cluster ที่ cluster admin ยิงได้ (`/platform/interface-licenses` ก็อ่านได้ผ่าน
 * `readableClusterScope()` แต่หน้านี้ยิงราย BU ให้ตรงกับที่ตารางที่นั่งทำ จะได้ล้มพร้อมกันเป็นราย BU)
 *
 * `allSettled` ไม่ใช่ `all` และ **แยก "โหลดไม่สำเร็จ" ออกจาก "ไม่มีใบ"**: `failedBus` คือรายชื่อ
 * BU ที่ตอบไม่ได้ — การ์ดต้องบอกว่า "ไม่รู้ของ N หน่วย" ไม่ใช่วาดเหมือนหน่วยนั้นไม่มีใบ
 * แถวถูกแบนราบ (BU × ใบ) และเรียงตามวันหมดอายุ ใบที่หมดเร็วสุดขึ้นก่อน เพราะคำถามของ
 * cluster admin คือ "ใบไหนต้องต่อก่อน"
 */
export function useClusterInterfaceLicenses(clusterId: string | undefined, bus: BusinessUnit[]) {
  const [rows, setRows] = useState<InterfaceRow[]>([]);
  const [failedBus, setFailedBus] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!clusterId || bus.length === 0) { setRows([]); setFailedBus([]); return; }
    const mine = ++reqId.current;
    setLoading(true);
    const settled = await Promise.allSettled(
      bus.map((bu) => businessUnitInterfaceLicenseService.getAll(bu.id)),
    );
    if (mine !== reqId.current) return;
    const next: InterfaceRow[] = [];
    const failed: BusinessUnit[] = [];
    bus.forEach((bu, i) => {
      const r = settled[i];
      if (r.status !== 'fulfilled') { failed.push(bu); return; }
      const res = r.value as { data?: unknown } | unknown[];
      const list = Array.isArray(res) ? res : (res as { data?: unknown }).data;
      (Array.isArray(list) ? (list as InterfaceLicense[]) : []).forEach((license) => next.push({ bu, license }));
    });
    next.sort((a, b) => Date.parse(a.license.end_date) - Date.parse(b.license.end_date));
    setRows(next);
    setFailedBus(failed);
    setLoading(false);
  }, [clusterId, bus]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, failedBus, loading, reload };
}
