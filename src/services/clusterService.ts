import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Cluster, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'description'];

const clusterService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Cluster>> => {
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
    const response = await api.get(`/api-system/cluster?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/cluster/${id}`);
    return response.data;
  },

  create: async (clusterData: Partial<Cluster>) => {
    const response = await api.post('/api-system/cluster', clusterData);
    return response.data;
  },

  update: async (id: string, clusterData: Partial<Cluster>) => {
    const response = await api.put(`/api-system/cluster/${id}`, clusterData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/cluster/${id}`);
    return response.data;
  }
};

export default clusterService;
