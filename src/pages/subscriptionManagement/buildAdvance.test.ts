import { describe, it, expect } from 'vitest';
import { buildAdvance } from './buildAdvance';

const NOW = new Date('2026-08-18T00:00:00.000Z');

describe('buildAdvance', () => {
  it('returns an empty string when there is nothing to filter by', () => {
    expect(buildAdvance('', [], false, NOW)).toBe('');
  });

  it('wraps a search term in a case-insensitive subscription_number contains clause', () => {
    const result = buildAdvance('  SUB-001  ', [], false, NOW);
    expect(JSON.parse(result)).toEqual({
      where: {
        AND: [{ subscription_number: { contains: 'SUB-001', mode: 'insensitive' } }],
      },
    });
  });

  it('builds a status-in clause when only status filters are set', () => {
    const result = buildAdvance('', ['active', 'expired'], false, NOW);
    expect(JSON.parse(result)).toEqual({
      where: {
        AND: [{ status: { in: ['active', 'expired'] } }],
      },
    });
  });

  it('combines a search term with a status filter (both apply when expiringSoon is off)', () => {
    const result = buildAdvance('SUB-001', ['inactive'], false, NOW);
    expect(JSON.parse(result)).toEqual({
      where: {
        AND: [
          { subscription_number: { contains: 'SUB-001', mode: 'insensitive' } },
          { status: { in: ['inactive'] } },
        ],
      },
    });
  });

  // The corrections spec (task-B2-corrections.md #4): "ใกล้หมดอายุ" ต้องบังคับ status=active
  // เสมอ — ไม่สนใจค่า status ที่ผู้ใช้ติ๊กไว้ก่อนหน้า.
  it('forces status to active and ignores the passed-in status filter when expiringSoon is on', () => {
    const result = buildAdvance('', ['inactive', 'expired'], true, NOW);
    const until = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(JSON.parse(result)).toEqual({
      where: {
        AND: [
          { status: 'active' },
          { end_date: { gte: NOW.toISOString(), lte: until.toISOString() } },
        ],
      },
    });
  });

  it('still combines a search term with the expiringSoon clause', () => {
    const result = buildAdvance('SUB-9', [], true, NOW);
    const until = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(JSON.parse(result)).toEqual({
      where: {
        AND: [
          { subscription_number: { contains: 'SUB-9', mode: 'insensitive' } },
          { status: 'active' },
          { end_date: { gte: NOW.toISOString(), lte: until.toISOString() } },
        ],
      },
    });
  });
});
