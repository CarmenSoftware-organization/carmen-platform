import api from './api';

const superAdminService = {
  list: async () => {
    const r = await api.get('/api-system/platform/super-admins');
    return r.data;
  },
  add: async (user_id: string) => {
    const r = await api.post('/api-system/platform/super-admins', { user_id });
    return r.data;
  },
  remove: async (id: string) => {
    const r = await api.delete(`/api-system/platform/super-admins/${id}`);
    return r.data;
  },
};

export default superAdminService;
