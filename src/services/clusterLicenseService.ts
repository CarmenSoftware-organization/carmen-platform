import api from './api';
import type { ClusterLicense } from '../types';

const BASE = (clusterId: string) => `/api-system/clusters/${clusterId}/licenses`;

/**
 * ใบซื้อโควตา BU ของ cluster (tb_cluster_license) — nested resource ใต้ cluster
 * รูปเดียวกับ `businessUnitLicenseService`: ไม่ paginate เอง คืน `response.data` ดิบ
 * (envelope `{ data }`) ให้ผู้เรียก unwrap ด้วย `data.data || data`
 */
const clusterLicenseService = {
  getAll: async (clusterId: string) => {
    const response = await api.get(BASE(clusterId));
    return response.data;
  },

  create: async (
    clusterId: string,
    data: Omit<ClusterLicense, 'id' | 'cluster_id' | 'doc_version'>,
  ) => {
    const response = await api.post(BASE(clusterId), data);
    return response.data;
  },

  // doc_version บังคับส่งเสมอ — backend คืน 409 ถ้าชนกับที่แก้ไปก่อนหน้า
  update: async (
    clusterId: string,
    id: string,
    data: Partial<ClusterLicense> & { doc_version: number },
  ) => {
    const response = await api.patch(`${BASE(clusterId)}/${id}`, data);
    return response.data;
  },

  delete: async (clusterId: string, id: string) => {
    const response = await api.delete(`${BASE(clusterId)}/${id}`);
    return response.data;
  },
};

export default clusterLicenseService;
