import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, ApiListResponse } from '../types';

export type ReportSourceType = "view" | "function" | "procedure";

export interface ReportSourceParam {
  filter: string;
  type?: string;
  nullable?: boolean;
}

export interface ReportSourceParams {
  params?: ReportSourceParam[];
}

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
  builder_key?: string;
  source_type?: ReportSourceType;
  source_name?: string | null;
  source_params?: ReportSourceParams;
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

  /**
   * List views, functions, and stored procedures available in the tenant
   * schema of the given business unit. Used by the Edit form's Source Name
   * picker. Returns shape: { views: [{name,kind}], functions: [...], procedures: [...] }.
   */
  listDbObjects: async (
    buCode: string,
  ): Promise<{
    views: Array<{ name: string; kind: string }>;
    functions: Array<{ name: string; kind: string }>;
    procedures: Array<{ name: string; kind: string }>;
  }> => {
    const response = await api.get(
      `/api-system/report-template/db-objects?bu_code=${encodeURIComponent(buCode)}`,
    );
    // Gateway wraps data in `data` field per Result.ok
    return response.data?.data ?? response.data;
  },
};

export default reportTemplateService;
