import api from './api';
import QueryParams from '../utils/QueryParams';

const defaultSearchFields = ['name', 'code', 'description'];

const businessUnitService = {
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
    const response = await api.get(`/api/business-units?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/api/business-units/${id}`);
    return response.data;
  },

  create: async (businessUnitData) => {
    const response = await api.post('/api/business-units', businessUnitData);
    return response.data;
  },

  update: async (id, businessUnitData) => {
    const response = await api.put(`/api/business-units/${id}`, businessUnitData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/api/business-units/${id}`);
    return response.data;
  }
};

export default businessUnitService;
