import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  LicenseFeatureGroupsResponse,
  LicenseFeatureGroupDetail,
  LicenseFeatureGroupWriteInput,
} from '../types';

// ตรงกับ defaultSearchFields ฝั่ง backend (license-feature-group.service.ts)
const defaultSearchFields = ['code', 'name'];

const BASE = '/api-system/platform/license-feature-groups';

/**
 * กลุ่ม feature ของ license — catalog ระดับแพลตฟอร์ม ไม่ใช่ของ cluster ใด cluster หนึ่ง
 *
 * `code` ตั้งได้ตอนสร้างเท่านั้น `update` จึงไม่ส่ง `code` — backend ไม่รับใน PATCH และการเปลี่ยน
 * รหัสกลุ่มที่ขายไปแล้วคือการเปลี่ยนตัวตนของกลุ่ม ไม่ใช่การแก้ชื่อ
 *
 * `setFeatures` เป็น replace semantics และ **รายการที่ได้กลับมายาวกว่าที่ส่งไปได้** เพราะ backend
 * เติม module แม่ของทุก feature ลูกให้เอง (กฎ "ลูกลากพ่อ")
 * ผู้เรียกจึงต้องใช้ค่าที่ response คืนมา ไม่ใช่ค่าที่ตัวเองส่งไป
 */
const licenseFeatureGroupService = {
  getAll: async (paginate: PaginateParams = {}): Promise<LicenseFeatureGroupsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (
    data: LicenseFeatureGroupWriteInput & { code: string },
  ): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // doc_version บังคับฝั่ง backend (LicenseFeatureGroupUpdateDto) — ไม่ส่งจะได้ 400 ไม่ใช่ผ่านไปเงียบ ๆ
  update: async (
    id: string,
    data: LicenseFeatureGroupWriteInput & { doc_version: number },
  ): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  /** แทนที่ชุด feature ทั้งชุด — ส่ง desired set ทั้งหมด ไม่ใช่ diff */
  setFeatures: async (
    id: string,
    featureKeys: string[],
    docVersion: number,
  ): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.put(`${BASE}/${id}/features`, {
      feature_keys: featureKeys,
      doc_version: docVersion,
    });
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },
};

export default licenseFeatureGroupService;
