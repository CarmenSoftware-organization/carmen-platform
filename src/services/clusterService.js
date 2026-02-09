import api from './api';
import QueryParams from '../utils/QueryParams';

const defaultSearchFields = ['name', 'description'];

const clusterService = {
  getAll: async (paginate = {}) => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? paginate.filter : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/cluster?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/api-system/cluster/${id}`);
    return response.data;
  },

  create: async (clusterData) => {
    const response = await api.post('/api-system/cluster', clusterData);
    return response.data;
  },

  update: async (id, clusterData) => {
    const response = await api.put(`/api-system/cluster/${id}`, clusterData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/api-system/cluster/${id}`);
    return response.data;
  }
};

export default clusterService;
