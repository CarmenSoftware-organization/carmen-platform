import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  DatabasePoolsResponse,
  DatabasePoolWriteInput,
} from '../types';

// ตรงกับ defaultSearchFields ฝั่ง backend (database-pool.service.ts:80)
const defaultSearchFields = ['name', 'host', 'database'];

const BASE = '/api-system/platform/database-pools';

/**
 * Platform database pools — โปรไฟล์การเชื่อมต่อที่ตั้งชื่อได้ ใช้ร่วมกันข้าม business unit
 *
 * password ถูกมาสก์เป็น '••••••' ในทุก response และไม่มี endpoint reveal —
 * `update` จึงส่ง password เฉพาะตอนที่ผู้ใช้พิมพ์ค่าใหม่จริง ผู้เรียกต้องตัดฟิลด์นี้
 * ออกเองเมื่อไม่ได้แก้ (ดู DatabasePoolEdit.buildPayload)
 */
const databasePoolService = {
  getAll: async (paginate: PaginateParams = {}): Promise<DatabasePoolsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: DatabasePoolWriteInput & { password: string }) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // doc_version เป็น required ฝั่ง backend (DatabasePoolUpdateDto) ต่างจาก entity อื่นในrepo นี้
  update: async (id: string, data: DatabasePoolWriteInput & { doc_version: number }) => {
    const response = await api.put(`${BASE}/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },
};

export default databasePoolService;
