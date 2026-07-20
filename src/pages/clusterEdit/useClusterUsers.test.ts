import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../services/userService', () => ({ default: { getAll: vi.fn() } }));

import { useClusterUsers } from './useClusterUsers';
import api from '../../services/api';
import { toast } from 'sonner';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(api.get).mockResolvedValue({ data: { data: [{ id: 'cu1', user_id: 'u1', role: 'user' }] } });
});

describe('useClusterUsers', () => {
  it('fetches cluster users on mount', async () => {
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    expect(result.current.clusterUsers[0].id).toBe('cu1');
  });

  it('bulkRun runs sequentially, collects failures, and returns a summary', async () => {
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));

    const op = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    let summary: { ok: number; failed: number } | undefined;
    await act(async () => {
      summary = await result.current.bulkRun(['a', 'b', 'c'], op, 'update');
    });
    expect(op).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({ ok: 2, failed: 1 });
    expect(toast.success).toHaveBeenCalled();
  });

  it('removeUser calls DELETE and refetches', async () => {
    asMock(api.delete).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    await act(async () => { await result.current.removeUser('cu1'); });
    expect(api.delete).toHaveBeenCalledWith('/api-system/user/clusters/cu1');
  });

  it('updateUser rolls back the optimistic change and rethrows, toast-free, on failure', async () => {
    asMock(api.put).mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    expect(result.current.clusterUsers[0].role).toBe('user'); // original

    await act(async () => {
      await expect(result.current.updateUser('cu1', { role: 'admin' })).rejects.toThrow();
    });

    expect(result.current.clusterUsers[0].role).toBe('user'); // rolled back
    expect(toast.error).not.toHaveBeenCalled(); // primitive is toast-free
  });

  it('bulkRun with an empty id list does nothing and toasts nothing', async () => {
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    const op = vi.fn();
    let summary: { ok: number; failed: number } | undefined;
    await act(async () => { summary = await result.current.bulkRun([], op, 'update'); });
    expect(op).not.toHaveBeenCalled();
    expect(summary).toEqual({ ok: 0, failed: 0 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
