import type { EmailSenderPurpose } from '../types';

export interface EmailSenderPurposeMeta {
  value: EmailSenderPurpose;
  label: string;
  /** false = ยังไม่มีระบบไหนส่งอีเมลผ่าน purpose นี้ — การ์ดจะขึ้นคำเตือน */
  inUse: boolean;
  description: string;
}

export const EMAIL_SENDER_PURPOSES: EmailSenderPurposeMeta[] = [
  {
    value: 'no_reply',
    label: 'No-reply',
    inUse: true,
    description: 'อีเมลอัตโนมัติที่ผู้ใช้ตอบกลับไม่ได้ เช่น รีเซ็ตรหัสผ่าน',
  },
  {
    value: 'support',
    label: 'Support',
    inUse: false,
    description: 'อีเมลที่ต้องการให้ผู้รับตอบกลับหาทีมซัพพอร์ตได้',
  },
  {
    value: 'billing',
    label: 'Billing',
    inUse: false,
    description: 'อีเมลเรื่องใบแจ้งหนี้และการชำระเงิน',
  },
];
