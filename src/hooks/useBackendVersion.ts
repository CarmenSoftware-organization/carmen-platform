import { useEffect, useState } from 'react';
import versionService, { type BackendVersion } from '../services/versionService';

/**
 * เวอร์ชันของหลังบ้านที่กำลังรันอยู่ หรือ `null` เมื่อยังไม่ได้คำตอบหรือถามไม่สำเร็จ
 * ผู้เรียกต้องซ่อนส่วนที่แสดงผลเมื่อได้ `null` — ไม่มีสถานะ error ให้จัดการ เพราะเวอร์ชัน
 * ที่ดึงไม่ได้ไม่ใช่ความผิดพลาดที่ผู้ใช้ต้องรับรู้
 */
export const useBackendVersion = (): BackendVersion | null => {
  const [version, setVersion] = useState<BackendVersion | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionService.get().then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
};

export default useBackendVersion;
