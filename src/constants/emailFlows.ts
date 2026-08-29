import type { EmailFlow } from '../types';
import type { TKey } from '../i18n/types';

/**
 * เส้นทางอีเมลทั้งหมดที่เลือกโปรไฟล์ผู้ส่งแยกกันได้
 *
 * เดิมไฟล์นี้เป็นรายการ "วัตถุประสงค์ของโปรไฟล์" ตอนที่โปรไฟล์หนึ่งผูกกับหนึ่งวัตถุประสงค์
 * ตอนนี้โปรไฟล์เป็นรายการหลักที่ตั้งชื่อได้ ไฟล์นี้จึงกลายเป็นรายการ "ผู้ใช้โปรไฟล์" แทน
 * ใช้เรนเดอร์การ์ด mapping — ลำดับในอาร์เรย์คือลำดับที่แสดงบนหน้าจอ
 */
export interface EmailFlowMeta {
  value: EmailFlow;
  label: string;
  /** คีย์ ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้ ผู้เรนเดอร์เป็นคนแปล */
  descriptionKey: TKey;
}

export const EMAIL_FLOWS: EmailFlowMeta[] = [
  {
    value: 'register',
    label: 'Register',
    descriptionKey: 'pages.emailSettings.flowRegisterDescription',
  },
  {
    value: 'verify_email',
    label: 'Verify email',
    descriptionKey: 'pages.emailSettings.flowVerifyEmailDescription',
  },
  {
    value: 'invitation',
    label: 'Invitation',
    descriptionKey: 'pages.emailSettings.flowInvitationDescription',
  },
  {
    value: 'forgot_password',
    label: 'Forgot password',
    descriptionKey: 'pages.emailSettings.flowForgotPasswordDescription',
  },
  {
    value: 'notification',
    label: 'Notification',
    descriptionKey: 'pages.emailSettings.flowNotificationDescription',
  },
];
