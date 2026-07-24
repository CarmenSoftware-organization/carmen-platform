import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, ApiListResponse } from '../types';

export type ReportSourceType = "view" | "function" | "procedure";

export type ReportTemplateType = 'form' | 'list';

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
  template_type?: ReportTemplateType;
  dialog: string;
  content: string;
  is_standard: boolean;
  // Meaningful only for template_type === 'form'. At most one live form
  // template per report_group may be true — enforced by a DB partial unique
  // index, not the application (see ReportTemplateEdit.tsx submit payload).
  is_default: boolean;
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
  doc_version?: number; // optimistic-lock token
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
    const response = await api.get(`/api-system/report-templates?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/report-templates/${id}`);
    return response.data;
  },

  create: async (data: Partial<ReportTemplate>) => {
    const response = await api.post('/api-system/report-templates', data);
    return response.data;
  },

  update: async (id: string, data: Partial<ReportTemplate>) => {
    const response = await api.put(`/api-system/report-templates/${id}`, data);
    return response.data;
  },

  /**
   * Switch the default form template within a report_group. Enforces the
   * "at most one default per group" invariant client-side by UNSETTING the
   * current default before SETTING the new one — the DB partial unique index
   * would reject two live defaults, so ordering here is load-bearing.
   *
   * Both writes are partial PUTs: the backend preserves fields omitted from an
   * update payload (see ReportTemplateEdit submit comment), so sending only
   * { is_default, doc_version } leaves the rest of each record intact.
   */
  setGroupDefault: async ({
    current,
    target,
  }: {
    current: { id: string; doc_version?: number } | null;
    target: { id: string; doc_version?: number };
  }): Promise<void> => {
    if (current && current.id === target.id) return;
    if (current) {
      await api.put(`/api-system/report-templates/${current.id}`, {
        is_default: false,
        ...(current.doc_version != null ? { doc_version: current.doc_version } : {}),
      });
    }
    await api.put(`/api-system/report-templates/${target.id}`, {
      is_default: true,
      ...(target.doc_version != null ? { doc_version: target.doc_version } : {}),
    });
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/report-templates/${id}`);
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
      `/api-system/report-templates/db-objects?bu_code=${encodeURIComponent(buCode)}`,
    );
    // Gateway wraps data in `data` field per Result.ok
    return response.data?.data ?? response.data;
  },
};

export default reportTemplateService;
