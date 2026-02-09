import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, User, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'email', 'role'];

const userService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<User>> => {
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
    const response = await api.get(`/api/users?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/users/${id}`);
    return response.data;
  },

  create: async (userData: Partial<User> & { password?: string }) => {
    const response = await api.post('/api/users', userData);
    return response.data;
  },

  update: async (id: string, userData: Partial<User> & { password?: string }) => {
    const response = await api.put(`/api/users/${id}`, userData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/users/${id}`);
    return response.data;
  }
};

export default userService;
