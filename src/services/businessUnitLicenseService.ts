import api from './api';
import type { BusinessUnitLicense } from '../types';

const BASE = (buId: string) => `/api-system/business-units/${buId}/licenses`;

/**
 * ใบซื้อที่นั่งของ BU (tb_business_unit_license) — nested resource ใต้ business unit
 * เหมือน `clusterService.getClusterUsers` ไม่ paginate เอง คืน `response.data` ดิบ
 * (envelope `{ data }`) ให้ผู้เรียก unwrap ด้วย `data.data || data` ตามรูปแบบเดิมของ repo
 */
const businessUnitLicenseService = {
  getAll: async (buId: string) => {
    const response = await api.get(BASE(buId));
    return response.data;
  },

  create: async (
    buId: string,
    data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>,
  ) => {
    const response = await api.post(BASE(buId), data);
    return response.data;
  },

  // doc_version บังคับส่งเสมอ — backend คืน 409 ถ้าชนกับที่แก้ไปก่อนหน้า
  update: async (
    buId: string,
    id: string,
    data: Partial<BusinessUnitLicense> & { doc_version: number },
  ) => {
    const response = await api.patch(`${BASE(buId)}/${id}`, data);
    return response.data;
  },

  delete: async (buId: string, id: string) => {
    const response = await api.delete(`${BASE(buId)}/${id}`);
    return response.data;
  },
};

export default businessUnitLicenseService;
