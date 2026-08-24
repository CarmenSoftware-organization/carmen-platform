import { describe, it, expect } from 'vitest';
import { utilization, seatUtilization } from './capacity';

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
