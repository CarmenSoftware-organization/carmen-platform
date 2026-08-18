import type { SubscriptionState } from '../types';

/** ภายในกี่วันถือว่า "ใกล้หมดอายุ" — ตรงกับที่ backend ใช้คำนวณ summary.expiring_soon */
export const EXPIRING_SOON_DAYS = 30;

/**
 * true เมื่อสถานะที่แสดงผลยัง 'active' แต่เหลือไม่ถึง EXPIRING_SOON_DAYS วัน
 *
 * backend คำนวณ `state` มาให้แล้ว (ทั้งใน list row และ detail) — ห้าม frontend คำนวณสถานะเอง
 * (swagger: "The frontend must not recompute this — use this field directly") จึงไม่มี
 * `deriveSubscriptionState()` ในไฟล์นี้อีกต่อไป
 *
 * ฟังก์ชันนี้ยังต้องมีอยู่ เพราะ backend ให้ "ใกล้หมดอายุ" แค่เป็นตัวเลขรวมใน
 * `summary.expiring_soon` เท่านั้น ไม่ได้ให้เป็นฟิลด์ต่อแถว — ฝั่ง client ต้องคำนวณเองเพื่อไฮไลต์
 * รายแถวในตาราง
 */
export function isExpiringSoon(
  state: SubscriptionState,
  endDate: string,
  now: Date = new Date(),
): boolean {
  if (state !== 'active') return false;
  const days = (new Date(endDate).getTime() - now.getTime()) / 86_400_000;
  return days <= EXPIRING_SOON_DAYS;
}
