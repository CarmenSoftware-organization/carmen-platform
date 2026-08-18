import { describe, it, expect } from 'vitest';
import { EXPIRING_SOON_DAYS, isExpiringSoon } from './subscriptionState';

const NOW = new Date('2026-08-18T00:00:00.000Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('EXPIRING_SOON_DAYS', () => {
  it('is 30 — matches the backend window used for summary.expiring_soon', () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
  });
});

describe('isExpiringSoon', () => {
  it('is false for every non-active state, regardless of how close end_date is', () => {
    expect(isExpiringSoon('expired', daysFromNow(5), NOW)).toBe(false);
    expect(isExpiringSoon('inactive', daysFromNow(5), NOW)).toBe(false);
    expect(isExpiringSoon('expired', daysFromNow(400), NOW)).toBe(false);
    expect(isExpiringSoon('inactive', daysFromNow(-10), NOW)).toBe(false);
  });

  it('is true right at the 30-day boundary', () => {
    expect(isExpiringSoon('active', daysFromNow(EXPIRING_SOON_DAYS), NOW)).toBe(true);
  });

  it('is false just past the 30-day boundary', () => {
    expect(isExpiringSoon('active', daysFromNow(EXPIRING_SOON_DAYS + 1), NOW)).toBe(false);
  });

  it('is true when end_date has already passed while state is still active', () => {
    // The backend contract says `state` would already be 'expired' once end_date is in the
    // past, but this helper trusts the `state` it's given rather than re-deriving it — a
    // negative day count still satisfies `days <= EXPIRING_SOON_DAYS`.
    expect(isExpiringSoon('active', daysFromNow(-5), NOW)).toBe(true);
  });

  it('is false when comfortably far from expiry', () => {
    expect(isExpiringSoon('active', daysFromNow(90), NOW)).toBe(false);
  });
});
