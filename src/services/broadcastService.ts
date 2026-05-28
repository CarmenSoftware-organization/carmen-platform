import api from './api';
import type { BroadcastSystemPayload, BroadcastBuPayload } from '../types';

const broadcastService = {
  sendSystem: async (payload: BroadcastSystemPayload) => {
    const response = await api.post('/api-system/notifications/broadcasts/system', payload);
    return response.data;
  },

  sendBu: async (payload: BroadcastBuPayload) => {
    const response = await api.post('/api-system/notifications/broadcasts/bu', payload);
    return response.data;
  },
};

export default broadcastService;
