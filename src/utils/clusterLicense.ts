import type { ClusterLicense, ClusterLicenseStatus } from '../types';
import { isPerpetual, PERPETUAL_END_DATE, EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';
import { normalizeAudit } from './audit';

// re-export เพื่อไม่ให้ผู้เรียกเดิม (BuQuotaSection, ClusterEdit) และเทสต์เดิมพัง
export { isPerpetual, PERPETUAL_END_DATE };

/** สถานะของใบ ณ เวลาที่กำหนด */
export function licenseStatus(lic: ClusterLicense, now: Date = new Date()): ClusterLicenseStatus {
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

/** ใกล้หมดอายุใน 30 วันไหม — ใบ perpetual คืน false เสมอ */
export function isExpiringSoon(lic: ClusterLicense, now: Date = new Date()): boolean {
  if (isPerpetual(lic.end_date)) return false;
  if (licenseStatus(lic, now) !== 'active') return false;
  const days = (Date.parse(lic.end_date) - now.getTime()) / 86_400_000;
  return days <= EXPIRING_SOON_DAYS;
}
