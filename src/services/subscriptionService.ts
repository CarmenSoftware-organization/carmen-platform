import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  Subscription,
  SubscriptionDetail,
  SubscriptionsResponse,
  LicenseFeature,
} from '../types';

// backend ค้นหาได้แค่ `subscription_number` จริงๆ (subscription.service.ts:177,183 — บั๊ก
// casing ระหว่าง `p.searchFields` กับคีย์ payload จริง `searchfields` ทำให้ค่าที่ frontend
// ส่งไปไม่ถูกอ่านเลย ไม่ว่าจะส่งฟิลด์ไหนก็ตกลงมาที่ default ตัวนี้เสมอ) — อย่าใส่ `cluster_name`
// กลับเข้าไปจนกว่า backend จะแก้ตัวแปรให้ตรงกัน
const defaultSearchFields = ['subscription_number'];

const BASE = '/api-system/platform/subscriptions';

const subscriptionService = {
  getAll: async (paginate: PaginateParams = {}): Promise<SubscriptionsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: Partial<Subscription>) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // PATCH ไม่ใช่ PUT — แก้เฉพาะข้อมูลสัญญา (วันที่/status) ไม่แตะ feature
  // doc_version บังคับส่งเสมอ — backend คืน 400 ถ้าไม่ส่ง เหมือน platform_role
  // การป้องกันที่ข้ามได้เงียบๆ ไม่ใช่การป้องกัน
  update: async (id: string, data: Partial<Subscription> & { doc_version: number }) => {
    const response = await api.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  /**
   * แทนที่สิทธิ์ทั้งชุด — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff
   * BU ที่ไม่อยู่ใน `bus` จะถูกถอดออกจากสัญญา
   */
  setFeatures: async (
    id: string,
    bus: { business_unit_id: string; feature_keys: string[] }[],
    docVersion: number, // บังคับ — backend คืน 400 ถ้าไม่ส่ง
  ): Promise<{ data: SubscriptionDetail }> => {
    const response = await api.put(`${BASE}/${id}/features`, { bus, doc_version: docVersion });
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },

  getFeatureCatalog: async (): Promise<{ data: LicenseFeature[] }> => {
    const response = await api.get('/api-system/platform/license-features');
    return response.data;
  },
};

export default subscriptionService;
