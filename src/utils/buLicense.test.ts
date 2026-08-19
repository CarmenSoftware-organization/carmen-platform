import { describe, it, expect } from 'vitest';
import { licenseStatus, isExpiringSoon, sumActiveLicenses, isMigratedPlaceholder } from './buLicense';
import type { BusinessUnitLicense } from '../types';

const NOW = new Date('2026-08-19T00:00:00.000Z');

const lic = (over: Partial<BusinessUnitLicense> = {}): BusinessUnitLicense => ({
  id: 'l1',
  business_unit_id: 'bu1',
  licensed_users: 10,
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2026-12-31T00:00:00.000Z',
  doc_version: 0,
  ...over,
});

describe('licenseStatus', () => {
  it('active เมื่อ now อยู่ระหว่าง start กับ end', () => {
    expect(licenseStatus(lic(), NOW)).toBe('active');
  });

  it('scheduled เมื่อยังไม่ถึง start', () => {
    expect(licenseStatus(lic({ start_date: '2026-10-01T00:00:00.000Z' }), NOW)).toBe('scheduled');
  });

  it('expired เมื่อเลย end แล้ว', () => {
    expect(licenseStatus(lic({ end_date: '2025-12-31T00:00:00.000Z' }), NOW)).toBe('expired');
  });

  it('ขอบเขตนับรวมทั้งสองด้าน — วันเริ่มและวันหมดอายุยังถือว่า active', () => {
    expect(licenseStatus(lic({ start_date: NOW.toISOString() }), NOW)).toBe('active');
    expect(licenseStatus(lic({ end_date: NOW.toISOString() }), NOW)).toBe('active');
  });
});

describe('sumActiveLicenses', () => {
  it('บวกเฉพาะใบ active — scheduled และ expired ไม่นับ', () => {
    const list = [
      lic({ id: 'a', licensed_users: 10 }),
      lic({ id: 'b', licensed_users: 5, start_date: '2026-06-01T00:00:00.000Z', end_date: '2027-05-31T00:00:00.000Z' }),
      lic({ id: 'c', licensed_users: 3, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
      lic({ id: 'd', licensed_users: 8, start_date: '2025-01-01T00:00:00.000Z', end_date: '2025-12-31T00:00:00.000Z' }),
    ];
    expect(sumActiveLicenses(list, NOW)).toBe(15);
  });

  it('รายการว่างได้ 0 ไม่ใช่ NaN', () => {
    expect(sumActiveLicenses([], NOW)).toBe(0);
  });
});

describe('isExpiringSoon', () => {
  it('true เมื่อเหลือไม่เกิน 30 วัน', () => {
    expect(isExpiringSoon(lic({ end_date: '2026-09-01T00:00:00.000Z' }), NOW)).toBe(true);
  });

  it('false เมื่อเหลือเกิน 30 วัน', () => {
    expect(isExpiringSoon(lic({ end_date: '2026-12-31T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('false สำหรับใบที่หมดอายุไปแล้ว — มันหมดแล้ว ไม่ใช่กำลังจะหมด', () => {
    expect(isExpiringSoon(lic({ end_date: '2025-12-31T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('false สำหรับใบที่ยังไม่เริ่ม แม้ end_date จะอยู่ในหน้าต่าง 30 วัน', () => {
    expect(isExpiringSoon(lic({ start_date: '2026-09-01T00:00:00.000Z', end_date: '2026-09-10T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('isMigratedPlaceholder', () => {
  it('จับใบที่ backfill มาจาก note prefix', () => {
    expect(isMigratedPlaceholder(lic({ note: 'migrated — ต้องระบุวันหมดอายุจริง' }))).toBe(true);
  });

  it('ใบที่แอดมินพิมพ์ note เองไม่ถูกจับ', () => {
    expect(isMigratedPlaceholder(lic({ note: 'ซื้อเพิ่มรอบสอง' }))).toBe(false);
  });

  it('คำว่า migrated อยู่กลางข้อความไม่ถูกจับ — ต้องเป็น prefix เท่านั้น ไม่ใช่แค่มีคำนี้อยู่', () => {
    expect(isMigratedPlaceholder(lic({ note: 'ระบบ migrated ไว้ก่อนหน้านี้' }))).toBe(false);
  });

  it('ไม่มี note ก็ไม่ใช่ placeholder', () => {
    expect(isMigratedPlaceholder(lic())).toBe(false);
  });
});
