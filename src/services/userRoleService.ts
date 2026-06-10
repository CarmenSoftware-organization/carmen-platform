import api from './api';
import type { UserRoleAssignment, Scope } from '../types';

const userRoleService = {
  list: async (userId: string): Promise<UserRoleAssignment[]> => {
    const response = await api.get(`/api-system/platform/users/${userId}/roles`);
    // Descend nested `{ data: ... }` envelopes until the array (the endpoint
    // may nest deeper than the usual one-level convention).
    let cur: unknown = response.data;
    while (cur && !Array.isArray(cur) && typeof cur === 'object' && 'data' in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>).data;
    }
    return Array.isArray(cur) ? (cur as UserRoleAssignment[]) : [];
  },
  add: async (userId: string, payload: { role_id: string; scope: Scope }) => {
    const response = await api.post(`/api-system/platform/users/${userId}/roles`, payload);
    return response.data;
  },
  remove: async (userId: string, assignmentId: string) => {
    const response = await api.delete(`/api-system/platform/users/${userId}/roles/${assignmentId}`);
    return response.data;
  },
};

export default userRoleService;
