import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import businessUnitService from '../services/businessUnitService';
import applicationService from '../services/applicationService';
import { parseApiError } from '../utils/errorParser';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * ตัวเลือก BU / Application สำหรับ dropdown ของหน้า analytics — โหลดครั้งเดียวตอน mount
 * ไม่ผูกกับช่วงวัน และใช้ร่วมกันทั้งหน้า dashboard และหน้า raw explorer
 *
 * ใช้ `allSettled` ไม่ใช่ `all` โดยตั้งใจ: ถ้าขาใดขาหนึ่งล้ม `all` จะทิ้งผลของขาที่สำเร็จ
 * ไปด้วย ผู้ใช้จะเห็น dropdown ว่างทั้งคู่แล้วสรุปว่าระบบไม่มี BU และไม่มี application เลย
 * ทั้งที่จริงแค่ request เดียวพัง — `allSettled` ให้แต่ละขาเติมตัวเองได้อิสระ และแจ้ง
 * ความล้มเหลวด้วย toast หนึ่งครั้งตามกฎข้อ 12 แทนที่จะเงียบไปเฉย ๆ
 */
export function useAnalyticsFilterOptions(): {
  buOptions: FilterOption[];
  appOptions: FilterOption[];
} {
  const [buOptions, setBuOptions] = useState<FilterOption[]>([]);
  const [appOptions, setAppOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [bus, apps] = await Promise.allSettled([
        businessUnitService.getAll({ page: 1, perpage: 100 }),
        applicationService.getAll({ page: 1, perpage: 100 }),
      ]);
      if (cancelled) return;

      if (bus.status === 'fulfilled') {
        setBuOptions((bus.value.data || []).map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })));
      }
      if (apps.status === 'fulfilled') {
        setAppOptions((apps.value.data || []).map((a) => ({ value: a.id, label: a.name })));
      }

      const failed = [bus, apps].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) toast.error(parseApiError(failed.reason).message);
    })();
    return () => { cancelled = true; };
  }, []);

  return { buOptions, appOptions };
}

/** ชื่อที่อ่านออกของตัวเลือกหนึ่งค่า — ถ้า dropdown ยังโหลดไม่เสร็จก็คืนค่าดิบไปก่อน */
export function optionLabel(options: FilterOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
