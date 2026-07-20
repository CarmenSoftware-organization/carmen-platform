import api from './api';

export interface DocumentType {
  code: string;
  label: string;
}

export interface PrintTemplateMapping {
  id: string;
  document_type: string;
  report_template_id: string;
  is_default: boolean;
  display_label?: string | null;
  display_order: number;
  allow_business_unit?: unknown;
  deny_business_unit?: unknown;
  is_active: boolean;
  template_name?: string | null;
  template_group?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by_id?: string;
  updated_by_id?: string;
  created_by_name?: string;
  updated_by_name?: string;
  doc_version?: number; // optimistic-lock token
}

export interface PrintTemplateMappingCreateInput {
  document_type: string;
  report_template_id: string;
  is_default?: boolean;
  display_label?: string | null;
  display_order?: number;
  allow_business_unit?: unknown;
  deny_business_unit?: unknown;
  is_active?: boolean;
  doc_version?: number;
}

export type PrintTemplateMappingUpdateInput = Partial<PrintTemplateMappingCreateInput>;

// Matches the Go micro-report list contract (forwarded verbatim by the NestJS
// gateway): `{ success, data, paginate: { total, page, perpage, pages } }`.
// The row count lives under `paginate.total`, NOT at the top level.
export interface PaginateMeta {
  total: number;
  page: number;
  perpage: number;
  pages: number;
}

export interface PrintTemplateMappingListResponse {
  success: boolean;
  data: PrintTemplateMapping[];
  paginate: PaginateMeta;
}

const printTemplateMappingService = {
  getAll: async (params?: { document_type?: string; active_only?: boolean }) => {
    const qs = new URLSearchParams();
    // This is a config page — always show every mapping. The Go micro-report
    // backend defaults to perpage=10 and truncates otherwise; perpage=-1 is its
    // official "fetch all" sentinel.
    qs.set('perpage', '-1');
    if (params?.document_type) qs.set('document_type', params.document_type);
    if (params?.active_only) qs.set('active_only', 'true');
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    const response = await api.get(`/api-system/print-template-mappings${tail}`);
    return response.data as PrintTemplateMappingListResponse;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/print-template-mappings/${id}`);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  listDocumentTypes: async () => {
    const response = await api.get(`/api-system/print-template-mappings/document-types`);
    return response.data as { success: boolean; document_types: DocumentType[] };
  },

  resolve: async (documentType: string, buCode?: string) => {
    const qs = new URLSearchParams({ document_type: documentType });
    if (buCode) qs.set('bu_code', buCode);
    const response = await api.get(`/api-system/print-template-mappings/resolve?${qs.toString()}`);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  create: async (input: PrintTemplateMappingCreateInput) => {
    const response = await api.post(`/api-system/print-template-mappings`, input);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  update: async (id: string, input: PrintTemplateMappingUpdateInput) => {
    const response = await api.put(`/api-system/print-template-mappings/${id}`, input);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/print-template-mappings/${id}`);
    return response.data;
  },
};

export default printTemplateMappingService;
