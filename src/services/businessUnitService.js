import api from './api';

const businessUnitService = {
  // Get all business units
  getAll: async () => {
    const response = await api.get('/api/business-units');
    return response.data;
  },

  // Get business unit by ID
  getById: async (id) => {
    const response = await api.get(`/api/business-units/${id}`);
    return response.data;
  },

  // Create new business unit
  create: async (businessUnitData) => {
    const response = await api.post('/api/business-units', businessUnitData);
    return response.data;
  },

  // Update business unit
  update: async (id, businessUnitData) => {
    const response = await api.put(`/api/business-units/${id}`, businessUnitData);
    return response.data;
  },

  // Delete business unit
  delete: async (id) => {
    const response = await api.delete(`/api/business-units/${id}`);
    return response.data;
  }
};

export default businessUnitService;
