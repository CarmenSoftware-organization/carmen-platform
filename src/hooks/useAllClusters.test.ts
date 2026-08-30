import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn() },
}));

import { useAllClusters, CLUSTER_PAGE_SIZE } from './useAllClusters';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const cluster = (id: string) => ({ id, code: id.toUpperCase(), name: `Cluster ${id}`, is_active: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAllClusters', () => {
  it('loads one page and reports no error', async () => {
    asMock(clusterService.getAll).mockResolvedValue({
      data: [cluster('c1'), cluster('c2')],
      paginate: { total: 2, page: 1, perpage: CLUSTER_PAGE_SIZE },
    });

    const { result } = renderHook(() => useAllClusters());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clusters.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result.current.error).toBe('');
    expect(clusterService.getAll).toHaveBeenCalledWith({
      page: 1, perpage: CLUSTER_PAGE_SIZE, sort: 'name:asc',
    });
  });

  // Review M7: the old call was a flat `perpage: 200`. Cluster #201 was unreachable, with no
  // error and no hint anywhere that the list was cut off.
  it('keeps paging until paginate.total is covered', async () => {
    const page1 = Array.from({ length: CLUSTER_PAGE_SIZE }, (_, i) => cluster(`a${i}`));
    const page2 = [cluster('b0'), cluster('b1')];
    asMock(clusterService.getAll).mockImplementation(async ({ page }: { page: number }) => ({
      data: page === 1 ? page1 : page2,
      paginate: { total: CLUSTER_PAGE_SIZE + 2, page, perpage: CLUSTER_PAGE_SIZE },
    }));

    const { result } = renderHook(() => useAllClusters());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clusters).toHaveLength(CLUSTER_PAGE_SIZE + 2);
    expect(result.current.clusters.at(-1)?.id).toBe('b1');
    expect(clusterService.getAll).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failure as `error` instead of swallowing it', async () => {
    asMock(clusterService.getAll).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useAllClusters());

    await waitFor(() => expect(result.current.error).not.toBe(''));
    // renderHook ไม่ห่อ I18nProvider — `useI18n()` จึงคืนบริบทอังกฤษ (ตั้งใจ ดู useI18n.tsx)
    // ข้อความจึงเป็นค่า en ของ `pages.licenses.loadFailedPrefix` ไม่ใช่ไทยที่เคย hardcode ไว้
    expect(result.current.error).toContain('Failed to load clusters');
    expect(result.current.clusters).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('fetches nothing at all when disabled', async () => {
    const { result } = renderHook(() => useAllClusters(false));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clusterService.getAll).not.toHaveBeenCalled();
    expect(result.current.clusters).toEqual([]);
  });
});
