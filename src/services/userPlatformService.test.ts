import { describe, it, expect, vi, beforeEach } from 'vitest';
import userPlatformService from './userPlatformService';
import api from './api';
import type { PlatformUserRow } from '../types';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const BASE = '/api-system/platform/users';

describe('userPlatformService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('requests the platform/users endpoint with default pagination and default searchfields', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [], paginate: { total: 0, page: 1, perpage: 10 } } });
      await userPlatformService.getAll();
      expect(mockApi.get).toHaveBeenCalledWith(
        `${BASE}?page=1&perpage=10&searchfields=username%2Cemail`,
      );
    });

    it('defaults searchfields to username and email when the caller searches without specifying fields', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } });
      await userPlatformService.getAll({ search: 'jane' });
      const url = mockApi.get.mock.calls[0][0] as string;
      expect(url).toContain('search=jane');
      expect(url).toContain('searchfields=username%2Cemail');
    });

    // The `advance` filter carries `cluster_id: null` to mean "platform-wide grants" —
    // that null is meaningful and must survive untouched, not get dropped as falsy.
    it('passes an advance filter containing cluster_id: null through untouched', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } });
      const advance = JSON.stringify({ where: { cluster_id: null } });
      await userPlatformService.getAll({ advance });
      const url = mockApi.get.mock.calls[0][0] as string;
      const parsed = new URLSearchParams(url.split('?')[1]);
      expect(parsed.get('advance')).toBe(advance);
      expect(JSON.parse(parsed.get('advance') as string)).toEqual({ where: { cluster_id: null } });
    });

    it('forwards page, perpage, search, and sort onto the query string', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } });
      await userPlatformService.getAll({ page: 2, perpage: 25, search: 'admin', sort: 'username:asc' });
      const url = mockApi.get.mock.calls[0][0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('perpage=25');
      expect(url).toContain('search=admin');
      expect(url).toContain('sort=username%3Aasc');
    });

    it('returns the envelope (data + paginate) unwrapped from the axios response', async () => {
      const rows: PlatformUserRow[] = [
        {
          user_id: 'u1',
          username: 'jane',
          email: 'jane@carmen.io',
          is_active: true,
          roles: [
            {
              id: 'r1',
              role_id: 'role-1',
              role_name: 'platform_admin',
              scope: { type: 'platform' },
              audit: { created: { at: '2026-08-01T09:12:00Z', id: 'uid-1', name: 'นภา สุขใจ' } },
            },
          ],
        },
      ];
      const envelope = { data: rows, paginate: { total: 1, page: 1, perpage: 10 } };
      mockApi.get.mockResolvedValue({ data: envelope });
      await expect(userPlatformService.getAll()).resolves.toEqual(envelope);
    });

    it('models a grant with no recorded actor name (predates actor recording)', async () => {
      const rows: PlatformUserRow[] = [
        {
          user_id: 'u2',
          username: 'old_grant',
          is_active: true,
          roles: [
            {
              id: 'r2',
              role_id: 'role-2',
              scope: { type: 'platform' },
              audit: { created: { at: '2020-01-01T00:00:00Z' } },
            },
          ],
        },
      ];
      mockApi.get.mockResolvedValue({ data: { data: rows } });
      const result = await userPlatformService.getAll();
      expect(result.data[0].roles[0].audit?.created?.name).toBeUndefined();
      expect(result.data[0].roles[0].audit?.created?.at).toBe('2020-01-01T00:00:00Z');
    });

    it('models a grant whose recorded actor no longer resolves ("Unknown" is a real value, not a missing one)', async () => {
      const rows: PlatformUserRow[] = [
        {
          user_id: 'u3',
          username: 'orphan_grant',
          is_active: true,
          roles: [
            {
              id: 'r3',
              role_id: 'role-3',
              scope: { type: 'cluster', cluster_id: 'c1', cluster_name: 'Bangkok' },
              audit: { created: { at: '2026-01-01T00:00:00Z', id: 'uid-gone', name: 'Unknown' } },
            },
          ],
        },
      ];
      mockApi.get.mockResolvedValue({ data: { data: rows } });
      const result = await userPlatformService.getAll();
      expect(result.data[0].roles[0].audit?.created?.name).toBe('Unknown');
      expect(result.data[0].roles[0].audit?.created?.id).toBe('uid-gone');
    });
  });

  describe('assignBulk', () => {
    it('POSTs role_ids and scope to the per-user bulk-roles endpoint', async () => {
      mockApi.post.mockResolvedValue({ data: { data: { ok: true } } });
      await userPlatformService.assignBulk('user-1', {
        role_ids: ['role-a', 'role-b'],
        scope: { type: 'platform' },
      });
      expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/user-1/roles/bulk`, {
        role_ids: ['role-a', 'role-b'],
        scope: { type: 'platform' },
      });
    });

    it('sends a cluster scope with cluster_id verbatim', async () => {
      mockApi.post.mockResolvedValue({ data: { data: { ok: true } } });
      await userPlatformService.assignBulk('user-2', {
        role_ids: ['role-c'],
        scope: { type: 'cluster', cluster_id: 'cluster-9' },
      });
      expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/user-2/roles/bulk`, {
        role_ids: ['role-c'],
        scope: { type: 'cluster', cluster_id: 'cluster-9' },
      });
    });

    it('returns the unwrapped response body', async () => {
      mockApi.post.mockResolvedValue({ data: { data: { updated: 2 } } });
      await expect(
        userPlatformService.assignBulk('user-3', { role_ids: ['role-x'], scope: { type: 'platform' } }),
      ).resolves.toEqual({ data: { updated: 2 } });
    });
  });
});
