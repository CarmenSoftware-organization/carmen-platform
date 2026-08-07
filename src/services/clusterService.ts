import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { PaginateParams, Cluster, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code'];

const clusterService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Cluster>> => {
    const response = await api.get(
      `/api-system/clusters?${buildQuery(paginate, defaultSearchFields)}`,
    );
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

  // `id` is the tb_cluster_user membership row id (ClusterUser.id), NOT the user's id.
  updateClusterUser: async (
    id: string,
    data: { role?: string; is_active?: boolean },
  ) => {
    const response = await api.put(`/api-system/user/clusters/${id}`, data);
    return response.data;
  },

  deleteClusterUser: async (id: string) => {
    const response = await api.delete(`/api-system/user/clusters/${id}`);
    return response.data;
  },

  // Dedicated logo/avatar upload endpoints (multipart). Return { file_token, url, expires_at }.
  // The multipart Content-Type header is required so axios doesn't JSON-serialize the FormData.
  uploadLogo: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    const response = await api.post(`/api-system/clusters/${id}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadAvatar: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const response = await api.post(`/api-system/clusters/${id}/avatar`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export default clusterService;
