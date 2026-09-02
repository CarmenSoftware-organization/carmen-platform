import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { CronJob, CronJobsResponse, CronJobWriteInput, PaginateParams } from '../types';

// ตรงกับ SEARCHABLE ฝั่ง gateway (platform_cronjobs.service.ts)
// คีย์บนสาย wire เป็นตัวเล็กล้วนเสมอ — เขียน camelCase แล้วคำค้นหายเงียบ
const defaultSearchFields = ['name', 'description', 'job_type', 'source_service'];

const BASE = '/api-system/platform/cronjobs';

/**
 * งานตามเวลาใน "CRONJOBS"."Cronjob"
 *
 * micro-cronjob ไม่มี auth ของตัวเอง ทุกอย่างจึงผ่าน gateway เท่านั้น
 * pagination ทำที่ gateway เพราะ Go คืนทั้งตารางมาในครั้งเดียว
 */
const cronjobService = {
  getAll: async (paginate: PaginateParams = {}): Promise<CronJobsResponse> => {
    const res = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return res.data.data ?? res.data;
  },

  getById: async (id: string): Promise<CronJob> => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data.data ?? res.data;
  },

  create: async (data: CronJobWriteInput): Promise<CronJob> => {
    const res = await api.post(BASE, data);
    return res.data.data ?? res.data;
  },

  // doc_version ส่งเฉพาะเมื่อ GET คืนมา — ไม่ส่ง = gateway ข้ามการตรวจ
  update: async (
    id: string,
    data: Omit<CronJobWriteInput, 'job_type'> & { doc_version?: number },
  ): Promise<CronJob> => {
    const res = await api.patch(`${BASE}/${id}`, data);
    return res.data.data ?? res.data;
  },

  remove:  async (id: string) => (await api.delete(`${BASE}/${id}`)).data,
  start:   async (id: string) => (await api.post(`${BASE}/${id}/start`)).data,
  stop:    async (id: string) => (await api.post(`${BASE}/${id}/stop`)).data,
  execute: async (id: string) => (await api.post(`${BASE}/${id}/execute`)).data,

  getStatus: async (): Promise<{ active_jobs: number }> => {
    const res = await api.get(`${BASE}/status`);
    return res.data.data ?? res.data;
  },
};

export default cronjobService;
