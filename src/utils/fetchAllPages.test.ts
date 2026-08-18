import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from './fetchAllPages';

const opts = { pageSize: 2, maxPages: 3, label: 'test' };

describe('fetchAllPages', () => {
  it('stops as soon as paginate.total is covered', async () => {
    const fetchPage = vi.fn(async (page: number) =>
      page === 1
        ? { data: ['a', 'b'], paginate: { total: 3 } }
        : { data: ['c'], paginate: { total: 3 } },
    );

    expect(await fetchAllPages(fetchPage, opts)).toEqual(['a', 'b', 'c']);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('stops on the first empty page when total is unknown', async () => {
    const fetchPage = vi.fn(async (page: number) =>
      page === 1 ? { data: ['a', 'b'] } : { data: [] },
    );

    expect(await fetchAllPages(fetchPage, opts)).toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  // The whole point of the helper: never `perpage: -1`, never an unbounded loop, and never a
  // silent truncation either — the cap is a bound with a warning attached, not a quiet cut-off.
  it('never exceeds maxPages, even when total says there is more', async () => {
    const fetchPage = vi.fn(async () => ({ data: ['x', 'y'], paginate: { total: 999 } }));

    const result = await fetchAllPages(fetchPage, opts);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(6);
  });

  it('tolerates a response with no data key at all', async () => {
    const fetchPage = vi.fn(async () => ({}) as { data?: string[] });
    expect(await fetchAllPages(fetchPage, opts)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('lets a rejection propagate to the caller (never resolves with a partial page set)', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('boom');
      return { data: ['a', 'b'], paginate: { total: 99 } };
    });

    await expect(fetchAllPages(fetchPage, opts)).rejects.toThrow('boom');
  });
});
