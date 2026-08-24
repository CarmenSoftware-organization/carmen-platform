import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { PaginateParams, BusinessUnit, BusinessUnitsResponse, BuSummaryData } from '../types';

const defaultSearchFields = ['name', 'code', 'description'];

const businessUnitService = {
  getAll: async (paginate: PaginateParams = {}): Promise<BusinessUnitsResponse> => {
    const response = await api.get(
      `/api-system/business-units?${buildQuery(paginate, defaultSearchFields)}`,
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/business-units/${id}`);
    return response.data;
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

  /**
   * Overview aggregate from `GET /api-system/business-units/summary` — unfiltered, no
   * `search`/`advance` params. Counts every business unit in the caller's scope, not the
   * current table view. See `BuSummaryData` in `types/index.ts`.
   */
  getSummary: async (): Promise<BuSummaryData> => {
    const response = await api.get('/api-system/business-units/summary');
    return response.data.data || response.data;
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
