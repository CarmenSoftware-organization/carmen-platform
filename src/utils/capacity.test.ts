import { describe, it, expect } from 'vitest';
import { utilization, isNearLimit, summarizeFleet, seatUtilization } from './capacity';

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
    expect(s.bu.uncapped_count).toBe(1);
    expect(s.bu.uncapped_used).toBe(17);
    expect(s.users.used).toBe(312 + 88 + 95);
    expect(s.users.cap).toBe(400 + 150 + 150);
  });

  it('counts total, active and near-limit clusters', () => {
    const s = summarizeFleet(clusters);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.inactive).toBe(1);
    expect(s.near_limit).toBe(1); // only the bu-over cluster
  });
});

describe('seatUtilization', () => {
  it('cap = 0 with no usage is ok, with a zero ratio and 0%', () => {
    const s = seatUtilization(0, 0);
    expect(s.level).toBe('ok');
    expect(s.cap).toBe(0);
    expect(s.ratio).toBe(0);
    expect(s.pct).toBe(0);
  });

  it('cap = 0 with any usage is over — zero seats never means unlimited', () => {
    const s = seatUtilization(3, 0);
    expect(s.level).toBe('over');
    expect(s.cap).toBe(0);
    expect(s.ratio).toBe(1);
    expect(s.pct).toBe(100);
  });

  it('grades ok / warn / over against a finite cap, same thresholds as utilization()', () => {
    expect(seatUtilization(5, 10).level).toBe('ok');
    expect(seatUtilization(9, 10).level).toBe('warn'); // exactly 90%
    expect(seatUtilization(10, 10).level).toBe('over'); // exactly 100%
    expect(seatUtilization(12, 10).level).toBe('over'); // exceeded
  });

  it('never returns "none" — the seat system has no uncapped state', () => {
    expect(seatUtilization(0, 0).level).not.toBe('none');
    expect(seatUtilization(50, 100).level).not.toBe('none');
    expect(seatUtilization(0, 5).level).not.toBe('none');
  });

  it('reports rounded percentage', () => {
    expect(seatUtilization(1, 3).pct).toBe(33);
  });
});
