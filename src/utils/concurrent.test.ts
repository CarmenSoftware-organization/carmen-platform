import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrent';

describe('mapWithConcurrency', () => {
  it('runs at most `limit` tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    await mapWithConcurrency(items, 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it('calls onSettled with the result for each item', async () => {
    const seen: Array<[number, number | undefined, unknown]> = [];
    await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (n) => n * 10,
      (item, _i, res, err) => seen.push([item, res, err]),
    );
    seen.sort((a, b) => a[0] - b[0]);
    expect(seen).toEqual([[1, 10, undefined], [2, 20, undefined], [3, 30, undefined]]);
  });

  it('surfaces per-item errors via onSettled without rejecting the run', async () => {
    const errors: unknown[] = [];
    await expect(
      mapWithConcurrency(
        [1, 2],
        2,
        async (n) => {
          if (n === 2) throw new Error('boom');
          return n;
        },
        (_item, _i, _res, err) => {
          if (err) errors.push(err);
        },
      ),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, async (n) => n)).resolves.toBeUndefined();
  });
});
