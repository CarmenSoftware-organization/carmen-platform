import type { ClusterLicense, ClusterLicenseStatus } from '../types';
import { isPerpetual, PERPETUAL_END_DATE } from '../pages/licenses/licenseDates';
import { normalizeAudit } from './audit';

// re-export เพื่อไม่ให้ผู้เรียกเดิม (BuQuotaSection, ClusterEdit) และเทสต์เดิมพัง
export { isPerpetual, PERPETUAL_END_DATE };

/** สถานะของใบ ณ เวลาที่กำหนด — ไม่รู้จัก `superseded` เพราะตัดสินจากใบเดียวไม่ได้ (ดู `statusMap`) */
export function licenseStatus(lic: ClusterLicense, now: Date = new Date()): ClusterLicenseStatus {
  // ยกเลิกแล้วชนะทุกเงื่อนไขวันที่ — ใบที่ยกเลิกกลางสัญญายังอยู่ในช่วงวันของตัวเองอยู่
  if (lic.cancelled_at) return 'cancelled';
  const t = now.getTime();
  if (Date.parse(lic.start_date) > t) return 'scheduled';
  if (Date.parse(lic.end_date) <= t) return 'expired';
  return 'active';
}

/**
 * ใบที่ชนะ — โควตาที่มีผลจริง
 *
 * **ไม่ใช่ผลรวม** ต่างจากที่นั่งของ BU โดยสิ้นเชิง: กติกาคือใบเดียวแทนที่ ใบที่ `start_date`
 * ล่าสุดชนะ เหตุผลคือการต่ออายุจริงคือ "ซื้อใบใหม่ที่เริ่มวันที่ X" ใบใหม่ต้องชนะทันทีที่ถึงวันเริ่ม
 * แม้ใบเก่าจะยังไม่หมด — เคสที่ต้องรองรับคือลดโควตากลางสัญญา
 *
 * ลำดับ tie-break ต้องตรงกับ DB view `v_cluster_bu_cap` เป๊ะ:
 * `ORDER BY start_date DESC, created_at DESC, id DESC` — สามชั้น ไม่ใช่สองชั้น เพราะ
 * `BuQuotaSection` เขียน `start_date` ผ่าน `toIsoStartOfDay` ทำให้สองใบที่สร้างวันเดียวกันชนกันตรง ๆ
 * บ่อยกว่าที่คิด `created_at` เป็น optional/nullable บนสาย (คอลัมน์ยอมให้เป็น null ได้ในทางทฤษฎี) —
 * เมื่อฝั่งใดฝั่งหนึ่งของคู่ที่เทียบขาด `created_at` หรือ parse ไม่ได้ ต้องตกไปที่ `id` เสมอ ห้ามให้
 * ผลลัพธ์เป็น NaN แล้วเทียบต่อ (NaN > x และ NaN < x เป็น false ทั้งคู่ — reduce จะเงียบ ๆ เลือกผิด)
 * @returns ใบที่ชนะ หรือ null เมื่อไม่มีใบไหนคุ้มครองอยู่ (cap = 0)
 */
export function activeLicense(list: ClusterLicense[], now: Date = new Date()): ClusterLicense | null {
  // ใบที่ยกเลิกแล้วถูก licenseStatus คืนเป็น 'cancelled' จึงหลุดจาก filter นี้เอง — ตรงกับ
  // `AND cancelled_at IS NULL` ใน v_cluster_bu_cap เป๊ะ ถ้าสองที่นี้ไม่ตรงกัน FE จะโชว์ cap
  // จากใบที่ backend ไม่นับแล้ว
  const covering = list.filter((l) => licenseStatus(l, now) === 'active');
  if (covering.length === 0) return null;
  return covering.reduce((best, cur) => {
    const startDiff = Date.parse(cur.start_date) - Date.parse(best.start_date);
    if (startDiff !== 0) return startDiff > 0 ? cur : best;

    // อ่านผ่าน normalizeAudit ไม่ใช่ cur.created_at/best.created_at ตรง ๆ — เมื่อ gateway ติด
    // decorator ลบฟิลด์แบน created_at ออก (กิ่ง backend ถัดไป) การอ่านตรงจะได้ undefined เงียบ ๆ
    // ทั้งคู่กลายเป็น NaN แล้วตกไปที่ tie-break id ผิดใบ
    const curCreated = normalizeAudit(cur).created?.at;
    const bestCreated = normalizeAudit(best).created?.at;
    const curCreatedMs = curCreated ? Date.parse(curCreated) : NaN;
    const bestCreatedMs = bestCreated ? Date.parse(bestCreated) : NaN;
    const createdDiff = curCreatedMs - bestCreatedMs;
    if (!Number.isNaN(createdDiff) && createdDiff !== 0) return createdDiff > 0 ? cur : best;

    return cur.id > best.id ? cur : best;
  });
}

/**
 * สถานะของทุกใบในลิสต์ รวม `superseded` ที่ `licenseStatus` ตัดสินเองไม่ได้
 *
 * `superseded` ต้องรู้ว่ามีใบอื่นที่ใหม่กว่าไหม จึงต้องเห็นลิสต์ทั้งคลัสเตอร์ ไม่ใช่ใบเดียว —
 * นี่คือเหตุผลที่ฟังก์ชันนี้มีอยู่แทนที่จะขยาย `licenseStatus`
 *
 * ใบไหน in force เชื่อ `is_in_force` จาก backend ก่อนเสมอ (view เป็นคนตัดสิน) ตกไปที่
 * `activeLicense()` เฉพาะตอนที่ทั้งลิสต์ไม่มีใบไหนส่ง `is_in_force` มาเลย — เส้นทางที่โหลดผ่าน
 * `getAll` ราย cluster ยังไม่มีฟิลด์นี้ · ห้ามอ่าน `is_in_force === undefined` เป็น false ทีละใบ
 * ไม่งั้นหน้าที่ยังไม่ได้อัปเดตจะแสดงว่าไม่มีใบไหน in force เลย
 *
 * Statuses for every licence in one pass, including `superseded` — which a single licence can
 * never determine for itself. Trusts the backend's `is_in_force` (the view decides) and only
 * falls back to `activeLicense()` when no row in the list carries the field at all.
 *
 * @param list - ใบทั้งหมดของคลัสเตอร์เดียว / Every licence of ONE cluster
 * @param now - เวลาอ้างอิง / Reference time
 * @returns แมป id ของใบ → สถานะ / Map of licence id to its status
 */
export function statusMap(
  list: ClusterLicense[],
  now: Date = new Date(),
): Map<string, ClusterLicenseStatus> {
  const backendKnows = list.some((l) => l.is_in_force !== undefined);
  const winnerId = backendKnows
    ? list.find((l) => l.is_in_force)?.id
    : activeLicense(list, now)?.id;

  const out = new Map<string, ClusterLicenseStatus>();
  for (const l of list) {
    const base = licenseStatus(l, now);
    // เฉพาะใบที่ยังอยู่ในช่วงวันเท่านั้นที่ถูก "แทนที่" ได้ — ใบ scheduled/expired/cancelled
    // มีเหตุผลของตัวเองอยู่แล้วว่าทำไมไม่ให้โควตา
    out.set(l.id, base === 'active' && l.id !== winnerId ? 'superseded' : base);
  }
  return out;
}

/**
 * ใกล้หมดอายุภายใน `days` วันไหม — ใบ perpetual คืน false เสมอ
 *
 * `days` บังคับด้วยเหตุผลเดียวกับใน `utils/subscriptionState.ts`: จุดเรียกที่ลืมส่งจะค้างที่ 30
 * เงียบ ๆ ตลอดไป · ค่าที่ถูกต้องมาจาก `useExpiryThresholds().thresholds.bu_quota_days`
 * Required for the same reason as in subscriptionState.ts.
 * @param lic - ใบที่ตรวจ / The licence
 * @param days - เกณฑ์เป็นวัน จาก `thresholds.bu_quota_days` / The window, in days
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมดอายุ / True when expiring soon
 */
export function isExpiringSoon(lic: ClusterLicense, days: number, now: Date = new Date()): boolean {
  if (isPerpetual(lic.end_date)) return false;
  if (licenseStatus(lic, now) !== 'active') return false;
  const daysLeft = (Date.parse(lic.end_date) - now.getTime()) / 86_400_000;
  return daysLeft <= days;
}
