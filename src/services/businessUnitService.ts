import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, BusinessUnit, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code', 'description'];

const businessUnitService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<BusinessUnit>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? paginate.filter as Record<string, unknown> : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/business-units?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/business-units/${id}`);
    return response.data;
  },

  // Guarded on-demand reveal of the full db_connection (incl. plaintext password).
  // The BU detail/list responses redact db_connection.password, so this is the only
  // path to the stored value; the backend gates it server-side on cluster.update
  // (fail-closed) — the <Can> gate in DatabaseConnectionSection is defense-in-depth,
  // not the security boundary.
  revealDbPassword: async (id: string): Promise<Record<string, unknown>> => {
    const response = await api.get(`/api-system/business-units/${id}/reveal-db-connection`);
    const body = response.data?.data ?? response.data;
    return (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  },

  create: async (businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.post('/api-system/business-units', businessUnitData);
    return response.data;
  },

  update: async (id: string, businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.put(`/api-system/business-units/${id}`, businessUnitData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/business-units/${id}`);
    return response.data;
  },

  // Dedicated logo/avatar upload endpoints (multipart). Return { file_token, url, expires_at }.
  // The multipart Content-Type header is required so axios doesn't JSON-serialize the FormData.
  uploadLogo: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    const response = await api.post(`/api-system/business-units/${id}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadAvatar: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const response = await api.post(`/api-system/business-units/${id}/avatar`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateUserBusinessUnit: async (id: string, data: { role?: string; is_active?: boolean }) => {
    const response = await api.patch(`/api-system/user/business-units/${id}`, data);
    return response.data;
  },

  createUserBusinessUnit: async (data: { user_id: string; business_unit_id: string; role: string }) => {
    const response = await api.post('/api-system/user/business-units', data);
    return response.data;
  },

  deleteUserBusinessUnit: async (id: string) => {
    const response = await api.delete(`/api-system/user/business-units/${id}`);
    return response.data;
  },
};

export default businessUnitService;
