import type { EmailFlow } from '../types';

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
  description: string;
}

export const EMAIL_FLOWS: EmailFlowMeta[] = [
  {
    value: 'register',
    label: 'Register',
    description: 'ลิงก์ยืนยันอีเมลก่อนสร้างบัญชี และอีเมลแจ้งว่ามีบัญชีอยู่แล้ว',
  },
  {
    value: 'verify_email',
    label: 'Verify email',
    description: 'ลิงก์ยืนยันอีเมลของบัญชีที่สร้างก่อนกลับลำดับ และเส้นทางผู้ดูแลสร้างให้',
  },
  {
    value: 'invitation',
    label: 'Invitation',
    description: 'คำเชิญเข้าคลัสเตอร์ และอีเมลแจ้งเมื่อบัญชีถูกสร้างจากคำเชิญ',
  },
  {
    value: 'forgot_password',
    label: 'Forgot password',
    description: 'ลิงก์ตั้งรหัสผ่านใหม่',
  },
  {
    value: 'notification',
    label: 'Notification',
    description: 'อีเมลแจ้งเตือนภายใน เช่น รายงานและการแจ้งเตือนระดับหน่วยธุรกิจ',
  },
];
