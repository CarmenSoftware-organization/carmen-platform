import { describe, it, expect } from 'vitest';
import { cycleSort, compareValues, sortRows } from './tableSort';

describe('cycleSort', () => {
  it('goes none -> asc -> desc -> none for the same key', () => {
    let s = cycleSort(null, 'name');
    expect(s).toEqual({ key: 'name', dir: 'asc' });
    s = cycleSort(s, 'name');
    expect(s).toEqual({ key: 'name', dir: 'desc' });
    s = cycleSort(s, 'name');
    expect(s).toBeNull();
  });
  it('resets to asc when a different key is clicked', () => {
    expect(cycleSort({ key: 'name', dir: 'desc' }, 'code')).toEqual({ key: 'code', dir: 'asc' });
  });
});

describe('compareValues', () => {
  it('compares numbers numerically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
  });
  it('compares strings case-insensitively', () => {
    expect(compareValues('Bravo', 'alpha')).toBeGreaterThan(0);
  });
  it('treats null/undefined as empty string', () => {
    expect(compareValues(null, 'a')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [{ n: 'b', c: 2 }, { n: 'a', c: 1 }, { n: 'c', c: 3 }];
  const acc = (r: { n: string; c: number }, key: string) => (key === 'n' ? r.n : r.c);
  it('returns input unchanged when state is null', () => {
    expect(sortRows(rows, null, acc)).toBe(rows);
  });
  it('sorts ascending', () => {
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, acc).map((r) => r.n)).toEqual(['a', 'b', 'c']);
  });
  it('sorts descending without mutating the source', () => {
    const out = sortRows(rows, { key: 'c', dir: 'desc' }, acc).map((r) => r.c);
    expect(out).toEqual([3, 2, 1]);
    expect(rows[0].n).toBe('b'); // unchanged
  });
});
