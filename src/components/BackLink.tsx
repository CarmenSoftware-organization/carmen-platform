import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * ทางออกแบบมีข้อความ ที่วางเหนือ hero ของหน้าแก้ไข — คนละบทบาทกับปุ่มลูกศรใน `PageHeader`
 * ซึ่งนั่งอยู่ข้างชื่อเรื่อง หน้าที่วาด hero เป็นของตัวเอง (`UserIdentityHero`,
 * `ClusterPlate`, `NewsMasthead`, …) ไม่ได้เรนเดอร์ `PageHeader` จึงต้องมีทางออกของมันเอง
 * และเคยมีคนละแบบทุกหน้า
 *
 * เป้าแตะ 44px มาจาก `::before` ไม่ใช่ `min-h-11`: min-height ขยายกล่องของลิงก์จริง แล้วดัน
 * ทุกอย่างที่อยู่ถัดลงไปในหน้า ส่วน pseudo-element กินพื้นที่แตะโดยไม่เปลี่ยนกล่องที่ตาเห็น
 * — เหตุผลเดียวกับที่ `ClusterEdit` เลือกวิธีนี้ไว้ก่อนหน้า
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1.5 text-sm transition-colors before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
