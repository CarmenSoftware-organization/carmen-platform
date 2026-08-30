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

  /**
   * สร้างสัญญาให้ BU หนึ่งตัว — `business_unit_id` บังคับและต้องอยู่ใน `cluster_id` ที่ส่งมา
   *
   * ไม่ส่ง `subscription_number` — ระบบออกให้เอง (`SUB-YYMM-####` เลขวิ่งทั่วระบบต่อเดือน)
   * ส่งไปก็ถูกเมิน
   */
  create: async (data: {
    cluster_id: string;
    business_unit_id: string;
    start_date: string;
    end_date: string;
    status?: Subscription['status'];
  }) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // PATCH ไม่ใช่ PUT — แก้เฉพาะข้อมูลสัญญา (วันที่/status) ไม่แตะ feature
  // doc_version บังคับส่งเสมอ — backend คืน 400 ถ้าไม่ส่ง เหมือน platform_role
  // การป้องกันที่ข้ามได้เงียบๆ ไม่ใช่การป้องกัน
  update: async (
    id: string,
    // ไม่มี `subscription_number` (ระบบออกให้) และไม่มี `business_unit_id` (แก้ไม่ได้หลังสร้าง)
    data: Pick<Partial<Subscription>, 'start_date' | 'end_date' | 'status'> & {
      doc_version: number;
    },
  ) => {
    const response = await api.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  /**
   * แทนที่สิทธิ์ทั้งชุด — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff
   *
   * ไม่มี BU ใน payload อีกแล้ว — หนึ่งสัญญาผูก BU เดียวที่กำหนดตอนสร้างและเปลี่ยนไม่ได้
   * (เดิม endpoint นี้ถอด/เพิ่ม BU ได้ด้วย ซึ่งทำให้ "แก้สิทธิ์" กับ "เปลี่ยนคู่สัญญา" เป็นการกระทำเดียวกัน)
   */
  setFeatures: async (
    id: string,
    featureKeys: string[],
    docVersion: number, // บังคับ — backend คืน 400 ถ้าไม่ส่ง
  ): Promise<{ data: SubscriptionDetail }> => {
    const response = await api.put(`${BASE}/${id}/features`, {
      feature_keys: featureKeys,
      doc_version: docVersion,
    });
    return response.data;
  },

  /**
   * แทนที่ชุด **กลุ่มสิทธิ์** ทั้งชุดของสัญญา — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff
   *
   * ตัวนี้มาแทน `setFeatures` ในหน้าขาย: การขายเลือกเป็นกลุ่ม ไม่ใช่ติ๊ก feature ทีละตัวอีกแล้ว
   * `setFeatures` ยังอยู่เพราะ backend ยังรับ และใบที่ยังไม่ถูก backfill ยังพึ่งมัน
   */
  setGroups: async (
    id: string,
    groupIds: string[],
    docVersion: number, // บังคับ — backend คืน 400 ถ้าไม่ส่ง
  ): Promise<{ data: SubscriptionDetail }> => {
    const response = await api.put(`${BASE}/${id}/groups`, {
      group_ids: groupIds,
      doc_version: docVersion,
    });
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
