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
    const response = await api.get(`/api-system/business-unit?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/business-unit/${id}`);
    return response.data;
  },

  create: async (businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.post('/api-system/business-unit', businessUnitData);
    return response.data;
  },

  update: async (id: string, businessUnitData: Partial<BusinessUnit>) => {
    const response = await api.put(`/api-system/business-unit/${id}`, businessUnitData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/business-unit/${id}`);
    return response.data;
  }
};

export default businessUnitService;
