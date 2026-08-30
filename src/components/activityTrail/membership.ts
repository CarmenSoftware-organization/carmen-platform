import type { ActivityLogEntry } from '../../types';
import type { TKey } from '../../i18n/types';

/** คำนำหน้าของ event_type ที่ logPlatformEvent แบบมือใช้บันทึกการเปลี่ยนสมาชิก */
const MEMBERSHIP_PREFIX = 'membership.';

/**
 * บอกว่าแถวนี้เป็นการเปลี่ยนสมาชิกหรือไม่
 *
 * แถวกลุ่มนี้มี `old_data`/`new_data` เป็น null ทั้งคู่ — ตัวแสดง diff จะบอกว่า
 * "ไม่มีฟิลด์ใดเปลี่ยน" ซึ่งอ่านแล้วเข้าใจผิด เพราะมันไม่ใช่การแก้ฟิลด์ตั้งแต่แรก
 * @param entry - รายการประวัติหนึ่งรายการ / one history entry
 * @returns true เมื่อเป็นการเปลี่ยนสมาชิก / true when the entry is a membership change
 */
export const isMembershipEntry = (entry: ActivityLogEntry): boolean =>
  typeof entry.meta_data?.event_type === 'string' &&
  entry.meta_data.event_type.startsWith(MEMBERSHIP_PREFIX);

/**
 * คีย์ข้อความของการเปลี่ยนสมาชิกหนึ่งแถว
 * @param entry - รายการประวัติที่เป็น membership event / a membership history entry
 * @returns คีย์สำหรับ t() หรือ undefined เมื่อเป็น event ที่ยังไม่รู้จัก / the i18n key, or undefined for an unknown event
 */
export const membershipKey = (entry: ActivityLogEntry): TKey | undefined => {
  const event = entry.meta_data?.event_type;
  if (event === 'membership.granted') return 'pages.activityTrail.membershipGranted';
  if (event === 'membership.revoked') return 'pages.activityTrail.membershipRevoked';
  // event ชนิดอื่นที่ขึ้นต้นด้วย membership. อาจถูกเพิ่มทีหลัง — ไม่เดาข้อความให้
  return undefined;
};
