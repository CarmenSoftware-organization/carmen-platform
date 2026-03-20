import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, ApiListResponse } from '../types';

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  report_group: string;
  dialog: string;
  content: string;
  is_standard: boolean;
  allow_business_unit?: unknown;
  deny_business_unit?: unknown;
  is_active: boolean;
  created_at?: string;
  created_by_id?: string;
  updated_at?: string;
  updated_by_id?: string;
}

const defaultSearchFields = ['name', 'description', 'report_group'];

const reportTemplateService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<ReportTemplate>> => {
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
    const response = await api.get(`/api-system/report-template?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/report-template/${id}`);
    return response.data;
  },

  create: async (data: Partial<ReportTemplate>) => {
    const response = await api.post('/api-system/report-template', data);
    return response.data;
  },

  update: async (id: string, data: Partial<ReportTemplate>) => {
    const response = await api.put(`/api-system/report-template/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/report-template/${id}`);
    return response.data;
  },
};

export default reportTemplateService;
