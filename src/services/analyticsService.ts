import api from './api';
import type {
  ActivityEvent,
  AnalyticsFilterParams,
  AnalyticsOverview,
  ApiListResponse,
  PaginateParams,
} from '../types';

/** ตัดคีย์ที่ไม่มีค่าออก เพื่อไม่ให้ส่ง `bu_code=` เปล่า ๆ ไปให้ backend ตีความ */
const toQuery = (params: Record<string, unknown>): string => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  return q.toString();
};

const analyticsService = {
  getOverview: async (
    params: AnalyticsFilterParams,
  ): Promise<{ data: AnalyticsOverview }> => {
    // ตั้งใจส่งเป็น filter_bu_code ไม่ใช่ bu_code — KeycloakGuard ที่ gateway เช็คแค่ "มี
    // query param ชื่อ bu_code หรือไม่" แล้วบังคับว่าผู้ใช้ต้องเป็นสมาชิก BU นั้นหรือเป็น
    // super-admin ไม่งั้น 401 ทันที ถ้าใครมา "จัดระเบียบ" คืนกลับเป็น bu_code จะทำให้
    // support_manager (role ที่เพิ่งได้สิทธิ์เข้าหน้านี้) โดน 401 ทุกครั้งที่กรอง BU และ
    // ทุกคนแม้แต่ super-admin จะโดน 401 ถ้า code ที่กรองไม่ตรงกับ BU จริงสักตัว
    const { bu_code, ...rest } = params;
    const response = await api.get(
      `/api-system/platform/analytics/overview?${toQuery({
        ...rest,
        ...(bu_code ? { filter_bu_code: bu_code } : {}),
      })}`,
    );
    // unwrap แบบยอมรับได้ทั้งสองรูปเหมือน getter ตัวเดียวอื่น ๆ ใน repo — backend ตอนนี้
    // ห่อด้วย { data } เสมอ แต่ถ้าวันหนึ่งตอบ object เปล่า ๆ มา หน้าจะพังเงียบ ๆ
    return { data: response.data?.data ?? response.data };
  },

  getEvents: async (
    params: AnalyticsFilterParams & PaginateParams,
  ): Promise<ApiListResponse<ActivityEvent>> => {
    const { page, perpage, search, sort, bu_code, ...filters } = params;
    const response = await api.get(
      // ตั้งใจส่งเป็น filter_bu_code ไม่ใช่ bu_code (เหตุผลเดียวกับ getOverview ด้านบน) —
      // KeycloakGuard ที่ gateway ดักคีย์ bu_code เป๊ะ ๆ แล้วบังคับ BU membership / super-admin
      //
      // path ต้องเป็น `records` ไม่ใช่ `events` — **ห้ามเปลี่ยนกลับ** ตัวบล็อกโฆษณาฝั่งเบราว์เซอร์
      // (uBlock/AdGuard/Brave และ filter list สาย EasyPrivacy) กรอง URL ที่มีสตริง
      // `analytics/event` ทิ้ง **ก่อน request ออกจากเครื่องผู้ใช้** ผลคือหน้านี้ขึ้น "Network Error"
      // ถาวรสำหรับคนที่ติดตั้งตัวบล็อก ขณะที่ `curl` ผ่านปกติและ log ฝั่ง backend ว่างเปล่า
      // วัดแล้ว: `analytics/event*` ถูกบล็อก · `analytics/records`, `analytics/overview` ผ่าน
      `/api-system/platform/analytics/records?${toQuery({
        ...filters,
        ...(bu_code ? { filter_bu_code: bu_code } : {}),
        page: page ?? 1,
        perpage: perpage ?? 25,
        search,
        sort: sort || 'server_ts:desc',
      })}`,
    );
    return response.data;
  },
};

export default analyticsService;
