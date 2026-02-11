import api from "./api";
import QueryParams from "../utils/QueryParams";
import type { PaginateParams, User, ApiListResponse } from "../types";

const defaultSearchFields = ["username", "email"];

const userService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<User>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === "object" && !Array.isArray(paginate.filter)
        ? (paginate.filter as Record<string, unknown>)
        : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/user?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/user/${id}`);
    return response.data;
  },

  create: async (userData: Record<string, unknown>) => {
    const response = await api.post("/api-system/user", userData);
    return response.data;
  },

  update: async (id: string, userData: Record<string, unknown>) => {
    const response = await api.put(`/api-system/user/${id}`, userData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/user/${id}`);
    return response.data;
  },
};

export default userService;
