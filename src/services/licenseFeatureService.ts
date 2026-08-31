import api from './api';
import type { FeatureState } from '../constants/featureFlags';
import type { LicenseFeatureAdminRow } from '../types';

const BASE = '/api-system/platform/license-features';

/**
 * แค็ตตาล็อก license feature — แถวสร้างโดย generator ฝั่ง backend เท่านั้น
 * (`scripts/generate-license-catalog`) หน้าจอนี้จึงแก้ได้แค่ `state` ไม่มี create/delete โดยเจตนา
 *
 * `getAll()` คืนแถวที่ `hide` มาด้วย ต่างจาก `subscriptionService.getFeatureCatalog()`
 * ที่กรอง `hide` ทิ้งเพราะเป็นตัวเลือกตอนขาย — หน้าที่ซ่อน feature ได้ต้องหามันเจอเพื่อเอากลับ
 */
const licenseFeatureService = {
  getAll: async (): Promise<{ data: LicenseFeatureAdminRow[] }> => {
    const response = await api.get(`${BASE}/all`);
    return response.data;
  },

  /**
   * เปลี่ยนสถานะทีละแถว — `doc_version` บังคับฝั่ง backend ไม่ส่งจะได้ 400 ไม่ใช่ผ่านไปเงียบ ๆ
   * และค่าที่ล้าสมัยได้ 409 ให้ผู้เรียกจัดการด้วย notifyVersionConflict() + refetch
   *
   * อ้างด้วย `id` ไม่ใช่ `key` เพราะ feature key มีจุดคั่น (`inventory.count`)
   * การวางใน path param เปิดเรื่อง encode ที่รีโปนี้เคยโดนมาแล้ว
   */
  setState: async (
    id: string,
    state: FeatureState,
    docVersion: number,
  ): Promise<{ data: LicenseFeatureAdminRow }> => {
    const response = await api.patch(`${BASE}/${id}`, { state, doc_version: docVersion });
    return response.data;
  },
};

export default licenseFeatureService;
