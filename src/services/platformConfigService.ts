import api from './api';
import type { ApiListResponse, PlatformConfig } from '../types';

const BASE = '/api-system/platform/configs';

const platformConfigService = {
  /**
   * ดึง config ทุกคีย์ที่ backend รองรับ — คีย์ที่ยังไม่เคยบันทึกจะได้ค่าเริ่มต้นกลับมาโดยมี id เป็น null
   * ไม่ส่ง perpage: จำนวนคีย์ถูกกำหนดโดย registry ฝั่ง backend ไม่ใช่ผู้ใช้ และไม่มีการแบ่งหน้า
   */
  getAll: async (): Promise<ApiListResponse<PlatformConfig>> => {
    const response = await api.get(BASE);
    return response.data;
  },

  getByKey: async (key: string): Promise<PlatformConfig> => {
    const response = await api.get(`${BASE}/${key}`);
    return response.data.data ?? response.data;
  },

  /**
   * แทนที่ค่าของคีย์นั้นทั้งใบ — backend ไม่รองรับการส่งเฉพาะบางฟิลด์
   * ห้ามส่ง doc_version: ตารางนี้มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ optimistic locking
   */
  update: async (key: string, value: unknown): Promise<unknown> => {
    const response = await api.put(`${BASE}/${key}`, { value });
    return response.data;
  },
};

export default platformConfigService;
