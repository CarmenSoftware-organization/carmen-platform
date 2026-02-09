import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, BusinessUnit, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code', 'description'];

const businessUnitService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<BusinessUnit>> => {
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
    const response = await api.get(`/api/business-units?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/business-units/${id}`);
    return response.data;
  },

  create: async (businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.post('/api/business-units', businessUnitData);
    return response.data;
  },

  update: async (id: string, businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.put(`/api/business-units/${id}`, businessUnitData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/business-units/${id}`);
    return response.data;
  }
};

export default businessUnitService;
