import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { ActivityLogDetail, ActivityLogsResponse, PaginateParams } from '../types';

const BASE = '/api-system/platform/activity-logs';

const activityLogService = {
  /**
   * ประวัติการเปลี่ยนแปลงของเรคอร์ดเดียว เรียงใหม่→เก่า (backend เรียงมาให้แล้ว)
   *
   * `entityType` คือชื่อตารางที่ตัด prefix `tb_` ออกแล้ว — backend เก็บ `cluster`
   * ไม่ใช่ `tb_cluster` ส่งผิดจะได้รายการว่างโดยไม่มี error
   */
  getRecordTrail: async (
    entityType: string,
    entityId: string,
    paginate: PaginateParams = {},
  ): Promise<ActivityLogsResponse> => {
    const qs = buildQuery(paginate);
    const response = await api.get(
      `${BASE}/record/${entityId}?entity_type=${encodeURIComponent(entityType)}${qs ? `&${qs}` : ''}`,
    );
    return response.data;
  },

  /** รายการเดียวพร้อม diff รายฟิลด์ — แพงกว่า list จึงเรียกเฉพาะตอนผู้ใช้กางดู */
  getDetail: async (id: string): Promise<{ data: ActivityLogDetail }> => {
    const response = await api.get(`${BASE}/${id}/detail`);
    return { data: response.data?.data ?? response.data };
  },
};

export default activityLogService;
