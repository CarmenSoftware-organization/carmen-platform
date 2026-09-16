import { toast } from 'sonner';
import { parseApiError } from './errorParser';
import type { TFunction } from '../i18n/types';

export const migrationStatusCode = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

/** Map a tenant-migration API error to the canonical toast. */
export const handleMigrationError = (err: unknown, t?: TFunction): void => {
  const code = migrationStatusCode(err);
  if (code === 403) {
    toast.error(t ? t('pages.tenantMigration.disabledOrSuperAdmin') : 'Migrations are disabled or require super-admin.');
  } else if (code === 409) {
    toast.warning(t ? t('pages.tenantMigration.alreadyRunning') : 'A migration is already running. Try again shortly.');
  } else {
    toast.error(parseApiError(err).message);
  }
};

/**
 * ชื่อโฟลเดอร์ migration ของ prisma: timestamp 6 หลักขึ้นไป + '_' + slug
 * ตัวเดียวกับที่ backend ใช้ตรวจ (MIGRATION_NAME_RE ใน tenant_migration.service.ts และ
 * platform_migration.service.ts) — ส่งชื่อที่ไม่ผ่านตัวนี้ไปจะได้ 400 กลับมา
 */
export const MIGRATION_NAME_RE = /^[0-9]{6,}_[A-Za-z0-9_-]+$/;

const MIGRATION_NAME_SCAN_RE = /[0-9]{6,}_[A-Za-z0-9_-]+/g;

/**
 * แกะชื่อ migration ที่ล้มเหลวออกจาก error ของ GET /status
 *
 * `prisma migrate status` เจอ migration ค้างแล้ว exit non-zero โดยข้อความไม่มีคำว่า
 * "not yet been applied" backend จึงตอบเป็น error 500 ที่มีข้อความดิบของ prisma ติดมา
 * แทนที่จะเป็น payload สถานะปกติ — ชื่อที่ต้องใช้ resolve อยู่ในข้อความนั้น
 *
 * อ่านจาก `err.response.data.message` ตรง ๆ ไม่ใช่จาก getErrorDetail() เพราะ getErrorDetail
 * redact ข้อความทิ้งทั้งก้อนบน production (errorParser.ts) ถ้าอ่านจากที่นั่นการเติมช่อง
 * อัตโนมัติจะทำงานเฉพาะบนเครื่อง dev แล้วเงียบบน production
 *
 * คืน undefined เมื่อแกะไม่ได้ — ปุ่ม Resolve ยังโผล่ตามเดิม ผู้ใช้พิมพ์ชื่อเองได้
 */
export const parseFailedMigration = (err: unknown): string | undefined => {
  const raw =
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err as { message?: string })?.message;
  if (typeof raw !== 'string' || !/fail/i.test(raw)) return undefined;
  // เอาตัวที่อยู่หลังคำว่า failed ตัวแรก — ข้อความของ prisma ไล่ชื่อ migration ที่ล้มเหลว
  // ต่อจากบรรทัด "Following migration have failed:" ส่วนชื่อก่อนหน้านั้นเป็นรายการที่สำเร็จ
  const tail = raw.slice(raw.search(/fail/i));
  const m = tail.match(MIGRATION_NAME_SCAN_RE);
  return m?.[0];
};
