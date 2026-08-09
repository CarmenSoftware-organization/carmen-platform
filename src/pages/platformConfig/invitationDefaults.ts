import type { InvitationConfig } from '../../types';

/**
 * ค่า default ของคีย์ `invitation` — ต้องเท่ากับ default ใน PLATFORM_CONFIG_REGISTRY ฝั่ง backend
 * ใช้ร่วมกันระหว่าง InvitationConfigCard (base_url, expiry_days) และ
 * InvitationLimitsCard (max_per_admin_per_hour, max_per_cluster_per_day)
 * เพราะทั้งสองการ์ดแก้คนละครึ่งของ config row เดียวกัน
 */
export const INVITATION_CONFIG_DEFAULTS: Required<InvitationConfig> = {
  base_url: 'http://localhost:3000/invitations',
  expiry_days: 7,
  max_per_admin_per_hour: 100,
  max_per_cluster_per_day: 500,
};
