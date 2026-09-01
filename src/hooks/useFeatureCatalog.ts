import { useCallback, useEffect, useState } from 'react';
import subscriptionService from '../services/subscriptionService';
import { devLog } from '../utils/errorParser';
import type { LicenseFeature } from '../types';

export interface UseFeatureCatalogResult {
  /** ทุกแถวของแค็ตตาล็อก — ทั้ง module แม่ (`parent_key === null`) และลูก ปนกันในชุดเดียว */
  catalog: LicenseFeature[];
  loading: boolean;
  /** โหลดไม่สำเร็จ — ผู้เรียกต้อง **ไม่** ตกไปใช้ตัวหารสำรอง ดูเหตุผลใน `FeatureCompositionBar` */
  failed: boolean;
  reload: () => void;
}

/**
 * แค็ตตาล็อกสิทธิ์ทั้งชุด โหลดครั้งเดียวต่อหน้า
 *
 * ยกออกมาจาก `FeatureSelectionCard` เพราะหน้าแก้ไขกลุ่มสิทธิ์ต้องใช้ **ชุดเดียวกัน** สองที่:
 * แถบสัดส่วนบนหัวหน้า (ตัวหาร = `catalog.length`) กับตัวเลือกด้านล่าง ถ้าต่างคนต่างยิง จะได้
 * สอง request ที่ตอบคนละเวลา แล้วมีจังหวะที่แถบข้างบนกับป้าย `n/total` ข้างล่างพูดคนละเรื่อง
 * บนจอเดียวกัน — ซึ่งแย่กว่าไม่มีแถบเลย
 *
 * `reload` เดินตัวนับ generation แทนการเรียก fetch ตรง ๆ เพื่อให้ effect เป็นทางเข้าเดียว
 * ของการยิง request และ `cancelled` flag คุมผลลัพธ์ค้างได้ครบทุกรอบ ไม่ใช่เฉพาะรอบแรก
 */
export function useFeatureCatalog(): UseFeatureCatalogResult {
  const [catalog, setCatalog] = useState<LicenseFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    subscriptionService
      .getFeatureCatalog()
      .then((res) => {
        if (!cancelled) setCatalog(Array.isArray(res?.data) ? res.data : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        devLog('Failed to load license feature catalog:', err);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [generation]);

  return { catalog, loading, failed, reload };
}
