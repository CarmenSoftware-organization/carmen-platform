import { useCallback, useEffect, useState } from 'react';
import platformConfigService from '../services/platformConfigService';
import { parseApiError } from '../utils/errorParser';
import type { EmailRoutingConfig } from '../types';

export interface UseEmailRoutingResult {
  /** mapping ที่บันทึกไว้ · null = ยังโหลดไม่เสร็จหรือโหลดไม่สำเร็จ */
  routing: EmailRoutingConfig | null;
  loading: boolean;
  /** ข้อความผิดพลาดจากการโหลด — ว่างแปลว่าไม่มีปัญหา */
  error: string;
  /** เขียนค่าที่เพิ่งบันทึกทับใน state โดยไม่ต้องยิงอ่านซ้ำ */
  apply: (next: EmailRoutingConfig) => void;
  reload: () => void;
}

/**
 * mapping "เส้นทางอีเมล → โปรไฟล์ผู้ส่ง" โหลดครั้งเดียวต่อหน้า
 *
 * ยกออกมาจาก `EmailRoutingCard` เพราะตอนนี้มีผู้อ่านสองราย: การ์ด mapping เอง กับการ์ดโปรไฟล์
 * แต่ละใบที่ต้องบอกว่า "โปรไฟล์นี้รับเส้นทางไหนบ้าง" ถ้าต่างคนต่างยิง จะมีจังหวะที่แผงผังสาย
 * ด้านบนกับป้ายบนการ์ดพูดคนละเรื่องบนจอเดียวกัน — ซึ่งแย่กว่าไม่มีป้ายเลย เพราะผู้ดูแลอาจลบ
 * โปรไฟล์ที่ป้ายบอกว่าไม่มีใครใช้ ทั้งที่จริงมีเส้นทางวิ่งอยู่
 *
 * `reload` เดินตัวนับ generation แทนการเรียก fetch ตรง ๆ เพื่อให้ effect เป็นทางเข้าเดียวของ
 * การยิง request และ `cancelled` คุมผลลัพธ์ค้างได้ครบทุกรอบ ไม่ใช่เฉพาะรอบแรก
 *
 * `apply` มีไว้ให้ผู้บันทึกเขียนค่าที่ยิง PUT สำเร็จแล้วทับลงมาตรง ๆ — payload ที่ส่งไปคือค่าที่
 * backend เก็บทั้งใบอยู่แล้ว (ดู `platformConfigService.update`) การอ่านซ้ำจึงได้ค่าเดิมเป๊ะ
 */
export function useEmailRouting(): UseEmailRoutingResult {
  const [routing, setRouting] = useState<EmailRoutingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);
  const apply = useCallback((next: EmailRoutingConfig) => setRouting(next), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    platformConfigService
      .getByKey('email_routing')
      .then((row) => {
        if (cancelled) return;
        setRouting((row?.value ?? {}) as unknown as EmailRoutingConfig);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(parseApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { routing, loading, error, apply, reload };
}
