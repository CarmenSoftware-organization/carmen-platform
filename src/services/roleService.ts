import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { PaginateParams, RolesResponse, RolesSummaryData } from '../types';

const defaultSearchFields = ['name', 'description'];

export interface RoleWriteData {
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: { add: string[]; remove?: string[] }; // "resource.action" keys
  doc_version?: number;
}

const roleService = {
  getAll: async (paginate: PaginateParams = {}): Promise<RolesResponse> => {
    const response = await api.get(
      `/api-system/platform/roles?${buildQuery(paginate, defaultSearchFields)}`,
    );
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/api-system/platform/roles/${id}`);
    return response.data;
  },
  /**
   * RBAC aggregate from `GET /api-system/platform/roles/summary` — unfiltered, no
   * `search`/`advance` params. Counts every role, not the current table view. See
   * `RolesSummaryData` in `types/index.ts`.
   */
  getAccessSummary: async (): Promise<RolesSummaryData> => {
    const response = await api.get('/api-system/platform/roles/summary');
    return response.data.data || response.data;
  },
  create: async (data: RoleWriteData) => {
    const body = {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      permissions: { add: data.permissions.add },
    };
    const response = await api.post('/api-system/platform/roles', body);
    return response.data;
  },
  update: async (id: string, data: RoleWriteData) => {
    const body = {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      permissions: { add: data.permissions.add, remove: data.permissions.remove ?? [] },
      ...(data.doc_version != null ? { doc_version: data.doc_version } : {}),
    };
    const response = await api.put(`/api-system/platform/roles/${id}`, body);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/api-system/platform/roles/${id}`);
    return response.data;
  },
};

export default roleService;
