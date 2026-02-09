import api from './api';

const clusterService = {
  // Get all clusters
  getAll: async () => {
    const response = await api.get('/api/clusters');
    return response.data;
  },

  // Get cluster by ID
  getById: async (id) => {
    const response = await api.get(`/api/clusters/${id}`);
    return response.data;
  },

  // Create new cluster
  create: async (clusterData) => {
    const response = await api.post('/api/clusters', clusterData);
    return response.data;
  },

  // Update cluster
  update: async (id, clusterData) => {
    const response = await api.put(`/api/clusters/${id}`, clusterData);
    return response.data;
  },

  // Delete cluster
  delete: async (id) => {
    const response = await api.delete(`/api/clusters/${id}`);
    return response.data;
  }
};

export default clusterService;
