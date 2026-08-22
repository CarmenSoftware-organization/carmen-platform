import api from './api';
import { buildQuery } from '../utils/buildQuery';
import { normalizeAudit } from '../utils/audit';
import type { PaginateParams, News, NewsResponse, NewsSummaryData, PaginateInfo } from '../types';

const defaultSearchFields = ['title', 'contents'];

// Backend create/update accept multipart/form-data with a binary `image` field.
// Under multipart, business_unit_ids must be a JSON-encoded string.
const buildNewsFormData = (data: Partial<News>, image: File): FormData => {
  const fd = new FormData();
  if (data.title !== undefined) fd.append('title', data.title);
  if (data.contents !== undefined) fd.append('contents', data.contents);
  if (data.url !== undefined) fd.append('url', data.url);
  if (data.status !== undefined) fd.append('status', data.status);
  if (data.business_unit_ids !== undefined) {
    fd.append('business_unit_ids', JSON.stringify(data.business_unit_ids));
  }
  if (data.tags !== undefined) {
    fd.append('tags', JSON.stringify(data.tags));
  }
  if (data.doc_version !== undefined) fd.append('doc_version', String(data.doc_version));
  fd.append('image', image);
  return fd;
};

const newsService = {
  getAll: async (paginate: PaginateParams = {}): Promise<NewsResponse> => {
    const response = await api.get(`/api/news?${buildQuery(paginate, defaultSearchFields)}`);
    // The backend wraps the paginated payload in a global { data, status, ... }
    // envelope and nests the list one level deeper. Walk down `.data` until we
    // reach the { paginate, data: [] } payload (or a bare array), tolerating both
    // the new and legacy shapes.
    let node: unknown = response.data;
    while (
      node && typeof node === 'object' && !Array.isArray(node) &&
      (node as { data?: unknown }).data != null &&
      !Array.isArray((node as { data?: unknown }).data)
    ) {
      node = (node as { data: unknown }).data;
    }
    const payload = node as { data?: News[]; paginate?: PaginateInfo; summary?: NewsSummaryData } | News[];
    const list = Array.isArray(payload) ? payload : payload?.data ?? [];
    const paginateInfo = Array.isArray(payload) ? undefined : payload?.paginate;
    // `summary` sits beside `data`/`paginate` on the unwrapped payload. This function
    // rebuilds the response object rather than returning it, so anything not copied here is
    // dropped — silently, with the band simply staying empty.
    const summary = Array.isArray(payload) ? undefined : payload?.summary;
    // The list endpoint includes soft-deleted records; hide them. `normalizeAudit` reads
    // both the nested `audit.deleted.at` shape and the older top-level `deleted_at` shape.
    return {
      data: list.filter((n) => !normalizeAudit(n).deleted?.at),
      paginate: paginateInfo,
      ...(summary !== undefined && { summary }),
    };
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/news/${id}`);
    return response.data;
  },

  getTags: async (): Promise<string[]> => {
    const response = await api.get('/api/news/tags');
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
  },

  create: async (newsData: Partial<News>, image?: File) => {
    if (image) {
      // The explicit multipart Content-Type is REQUIRED, not redundant: the `api`
      // instance defaults to application/json, and axios's transformRequest will
      // JSON-serialize a FormData body (dropping the File) whenever the content type
      // is application/json. Setting multipart here makes axios pass the FormData
      // through; the browser then fills in the boundary.
      const response = await api.post('/api/news', buildNewsFormData(newsData, image), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.post('/api/news', newsData);
    return response.data;
  },

  update: async (id: string, newsData: Partial<News>, image?: File) => {
    if (image) {
      const response = await api.put(`/api/news/${id}`, buildNewsFormData(newsData, image), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.put(`/api/news/${id}`, newsData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/news/${id}`);
    return response.data;
  },
};

export default newsService;
