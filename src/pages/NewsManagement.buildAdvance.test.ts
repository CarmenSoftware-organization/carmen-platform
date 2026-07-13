import { describe, it, expect } from 'vitest';
import { buildAdvance } from './NewsManagement';

describe('NewsManagement buildAdvance', () => {
  it('returns an empty string when nothing is selected', () => {
    expect(buildAdvance([], [])).toBe('');
  });

  it('builds a status-only where clause', () => {
    expect(JSON.parse(buildAdvance(['draft'], []))).toEqual({
      where: { status: { in: ['draft'] } },
    });
  });

  it('builds an OR-across-tags where clause', () => {
    expect(JSON.parse(buildAdvance([], ['a', 'b']))).toEqual({
      where: { OR: [{ tags: { array_contains: ['a'] } }, { tags: { array_contains: ['b'] } }] },
    });
  });

  it('combines status AND (tag OR tag)', () => {
    expect(JSON.parse(buildAdvance(['published'], ['x']))).toEqual({
      where: {
        status: { in: ['published'] },
        OR: [{ tags: { array_contains: ['x'] } }],
      },
    });
  });
});
