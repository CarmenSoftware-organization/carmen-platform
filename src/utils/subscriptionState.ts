import type { SubscriptionState } from '../types';

/**
 * true เมื่อสถานะที่แสดงผลยัง 'active' แต่เหลือไม่ถึง `days` วัน
 *
 * backend คำนวณ `state` มาให้แล้ว (ทั้งใน list row และ detail) — ห้าม frontend คำนวณสถานะเอง
 * (swagger: "The frontend must not recompute this — use this field directly") จึงไม่มี
 * `deriveSubscriptionState()` ในไฟล์นี้
 *
 * ฟังก์ชันนี้ยังต้องมีอยู่ เพราะ backend ให้ "ใกล้หมดอายุ" แค่เป็นตัวเลขรวมใน
 * `summary.expiring_soon` เท่านั้น ไม่ได้ให้เป็นฟิลด์ต่อแถว — ฝั่ง client ต้องคำนวณเองเพื่อไฮไลต์
 * รายแถวในตาราง
 *
 * `days` เป็นพารามิเตอร์บังคับโดยเจตนา ไม่ใช่ optional ที่ตกไปใช้ 30 เอง — จุดเรียกที่ลืมส่งจะ
 * ค้างอยู่ที่ 30 เงียบ ๆ ตลอดไป ผู้ดูแลตั้ง 45 แล้วบางหน้ายังเตือนที่ 30 โดยไม่มีอะไรฟ้อง
 * ค่าที่ถูกต้องมาจาก `useExpiryThresholds().thresholds.subscription_days`
 * Required on purpose: an optional default would silently pin a forgotten call site to 30 days.
 * @param state - สถานะที่ backend คำนวณมา / The state the backend computed
 * @param endDate - วันหมดอายุ ISO / The ISO end date
 * @param days - เกณฑ์เป็นวัน จาก `thresholds.subscription_days` / The window, in days
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมดอายุ / True when expiring soon
 */
export function isExpiringSoon(
  state: SubscriptionState,
  endDate: string,
  days: number,
  now: Date = new Date(),
): boolean {
  if (state !== 'active') return false;
  const daysLeft = (new Date(endDate).getTime() - now.getTime()) / 86_400_000;
  return daysLeft <= days;
}
