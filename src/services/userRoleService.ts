import api from './api';
import type { UserRoleAssignment, Scope } from '../types';

const userRoleService = {
  list: async (userId: string): Promise<UserRoleAssignment[]> => {
    const response = await api.get(`/api-system/platform/users/${userId}/roles`);
    const body = response.data?.data ?? response.data;
    return Array.isArray(body) ? body : [];
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
