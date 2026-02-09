import api from './api';

const userService = {
  // Get all users
  getAll: async () => {
    const response = await api.get('/api/users');
    return response.data;
  },

  // Get user by ID
  getById: async (id) => {
    const response = await api.get(`/api/users/${id}`);
    return response.data;
  },

  // Create new user
  create: async (userData) => {
    const response = await api.post('/api/users', userData);
    return response.data;
  },

  // Update user
  update: async (id, userData) => {
    const response = await api.put(`/api/users/${id}`, userData);
    return response.data;
  },

  // Delete user
  delete: async (id) => {
    const response = await api.delete(`/api/users/${id}`);
    return response.data;
  }
};

export default userService;
