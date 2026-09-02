import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { CronJob, CronJobsResponse, CronJobWriteInput, PaginateParams } from '../types';

// ตรงกับ SEARCHABLE ฝั่ง gateway (platform_cronjobs.service.ts)
// คีย์บนสาย wire เป็นตัวเล็กล้วนเสมอ — เขียน camelCase แล้วคำค้นหายเงียบ
const defaultSearchFields = ['name', 'description', 'job_type', 'cron_expression', 'source_service'];

const BASE = '/api-system/platform/cronjobs';

/**
 * Encode a filter object as the gateway's "key:value;key:value" grammar
 * (parseFilterString in apps/backend-gateway/src/shared-dto/paginate.dto.ts), NOT the
 * `filter={"a":"b"}` JSON that QueryParams/buildQuery emit for every other service.
 * platform_cronjobs.service.ts (findAll) reads paginate.filter as that key:value map —
 * sending JSON produces keys like `{"job_type"` that never match, so every filter here
 * was silently a no-op. Hence this service hand-builds its query string instead of
 * calling buildQuery with the filter included, unlike its neighbours.
 *
 * Known gap: parseFilterString drops a "key:value" pair whose value is empty
 * (`if (key && value)`), so an empty-string value can never survive this wire format.
 * CronJobFilterSheet deliberately sends `source_service: ''` to mean "no owning
 * service" (Platform owner). That pair is still encoded correctly below
 * (`source_service:`), but the gateway parser drops it before platform_cronjobs
 * .service.ts ever sees it, so the "Platform" owner filter has no effect until the
 * gateway's parseFilterString is changed to distinguish "omitted" from "intentionally
 * empty" — out of scope for this frontend-only fix.
 */
function encodeFilter(filter: PaginateParams['filter']): string {
  if (!filter || Array.isArray(filter) || typeof filter !== 'object') return '';
  return Object.entries(filter)
    .filter(([key]) => key)
    .map(([key, value]) => `${key}:${value ?? ''}`)
    .join(';');
}

/**
 * งานตามเวลาใน "CRONJOBS"."Cronjob"
 *
 * micro-cronjob ไม่มี auth ของตัวเอง ทุกอย่างจึงผ่าน gateway เท่านั้น
 * pagination ทำที่ gateway เพราะ Go คืนทั้งตารางมาในครั้งเดียว
 */
const cronjobService = {
  getAll: async (paginate: PaginateParams = {}): Promise<CronJobsResponse> => {
    const { filter, ...rest } = paginate;
    const params = new URLSearchParams(buildQuery(rest, defaultSearchFields));
    const encodedFilter = encodeFilter(filter);
    if (encodedFilter) params.set('filter', encodedFilter);
    const res = await api.get(`${BASE}?${params.toString()}`);
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
