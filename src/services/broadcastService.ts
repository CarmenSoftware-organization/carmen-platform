import api from './api';
import type {
  BroadcastSystemPayload,
  BroadcastBuPayload,
  BroadcastListParams,
  BroadcastsResponse,
  BroadcastListItem,
  BroadcastUpdatePayload,
} from '../types';

const broadcastService = {
  sendSystem: async (payload: BroadcastSystemPayload) => {
    const response = await api.post('/api/notifications/broadcasts/system', payload);
    return response.data;
  },

  sendBu: async (payload: BroadcastBuPayload) => {
    const response = await api.post('/api/notifications/broadcasts/bu', payload);
    return response.data;
  },

  getAll: async (params?: BroadcastListParams): Promise<BroadcastsResponse> => {
    const response = await api.get('/api/notifications/broadcasts', { params });
    return response.data;
  },

  getById: async (id: string): Promise<BroadcastListItem> => {
    const response = await api.get(`/api/notifications/broadcasts/${id}`);
    return response.data?.data ? response.data.data : response.data;
  },

  update: async (id: string, payload: BroadcastUpdatePayload) => {
    const response = await api.patch(`/api/notifications/broadcasts/${id}`, payload);
    return response.data?.data ? response.data.data : response.data;
  },

  remove: async (id: string, docVersion: number) => {
    const response = await api.delete(`/api/notifications/broadcasts/${id}`, {
      params: { doc_version: docVersion },
    });
    return response.data?.data ? response.data.data : response.data;
  },
};

export default broadcastService;
