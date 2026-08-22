import { useCallback, useEffect, useRef, useState } from 'react';
import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import type { BusinessUnit, BusinessUnitLicense } from '../../types';

export interface SeatRow {
  bu: BusinessUnit;
  licenses: BusinessUnitLicense[];
  /** ดึงใบของ BU นี้ไม่สำเร็จ — ต่างจาก "ไม่มีใบ" โดยสิ้นเชิง ดูคอมเมนต์ด้านล่าง */
  failed: boolean;
}

/**
 * ใบที่นั่งของทุก BU ใน cluster — ไม่มี endpoint ราย cluster จึงยิงขนานราย BU
 *
 * ใช้ `allSettled` ไม่ใช่ `all` (มาตรฐาน agent-os/standards/hooks/parallel-loads.md) และ
 * **ต้องแยก "ล้มเหลว" ออกจาก "ศูนย์ใบ" ให้ชัด**: ในระบบนี้ 0 ที่นั่งแปลว่าเชิญผู้ใช้ใหม่ไม่ได้
 * (FSEG เป็นอย่างนั้นอยู่จริง) การกลืน error เป็น 0 จึงทำให้คนอ่านตัดสินใจผิด
 */
export function useClusterSeatLicenses(clusterId: string | undefined, bus: BusinessUnit[]) {
  const [rows, setRows] = useState<SeatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!clusterId || bus.length === 0) { setRows([]); return; }
    const mine = ++reqId.current;
    setLoading(true);
    const settled = await Promise.allSettled(
      bus.map((bu) => businessUnitLicenseService.getAll(bu.id)),
    );
    if (mine !== reqId.current) return;
    setRows(bus.map((bu, i) => {
      const r = settled[i];
      if (r.status !== 'fulfilled') return { bu, licenses: [], failed: true };
      const res = r.value as { data?: unknown } | unknown[];
      const list = Array.isArray(res) ? res : (res as { data?: unknown }).data;
      return { bu, licenses: Array.isArray(list) ? (list as BusinessUnitLicense[]) : [], failed: false };
    }));
    setLoading(false);
  }, [clusterId, bus]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, reload };
}
