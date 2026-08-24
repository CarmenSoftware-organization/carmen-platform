import api from "./api";
import { buildQuery } from "../utils/buildQuery";
import type { PaginateParams, UsersResponse, UserSummaryData } from "../types";

const defaultSearchFields = ["username", "email"];

const userService = {
  getAll: async (paginate: PaginateParams = {}): Promise<UsersResponse> => {
    const response = await api.get(
      `/api-system/user?${buildQuery(paginate, defaultSearchFields)}`,
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/user/${id}`);
    return response.data;
  },

  /**
   * Directory aggregate from `GET /api-system/user/summary` — unfiltered, no `search`/
   * `advance` params. Counts every user in the caller's scope, not the current table view.
   * See `UserSummaryData` in `types/index.ts`.
   */
  getDirectorySummary: async (): Promise<UserSummaryData> => {
    const response = await api.get('/api-system/user/summary');
    return response.data.data || response.data;
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

  hardDelete: async (id: string) => {
    const response = await api.delete(`/api-system/user/${id}/hard`);
    return response.data;
  },

  resetPassword: async (id: string, newPassword: string) => {
    const response = await api.put(`/api-system/user/${id}/reset-password`, { newPassword });
    return response.data;
  },

  fetchKeycloakUsers: async () => {
    const response = await api.post("/api-system/fetch-user");
    return response.data;
  },
};

export default userService;
