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
}

export type PrintTemplateMappingUpdateInput = Partial<PrintTemplateMappingCreateInput>;

const printTemplateMappingService = {
  getAll: async (params?: { document_type?: string; active_only?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.document_type) qs.set('document_type', params.document_type);
    if (params?.active_only) qs.set('active_only', 'true');
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    const response = await api.get(`/api-system/print-template-mapping${tail}`);
    return response.data as { success: boolean; data: PrintTemplateMapping[]; total: number };
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/print-template-mapping/${id}`);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  listDocumentTypes: async () => {
    const response = await api.get(`/api-system/print-template-mapping/document-types`);
    return response.data as { success: boolean; document_types: DocumentType[] };
  },

  resolve: async (documentType: string, buCode?: string) => {
    const qs = new URLSearchParams({ document_type: documentType });
    if (buCode) qs.set('bu_code', buCode);
    const response = await api.get(`/api-system/print-template-mapping/resolve?${qs.toString()}`);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  create: async (input: PrintTemplateMappingCreateInput) => {
    const response = await api.post(`/api-system/print-template-mapping`, input);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  update: async (id: string, input: PrintTemplateMappingUpdateInput) => {
    const response = await api.put(`/api-system/print-template-mapping/${id}`, input);
    return response.data as { success: boolean; data: PrintTemplateMapping };
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/print-template-mapping/${id}`);
    return response.data;
  },
};

export default printTemplateMappingService;
