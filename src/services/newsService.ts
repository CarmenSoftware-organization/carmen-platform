import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, News, ApiListResponse } from '../types';

const defaultSearchFields = ['title', 'contents'];

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
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/news/${id}`);
    return response.data;
  },

  create: async (newsData: Partial<News>) => {
    const response = await api.post('/api/news', newsData);
    return response.data;
  },

  update: async (id: string, newsData: Partial<News>) => {
    const response = await api.put(`/api/news/${id}`, newsData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/news/${id}`);
    return response.data;
  },
};

export default newsService;
