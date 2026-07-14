import { describe, it, expect } from 'vitest';
import { formatClock, dayGroup, relativeTime } from './relativeTime';

// A fixed "now" so the relative helpers are deterministic. 2026-07-14 10:00 local.
const NOW = new Date(2026, 6, 14, 10, 0, 0);
const at = (h: number, m: number, day = 14) => new Date(2026, 6, day, h, m, 0).toISOString();

describe('formatClock', () => {
  it('pads to HH:MM 24h', () => {
    expect(formatClock(at(9, 5))).toBe('09:05');
    expect(formatClock(at(17, 20))).toBe('17:20');
  });
  it('returns empty for missing/invalid input', () => {
    expect(formatClock()).toBe('');
    expect(formatClock('not-a-date')).toBe('');
  });
});

describe('dayGroup', () => {
  it('labels today, yesterday, weekday, then date', () => {
    expect(dayGroup(at(9, 0, 14), NOW).label).toBe('Today');
    expect(dayGroup(at(9, 0, 13), NOW).label).toBe('Yesterday');
    expect(dayGroup(at(9, 0, 10), NOW).label).toBe('Friday'); // 2026-07-10
    expect(dayGroup(at(9, 0, 1), NOW).label).toBe('Jul 1');
  });
  it('gives the same key for events on the same calendar day', () => {
    expect(dayGroup(at(9, 0, 13), NOW).key).toBe(dayGroup(at(23, 0, 13), NOW).key);
  });
  it('falls back to Earlier for invalid input', () => {
    expect(dayGroup(undefined, NOW).label).toBe('Earlier');
  });
});

describe('relativeTime', () => {
  it('phrases recent spans', () => {
    expect(relativeTime(at(10, 0), NOW)).toBe('just now');
    expect(relativeTime(at(9, 30), NOW)).toBe('30m ago');
    expect(relativeTime(at(7, 0), NOW)).toBe('3h ago');
    expect(relativeTime(at(9, 0, 11), NOW)).toBe('3d ago');
  });
});
