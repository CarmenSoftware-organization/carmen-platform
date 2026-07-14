import { describe, it, expect } from 'vitest';
import { utilization, isNearLimit, summarizeFleet } from './capacity';

describe('utilization', () => {
  it('grades ok / warn / over against a finite cap', () => {
    expect(utilization(5, 10).level).toBe('ok');
    expect(utilization(9, 10).level).toBe('warn'); // 90%
    expect(utilization(10, 10).level).toBe('over'); // at cap
    expect(utilization(12, 10).level).toBe('over'); // exceeded
  });
  it('treats 0 / null / undefined cap as uncapped', () => {
    for (const cap of [0, null, undefined]) {
      const u = utilization(17, cap);
      expect(u.level).toBe('none');
      expect(u.cap).toBeNull();
      expect(u.pct).toBe(0);
    }
  });
  it('reports rounded percentage', () => {
    expect(utilization(1, 3).pct).toBe(33);
  });
});

describe('isNearLimit', () => {
  it('is true from 90% and never for uncapped', () => {
    expect(isNearLimit(89, 100)).toBe(false);
    expect(isNearLimit(90, 100)).toBe(true);
    expect(isNearLimit(100, 100)).toBe(true);
    expect(isNearLimit(9999, null)).toBe(false);
  });
});

describe('summarizeFleet', () => {
  const clusters = [
    { is_active: true, bu_count: 14, max_license_bu: 20, users_count: 312, total_max_license_users: 400 }, // ok
    { is_active: true, bu_count: 9, max_license_bu: 9, users_count: 88, total_max_license_users: 150 }, // bu over
    { is_active: false, bu_count: 7, max_license_bu: 12, users_count: 95, total_max_license_users: 150 }, // ok, inactive
    { is_active: true, bu_count: 17, max_license_bu: null, users_count: 210, total_max_license_users: null }, // uncapped
  ];

  it('sums capped totals and tracks uncapped separately', () => {
    const s = summarizeFleet(clusters);
    expect(s.bu.used).toBe(14 + 9 + 7);
    expect(s.bu.cap).toBe(20 + 9 + 12);
    expect(s.bu.uncappedCount).toBe(1);
    expect(s.bu.uncappedUsed).toBe(17);
    expect(s.users.used).toBe(312 + 88 + 95);
    expect(s.users.cap).toBe(400 + 150 + 150);
  });

  it('counts total, active and near-limit clusters', () => {
    const s = summarizeFleet(clusters);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.nearLimit).toBe(1); // only the bu-over cluster
  });
});
