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
   * แทนที่ค่าของคีย์นั้นทั้งใบ — ต้องส่งครบทุกฟิลด์ที่ schema ของคีย์นั้นรู้จัก
   * ฟิลด์ที่ขาดไปจะได้ 422 กลับมา ไม่ใช่ถูกเติมด้วยค่า default เหมือนเดิม (backend PR #319)
   *
   * ใช้ตัวนี้เมื่อ "การไม่ส่งฟิลด์" มีความหมายว่าตั้งใจล้างค่า — เช่น email_routing ที่การไม่ส่งคีย์ของ
   * เส้นทางหนึ่งแปลว่าให้เส้นทางนั้นกลับไปใช้โปรไฟล์ default ถ้าย้ายไปใช้ patch() เส้นทางที่เคยตั้งไว้
   * จะล้างไม่ออกอีกเลย
   *
   * ห้ามส่ง doc_version: ตารางนี้มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ optimistic locking
   */
  update: async (key: string, value: unknown): Promise<unknown> => {
    const response = await api.put(`${BASE}/${key}`, { value });
    return response.data;
  },

  /**
   * เปลี่ยนเฉพาะฟิลด์ที่ส่งไป ฟิลด์ที่เหลือคงค่าที่บันทึกไว้เดิม
   *
   * ใช้ตัวนี้เมื่อหน้าจอแก้ได้ไม่ครบทุกฟิลด์ของคีย์นั้น — เช่นการ์ดคำเชิญที่แก้ได้แค่ base_url กับ
   * expiry_days ขณะที่ schema ยังมี max_per_admin_per_hour / max_per_cluster_per_day ที่ผู้ดูแล
   * ตั้งไว้ทางอื่น การบันทึกด้วย update() จะทำให้สองค่านั้นถูกเขียนทับ (ก่อน backend PR #319
   * เขียนทับเงียบ ๆ พร้อมตอบ 200 หลังจากนั้นเป็น 422)
   *
   * ชื่อฟิลด์ที่ schema ไม่รู้จักจะได้ 422 ไม่ใช่ถูกละเลย และออบเจกต์ว่างก็ถูกปฏิเสธ
   */
  patch: async (key: string, value: unknown): Promise<unknown> => {
    const response = await api.patch(`${BASE}/${key}`, { value });
    return response.data;
  },
};

export default platformConfigService;
