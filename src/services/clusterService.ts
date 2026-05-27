import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Cluster, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code'];

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
    const response = await api.get(`/api-system/clusters?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/clusters/${id}`);
    return response.data;
  },

  create: async (clusterData: Partial<Cluster>) => {
    const response = await api.post('/api-system/clusters', clusterData);
    return response.data;
  },

  update: async (id: string, clusterData: Partial<Cluster>) => {
    const response = await api.put(`/api-system/clusters/${id}`, clusterData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/clusters/${id}`);
    return response.data;
  },

  getClusterUsers: async (clusterId: string) => {
    const response = await api.get(`/api-system/user/clusters/${clusterId}`);
    return response.data;
  },
};

export default clusterService;
