import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import userService from '../../services/userService';
import { getErrorDetail } from '../../utils/errorParser';
import type { ClusterUser } from '../../types';

export interface SearchUser {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
}

const SEARCH_PER_PAGE = 10;

function sortByName(list: ClusterUser[]): ClusterUser[] {
  const nameOf = (u: ClusterUser) =>
    (u.userInfo?.firstname || u.userInfo?.middlename || u.userInfo?.lastname
      ? [u.userInfo.firstname, u.userInfo.middlename, u.userInfo.lastname].filter(Boolean).join(' ')
      : u.name || u.email || '').toLowerCase();
  return [...list].sort((a, b) => {
    const byName = nameOf(a).localeCompare(nameOf(b));
    return byName !== 0 ? byName : (a.email || '').toLowerCase().localeCompare((b.email || '').toLowerCase());
  });
}

export function useClusterUsers(clusterId: string | undefined) {
  const [clusterUsers, setClusterUsers] = useState<ClusterUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [rawUsersResponse, setRawUsersResponse] = useState<unknown>(null);

  const [searchUsers, setSearchUsers] = useState<SearchUser[]>([]);
  const [searchUsersTerm, setSearchUsersTermState] = useState('');
  const [searchUsersTotal, setSearchUsersTotal] = useState(0);
  const [searchUsersPage, setSearchUsersPage] = useState(1);
  const [loadingSearchUsers, setLoadingSearchUsers] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClusterUsers = useCallback(async () => {
    if (!clusterId) return;
    try {
      setUsersLoading(true);
      const response = await api.get(`/api-system/user/clusters/${clusterId}`);
      const data = response.data;
      setRawUsersResponse(data);
      const items = data.data || data;
      setClusterUsers(sortByName(Array.isArray(items) ? items : []));
    } catch {
      // Secondary data — keep prior list, no blocking error.
    } finally {
      setUsersLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchClusterUsers();
  }, [fetchClusterUsers]);

  const fetchSearchUsers = useCallback(async (search: string, page: number, append = false) => {
    setLoadingSearchUsers(true);
    try {
      const data = await userService.getAll({
        search,
        page,
        perpage: SEARCH_PER_PAGE,
        searchfields: ['username', 'email', 'firstname', 'lastname'],
      });
      const items = (data as { data?: SearchUser[] }).data || (data as unknown as SearchUser[]);
      const pag = (data as { paginate?: { total?: number } }).paginate;
      const list = Array.isArray(items) ? items : [];
      setSearchUsers((prev) => (append ? [...prev, ...list] : list));
      setSearchUsersTotal(pag?.total ?? 0);
    } catch {
      if (!append) { setSearchUsers([]); setSearchUsersTotal(0); }
    } finally {
      setLoadingSearchUsers(false);
    }
  }, []);

  const setSearchUsersTerm = useCallback((value: string) => {
    setSearchUsersTermState(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchUsersPage(1);
      fetchSearchUsers(value, 1);
    }, 400);
  }, [fetchSearchUsers]);

  const hasMoreUsers = searchUsersPage < Math.max(1, Math.ceil(searchUsersTotal / SEARCH_PER_PAGE));
  const loadMoreUsers = useCallback(() => {
    if (loadingSearchUsers || !hasMoreUsers) return;
    const next = searchUsersPage + 1;
    setSearchUsersPage(next);
    fetchSearchUsers(searchUsersTerm, next, true);
  }, [loadingSearchUsers, hasMoreUsers, searchUsersPage, searchUsersTerm, fetchSearchUsers]);

  const resetSearch = useCallback(() => {
    setSearchUsersTermState('');
    setSearchUsersPage(1);
    setSearchUsers([]);
    fetchSearchUsers('', 1);
  }, [fetchSearchUsers]);

  const addUser = useCallback(async (input: { userId: string; role: string; parentBuId?: string }) => {
    if (!clusterId) return;
    await api.post('/api-system/user/clusters', {
      user_id: input.userId,
      cluster_id: clusterId,
      role: input.role,
      is_active: true,
      ...(input.parentBuId ? { parent_bu_id: input.parentBuId } : {}),
    });
    toast.success('User added to cluster');
    await fetchClusterUsers();
  }, [clusterId, fetchClusterUsers]);

  const updateUser = useCallback(async (
    clusterUserId: string,
    patch: { role?: string; parent_bu_id?: string | null; is_active?: boolean },
  ) => {
    const prev = clusterUsers;
    setClusterUsers((list) => list.map((u) => (u.id === clusterUserId ? { ...u, ...patch } : u)));
    try {
      await api.put(`/api-system/user/clusters/${clusterUserId}`, patch);
    } catch (err) {
      setClusterUsers(prev); // rollback
      toast.error('Failed to update user', { description: getErrorDetail(err) });
      throw err;
    }
  }, [clusterUsers]);

  const removeUser = useCallback(async (clusterUserId: string) => {
    await api.delete(`/api-system/user/clusters/${clusterUserId}`);
    await fetchClusterUsers();
  }, [fetchClusterUsers]);

  // Sequential fan-out: one request per id, never abort the batch on a single failure.
  const bulkRun = useCallback(async (
    ids: string[],
    op: (id: string) => Promise<void>,
    label: string,
  ): Promise<{ ok: number; failed: number }> => {
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await op(id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    await fetchClusterUsers();
    if (ok > 0) {
      toast.success(failed === 0 ? `${label}: ${ok} updated` : `${label}: ${ok} updated, ${failed} failed`);
    } else {
      toast.error(`${label}: all ${failed} failed`);
    }
    return { ok, failed };
  }, [fetchClusterUsers]);

  return {
    clusterUsers, usersLoading, rawUsersResponse,
    fetchClusterUsers,
    addUser, updateUser, removeUser, bulkRun,
    // add-user search
    searchUsers, searchUsersTerm, setSearchUsersTerm, loadingSearchUsers,
    searchUsersTotal, loadMoreUsers, hasMoreUsers, resetSearch,
  };
}

export type ClusterUsersApi = ReturnType<typeof useClusterUsers>;
