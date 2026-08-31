import api from './api';
import type { FeatureState } from '../constants/featureFlags';

const BASE = '/api-system/platform/feature-flags';

/**
 * แมป key→state ตามที่ backend ส่งมา ไม่ใช่แถว config เต็ม — endpoint นี้ปอกเปลือกให้แล้ว
 * The bare key→state map; this endpoint already strips the config-row envelope.
 */
export type FeatureStateMap = Record<string, FeatureState>;

const featureFlagService = {
  /**
   * อ่านสถานะฟีเจอร์ทั้งหมด เปิดให้ทุกคนที่ล็อกอิน ไม่ต้องมี permission ใด
   * ต่างจาก platformConfigService ที่ต้องมี platform_config.read — นั่นคือเหตุผลที่มี endpoint นี้
   */
  getAll: async (): Promise<FeatureStateMap> => {
    const response = await api.get(BASE);
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as FeatureStateMap;
  },

  /**
   * แทนที่แมปทั้งใบ — คีย์ที่ไม่ได้ส่งไปถือว่าถูกลบ ต้องมี feature_flag.manage
   * ห้ามส่ง doc_version: ตาราง tb_platform_config มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ
   */
  update: async (states: FeatureStateMap): Promise<FeatureStateMap> => {
    const response = await api.put(BASE, { value: states });
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as FeatureStateMap;
  },
};

export default featureFlagService;
