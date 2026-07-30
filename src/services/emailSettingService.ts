import api from './api';
import type { ApiListResponse, EmailSetting, EmailSettingTestResult } from '../types';

const BASE = '/api-system/platform/email-settings';

// The purpose enum caps this list at 3 rows, so an explicit perpage is plenty.
// It is stated rather than left to the backend default so a future change to that
// default cannot silently truncate the list.
const PERPAGE = 20;

const emailSettingService = {
  getAll: async (): Promise<ApiListResponse<EmailSetting>> => {
    const response = await api.get(`${BASE}?perpage=${PERPAGE}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: Partial<EmailSetting>) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  update: async (id: string, data: Partial<EmailSetting>) => {
    const response = await api.put(`${BASE}/${id}`, data);
    return response.data;
  },

  remove: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },

  /**
   * Send a test email through a stored profile.
   * When `to` is blank the key is omitted ENTIRELY (not sent as an empty string) —
   * the backend only substitutes the caller's own address when the key is absent.
   */
  sendTest: async (id: string, to?: string): Promise<EmailSettingTestResult> => {
    const trimmed = to?.trim();
    const body = trimmed ? { to: trimmed } : {};
    const response = await api.post(`${BASE}/${id}/test`, body);
    return response.data?.data ?? response.data;
  },
};

export default emailSettingService;
