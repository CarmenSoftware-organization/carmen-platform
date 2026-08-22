import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConfigCardShell, ReadOnlyText } from './ConfigCardShell';
import { AuditMeta } from '../../components/AuditMeta';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import { normalizeAudit } from '../../utils/audit';
import type { NotificationEmailConfig, PlatformConfig } from '../../types';

interface NotificationEmailConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

interface NotificationEmailFormData {
  enabled: boolean;
  recipients: string;
  cc: string;
  subject_prefix: string;
}

const DEFAULTS: NotificationEmailConfig = {
  enabled: false,
  recipients: [],
  cc: [],
  subject_prefix: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** แยกรายชื่อที่คั่นด้วยจุลภาค ตัดช่องว่างและรายการว่างทิ้ง */
const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม — ค่าที่ backend คืนมาผ่าน Zod แล้วเสมอ
 * แต่ยังกันไว้ด้วย fallback เผื่อ backend เวอร์ชันเก่ายังไม่รู้จักคีย์นี้
 */
const toForm = (config: PlatformConfig | null): NotificationEmailFormData => {
  const value = (config?.value ?? {}) as Partial<NotificationEmailConfig>;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    recipients: Array.isArray(value.recipients) ? value.recipients.join(', ') : '',
    cc: Array.isArray(value.cc) ? value.cc.join(', ') : '',
    subject_prefix:
      typeof value.subject_prefix === 'string' ? value.subject_prefix : DEFAULTS.subject_prefix,
  };
};

/**
 * การ์ดตั้งค่าว่าอีเมลแจ้งเตือนภายใน (รายงาน / การแจ้งเตือนระดับหน่วยธุรกิจ) ส่งถึงใคร
 *
 * ที่นี่มีแต่ "ส่งถึงใคร" ไม่มี "ส่งจากใคร" — host / user / password ของ SMTP อยู่ที่หน้า Email
 * Setting (`tb_email_sender_profile`) ซึ่งเข้ารหัสรหัสผ่านและแยกโปรไฟล์ตามวัตถุประสงค์ได้
 * การเอา credential มาไว้ในการ์ดนี้จะเป็นการมีแหล่งความจริงสองที่สำหรับเรื่องเดียวกัน
 */
export const NotificationEmailConfigCard: React.FC<NotificationEmailConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<NotificationEmailFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * ตรวจฝั่ง FE เพื่อ UX เท่านั้น — backend ตัดสินสุดท้ายด้วย z.string().email() เสมอ
   * รายการว่างถือว่าถูกต้อง เพราะ "ไม่ส่งถึงใครเป็นการเฉพาะ" เป็นค่าที่ใช้ได้จริง
   */
  const validate = (
    name: Exclude<keyof NotificationEmailFormData, 'enabled'>,
    value: string,
  ): string => {
    if (name === 'subject_prefix') {
      return value.length > 64 ? 'ยาวเกิน 64 ตัวอักษร' : '';
    }
    const bad = splitCsv(value).filter((e) => !EMAIL_PATTERN.test(e));
    return bad.length > 0 ? `อีเมลไม่ถูกต้อง: ${bad.join(', ')}` : '';
  };

  const handleChange = (
    name: Exclude<keyof NotificationEmailFormData, 'enabled'>,
    value: string,
  ) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: Exclude<keyof NotificationEmailFormData, 'enabled'>) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(name, formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      recipients: validate('recipients', formData.recipients),
      cc: validate('cc', formData.cc),
      subject_prefix: validate('subject_prefix', formData.subject_prefix),
    };
    if (errors.recipients || errors.cc || errors.subject_prefix) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // PATCH ไม่ใช่ PUT: หลัง backend PR #319 การส่งไม่ครบทุกฟิลด์ของ schema ตอบ 422
      // การ์ดนี้แสดงครบทั้ง 4 ฟิลด์ในวันนี้ แต่ PATCH ทำให้วันที่ backend เติมฟิลด์ที่ 5
      // เข้า schema การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะพังทันที
      await platformConfigService.patch('notification_email', {
        enabled: formData.enabled,
        recipients: splitCsv(formData.recipients),
        cc: splitCsv(formData.cc),
        subject_prefix: formData.subject_prefix.trim(),
      });
      toast.success('บันทึกการตั้งค่าอีเมลแจ้งเตือนแล้ว');
      await onSaved();
    } catch (err: unknown) {
      const { message, fields } = parseApiError(err);
      if (fields) setFieldErrors(fields);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const form = toForm(config);

  return (
    <ConfigCardShell
      title="Notification Email"
      description="ผู้รับอีเมลแจ้งเตือนภายใน (รายงาน / การแจ้งเตือนระดับหน่วยธุรกิจ)"
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    >
        <div className="space-y-2">
          <Label htmlFor="notification-email-enabled">Sending</Label>
          {isEditing ? (
            <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
              <input
                id="notification-email-enabled"
                type="checkbox"
                className="h-4 w-4"
                checked={formData.enabled}
                disabled={saving}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              ส่งอีเมลแจ้งเตือนภายใน
            </label>
          ) : (
            <ReadOnlyText value={form.enabled ? 'เปิด' : 'ปิด'} />
          )}
          <p className="text-xs text-muted-foreground">
            ปิดไว้ = ไม่ส่งอีเมลแจ้งเตือนภายในเลย (เดิมคือ env <code className="font-mono">SMTP_ENABLED</code>)
            · ไม่กระทบอีเมลของระบบอย่างลิงก์สมัครหรือตั้งรหัสผ่านใหม่ ซึ่งส่งเสมอ
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-email-recipients">Recipients</Label>
          {isEditing ? (
            <>
              <Input
                id="notification-email-recipients"
                value={formData.recipients}
                onChange={(e) => handleChange('recipients', e.target.value)}
                onBlur={() => handleBlur('recipients')}
                className={fieldErrors.recipients ? 'border-destructive' : ''}
                placeholder="ops@example.com, finance@example.com"
              />
              {fieldErrors.recipients && (
                <p className="text-xs text-destructive">{fieldErrors.recipients}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={form.recipients} />
          )}
          <p className="text-xs text-muted-foreground">
            คั่นหลายอีเมลด้วยจุลภาค เว้นว่างไว้เพื่อให้ส่งถึงผู้รับที่การแจ้งเตือนแต่ละใบคำนวณเองจาก
            อีเมลของผู้ใช้ปลายทาง
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-email-cc">CC</Label>
          {isEditing ? (
            <>
              <Input
                id="notification-email-cc"
                value={formData.cc}
                onChange={(e) => handleChange('cc', e.target.value)}
                onBlur={() => handleBlur('cc')}
                className={fieldErrors.cc ? 'border-destructive' : ''}
                placeholder="audit@example.com"
              />
              {fieldErrors.cc && <p className="text-xs text-destructive">{fieldErrors.cc}</p>}
            </>
          ) : (
            <ReadOnlyText value={form.cc} />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-email-subject-prefix">Subject prefix</Label>
          {isEditing ? (
            <>
              <Input
                id="notification-email-subject-prefix"
                value={formData.subject_prefix}
                onChange={(e) => handleChange('subject_prefix', e.target.value)}
                onBlur={() => handleBlur('subject_prefix')}
                className={fieldErrors.subject_prefix ? 'border-destructive' : ''}
                placeholder="[Carmen]"
              />
              {fieldErrors.subject_prefix && (
                <p className="text-xs text-destructive">{fieldErrors.subject_prefix}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={form.subject_prefix} />
          )}
          <p className="text-xs text-muted-foreground">
            ข้อความที่เติมหน้าหัวเรื่องอีเมล เว้นว่างไว้ = ไม่เติมอะไร · ค่า SMTP (host / ผู้ใช้ /
            รหัสผ่าน) ไม่ได้อยู่ที่นี่ — ตั้งที่หน้า Email Setting
          </p>
        </div>

        <AuditMeta
          variant="compact"
          actor={normalizeAudit(config).updated ?? normalizeAudit(config).created}
        />
    </ConfigCardShell>
  );
};
