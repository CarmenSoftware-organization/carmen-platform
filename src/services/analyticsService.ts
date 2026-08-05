import api from './api';
import type {
  ActivityEvent,
  AnalyticsFilterParams,
  AnalyticsOverview,
  ApiListResponse,
  PaginateParams,
} from '../types';

/** ตัดคีย์ที่ไม่มีค่าออก เพื่อไม่ให้ส่ง `bu_code=` เปล่า ๆ ไปให้ backend ตีความ */
const toQuery = (params: Record<string, unknown>): string => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  return q.toString();
};

const analyticsService = {
  getOverview: async (
    params: AnalyticsFilterParams,
  ): Promise<{ data: AnalyticsOverview }> => {
    const response = await api.get(
      `/api-system/platform/analytics/overview?${toQuery({ ...params })}`,
    );
    return response.data;
  },

  getEvents: async (
    params: AnalyticsFilterParams & PaginateParams,
  ): Promise<ApiListResponse<ActivityEvent>> => {
    const { page, perpage, search, sort, ...filters } = params;
    const response = await api.get(
      `/api-system/platform/analytics/events?${toQuery({
        ...filters,
        page: page ?? 1,
        perpage: perpage ?? 25,
        search,
        sort: sort || 'server_ts:desc',
      })}`,
    );
    return response.data;
  },
};

export default analyticsService;
