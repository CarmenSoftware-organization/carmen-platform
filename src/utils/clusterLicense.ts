import type { ClusterLicense, ClusterLicenseStatus } from '../types';

/** ค่า end_date ที่แปลว่า "ไม่มีวันหมดอายุ" — ค่าที่ส่งไปเขียนลง DB */
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';

/**
 * เกณฑ์ที่ใช้ **อ่าน** ว่าใบเป็น perpetual
 *
 * เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ: คอลัมน์ฝั่ง backend เป็น Timestamptz ค่าที่เขียนจาก
 * เบราว์เซอร์ไทย (2099-12-31T00:00:00+07:00) กับที่ backfill เขียนจาก SQL (2099-12-31T00:00:00Z)
 * ต่างกัน 7 ชั่วโมง — `=== '2099-12-31'` จะทำให้ใบหนึ่งเป็น perpetual อีกใบไม่เป็นทั้งที่ผู้ใช้
 * ทำสิ่งเดียวกัน
 */
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z');

/** ใบนี้ไม่มีวันหมดอายุไหม */
export const isPerpetual = (endDate: string): boolean => Date.parse(endDate) >= PERPETUAL_THRESHOLD;

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
 * ล่าสุดชนะ (tie-break ด้วย `id` ให้ผลคงที่) เหตุผลคือการต่ออายุจริงคือ "ซื้อใบใหม่ที่เริ่มวันที่ X"
 * ใบใหม่ต้องชนะทันทีที่ถึงวันเริ่ม แม้ใบเก่าจะยังไม่หมด — เคสที่ต้องรองรับคือลดโควตากลางสัญญา
 * @returns ใบที่ชนะ หรือ null เมื่อไม่มีใบไหนคุ้มครองอยู่ (cap = 0)
 */
export function activeLicense(list: ClusterLicense[], now: Date = new Date()): ClusterLicense | null {
  const covering = list.filter((l) => licenseStatus(l, now) === 'active');
  if (covering.length === 0) return null;
  return covering.reduce((best, cur) => {
    const d = Date.parse(cur.start_date) - Date.parse(best.start_date);
    if (d !== 0) return d > 0 ? cur : best;
    return cur.id > best.id ? cur : best;
  });
}

/** โควตาที่มีผล — 0 เมื่อไม่มีใบ ไม่ใช่ "ไม่จำกัด" */
export function effectiveCap(list: ClusterLicense[], now: Date = new Date()): number {
  return activeLicense(list, now)?.licensed_bus ?? 0;
}

/** ใกล้หมดอายุใน 30 วันไหม — ใบ perpetual คืน false เสมอ */
export function isExpiringSoon(lic: ClusterLicense, now: Date = new Date()): boolean {
  if (isPerpetual(lic.end_date)) return false;
  if (licenseStatus(lic, now) !== 'active') return false;
  const days = (Date.parse(lic.end_date) - now.getTime()) / 86_400_000;
  return days <= 30;
}
