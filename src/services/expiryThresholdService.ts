import api from './api';
import type { ExpiryThresholdsConfig } from '../types';

const BASE = '/api-system/platform/expiry-thresholds';

const expiryThresholdService = {
  /**
   * อ่านเกณฑ์ "ใกล้หมดอายุ" ทั้งสามค่า เปิดให้ทุกคนที่ล็อกอิน ไม่ต้องมี permission ใด
   *
   * ต่างจาก `platformConfigService.getAll()` ที่ต้องมี `platform_config.read` — นั่นคือเหตุผล
   * ทั้งหมดที่ endpoint นี้มีอยู่ ถ้าอ่านผ่านเส้นทางนั้น ผู้ใช้ทั่วไปที่เปิดหน้า /licenses จะได้ 403
   * แล้วตกไปใช้ค่าตั้งต้น 30 ตลอดกาล ค่าที่ผู้ดูแลตั้งไว้จะไม่มีผลกับใครเลย
   * Unlike platformConfigService, this needs no permission — which is the whole point.
   *
   * คืน `Partial` เพราะ backend รุ่นเก่าอาจยังไม่รู้จักฟิลด์ใดฟิลด์หนึ่ง ผู้เรียก (context)
   * เป็นผู้ทับลงบนค่าตั้งต้นรายฟิลด์
   * Returns a Partial: the caller merges it onto the in-code defaults, field by field.
   * @returns เกณฑ์ที่ backend ส่งมา อาจไม่ครบทุกฟิลด์ / The thresholds, possibly partial
   */
  getAll: async (): Promise<Partial<ExpiryThresholdsConfig>> => {
    const response = await api.get(BASE);
    // ตัวห่อของ backend มีสองชั้น แต่บางเส้นทางส่งมาชั้นเดียว — ท่าเดียวกับ featureFlagService
    // The backend envelope is two layers deep on some routes and one on others.
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as Partial<ExpiryThresholdsConfig>;
  },
};

export default expiryThresholdService;
