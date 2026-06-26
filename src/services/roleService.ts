import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams } from '../types';

const defaultSearchFields = ['name', 'description'];

export interface RoleWriteData {
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: { add: string[]; remove?: string[] }; // "resource.action" keys
  doc_version?: number;
}

const roleService = {
  getAll: async (paginate: PaginateParams = {}) => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? (paginate.filter as Record<string, unknown>) : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/platform/roles?${q.toQueryString()}`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/api-system/platform/roles/${id}`);
    return response.data;
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
