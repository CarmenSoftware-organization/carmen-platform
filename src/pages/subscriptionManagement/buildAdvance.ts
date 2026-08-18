import type { SubscriptionStatus } from '../../types';
import { EXPIRING_SOON_DAYS } from '../../utils/subscriptionState';

/**
 * ประกอบ `paginate.advance` เพียงก้อนเดียวสำหรับหน้ารายการสัญญา — ห้ามส่ง `paginate.search`
 * คู่กับ `advance` เด็ดขาด เพราะ backend เลือกใช้ทางใดทางหนึ่งเท่านั้น (`paginate.query.ts:404-431`,
 * ดู `phase-b-backend-contract.md` §8.1) — ส่ง `advance` เมื่อไรก็ตาม `search` ที่แนบไปด้วยจะถูก
 * เพิกเฉยเงียบ ๆ จึงต้องรวมคำค้นมาไว้ใน `where` ก้อนนี้แทน
 *
 * เมื่อ `expiringSoon` เป็น true ตัวกรองสถานะ (`status`) ถูกละเว้นเสมอและถูกบังคับเป็น
 * `active` แทน — ตรงกับนิยาม "ใกล้หมดอายุ" ที่ backend ใช้คำนวณ `summary.expiring_soon`
 * (สถานะที่แสดงผลต้องเป็น active และเหลือไม่เกิน `EXPIRING_SOON_DAYS` วัน)
 *
 * `now` รับเป็นพารามิเตอร์เพื่อให้เทสต์กำหนดเวลาที่แน่นอนได้ (เหมือน `isExpiringSoon`)
 */
export function buildAdvance(
  search: string,
  status: SubscriptionStatus[],
  expiringSoon: boolean,
  now: Date = new Date(),
): string {
  const and: Record<string, unknown>[] = [];

  const q = search.trim();
  if (q) {
    and.push({ subscription_number: { contains: q, mode: 'insensitive' } });
  }

  if (expiringSoon) {
    const until = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000);
    and.push({ status: 'active' });
    and.push({ end_date: { gte: now.toISOString(), lte: until.toISOString() } });
  } else if (status.length > 0) {
    and.push({ status: { in: status } });
  }

  return and.length > 0 ? JSON.stringify({ where: { AND: and } }) : '';
}
