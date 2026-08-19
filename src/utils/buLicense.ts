import type { BusinessUnitLicense, BuLicenseStatus } from '../types';

/** เกณฑ์ "ใกล้หมดอายุ" — ต้องตรงกับฝั่ง backend และ inventory FE */
const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** prefix ที่สคริปต์ backfill เขียนไว้ใน note — FE ใช้ขึ้นป้ายเตือน "ยังไม่ระบุวันจริง" */
const MIGRATED_PREFIX = 'migrated';

/**
 * สถานะของใบ ณ เวลาหนึ่ง — ขอบเขตนับรวมทั้งสองด้าน (วันเริ่มและวันหมดอายุยังถือว่าคุ้มครอง)
 * ให้ตรงกับ view `v_business_unit_seat` ที่ใช้ `now() >= start_date AND now() <= end_date`
 * @param lic - ใบที่ตรวจ / The licence
 * @param now - เวลาอ้างอิง (เทสต์ส่งเข้ามา) / Reference time
 * @returns สถานะ / The status
 */
export function licenseStatus(lic: BusinessUnitLicense, now: Date = new Date()): BuLicenseStatus {
  const t = now.getTime();
  if (t < new Date(lic.start_date).getTime()) return 'scheduled';
  if (t > new Date(lic.end_date).getTime()) return 'expired';
  return 'active';
}

/**
 * ใบที่คุ้มครองอยู่และจะหมดภายใน 30 วัน
 * ใบที่หมดแล้วหรือยังไม่เริ่มไม่นับ — มันไม่ใช่ "กำลังจะหมด"
 * @param lic - ใบที่ตรวจ / The licence
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมด / True when expiring soon
 */
export function isExpiringSoon(lic: BusinessUnitLicense, now: Date = new Date()): boolean {
  if (licenseStatus(lic, now) !== 'active') return false;
  return new Date(lic.end_date).getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS;
}

/**
 * ผลรวมที่นั่งของใบที่คุ้มครองอยู่ — ตัวเลขที่แทนที่ `max_license_users` เดิม
 * @param list - ใบทั้งหมดของ BU / Every licence of the BU
 * @param now - เวลาอ้างอิง / Reference time
 * @returns จำนวนที่นั่ง / Seats currently in force
 */
export function sumActiveLicenses(list: BusinessUnitLicense[], now: Date = new Date()): number {
  return list.reduce((sum, l) => (licenseStatus(l, now) === 'active' ? sum + l.licensed_users : sum), 0);
}

/**
 * ใบที่มาจาก migration และยังไม่มีใครใส่วันหมดอายุจริง
 * @param lic - ใบที่ตรวจ / The licence
 * @returns true เมื่อเป็นใบ placeholder / True for a migrated placeholder
 */
export function isMigratedPlaceholder(lic: BusinessUnitLicense): boolean {
  return (lic.note ?? '').startsWith(MIGRATED_PREFIX);
}
