import { describe, it, expect } from 'vitest';
import { isExpiringSoon } from './subscriptionState';
import { DEFAULT_EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';

const NOW = new Date('2026-08-18T00:00:00.000Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

/**
 * เกณฑ์ที่เทสต์ชุดนี้ใช้ — ตั้งใจใช้ค่าตั้งต้นเพื่อให้ assertion ทุกข้อยังยืนยันพฤติกรรมเดิมก่อนที่
 * เกณฑ์จะกลายเป็นค่าตั้งได้ ส่วนพฤติกรรม "เปลี่ยนเกณฑ์แล้วผลเปลี่ยน" มีเทสต์แยกไว้ข้อสุดท้าย
 */
const WINDOW = DEFAULT_EXPIRING_SOON_DAYS;

describe('DEFAULT_EXPIRING_SOON_DAYS', () => {
  it('is 30 — the fallback used when the expiry_thresholds config cannot be read', () => {
    expect(DEFAULT_EXPIRING_SOON_DAYS).toBe(30);
  });
});

describe('isExpiringSoon', () => {
  it('is false for every non-active state, regardless of how close end_date is', () => {
    expect(isExpiringSoon('expired', daysFromNow(5), WINDOW, NOW)).toBe(false);
    expect(isExpiringSoon('inactive', daysFromNow(5), WINDOW, NOW)).toBe(false);
    expect(isExpiringSoon('expired', daysFromNow(400), WINDOW, NOW)).toBe(false);
    expect(isExpiringSoon('inactive', daysFromNow(-10), WINDOW, NOW)).toBe(false);
  });

  it('is true right at the 30-day boundary', () => {
    expect(isExpiringSoon('active', daysFromNow(WINDOW), WINDOW, NOW)).toBe(true);
  });

  it('is false just past the 30-day boundary', () => {
    expect(isExpiringSoon('active', daysFromNow(WINDOW + 1), WINDOW, NOW)).toBe(false);
  });

  it('is true when end_date has already passed while state is still active', () => {
    // The backend contract says `state` would already be 'expired' once end_date is in the
    // past, but this helper trusts the `state` it's given rather than re-deriving it — a
    // negative day count still satisfies `days <= window`.
    expect(isExpiringSoon('active', daysFromNow(-5), WINDOW, NOW)).toBe(true);
  });

  it('is false when comfortably far from expiry', () => {
    expect(isExpiringSoon('active', daysFromNow(90), WINDOW, NOW)).toBe(false);
  });

  it('follows the window it is given, not the built-in default', () => {
    // จุดสำคัญของทั้งฟีเจอร์: ใบที่เหลือ 60 วันไม่ใกล้หมดอายุที่เกณฑ์ 30 แต่ใกล้ที่เกณฑ์ 90
    // The point of the whole feature: the same licence flips as the operator moves the window.
    expect(isExpiringSoon('active', daysFromNow(60), 30, NOW)).toBe(false);
    expect(isExpiringSoon('active', daysFromNow(60), 90, NOW)).toBe(true);
  });
});
