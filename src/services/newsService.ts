import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, News, ApiListResponse, PaginateInfo } from '../types';

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
  fd.append('image', image);
  return fd;
};

const newsService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<News>> => {
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
    const response = await api.get(`/api/news?${q.toQueryString()}`);
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
    const payload = node as { data?: News[]; paginate?: PaginateInfo } | News[];
    const list = Array.isArray(payload) ? payload : payload?.data ?? [];
    const paginateInfo = Array.isArray(payload) ? undefined : payload?.paginate;
    // The list endpoint includes soft-deleted records; hide them from the UI.
    return { data: list.filter((n) => !n.deleted_at), paginate: paginateInfo };
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/news/${id}`);
    return response.data;
  },

  create: async (newsData: Partial<News>, image?: File) => {
    if (image) {
      // Pass FormData as-is: axios strips the default JSON Content-Type and lets the
      // browser set multipart/form-data with the boundary.
      const response = await api.post('/api/news', buildNewsFormData(newsData, image));
      return response.data;
    }
    const response = await api.post('/api/news', newsData);
    return response.data;
  },

  update: async (id: string, newsData: Partial<News>, image?: File) => {
    if (image) {
      const response = await api.put(`/api/news/${id}`, buildNewsFormData(newsData, image));
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
