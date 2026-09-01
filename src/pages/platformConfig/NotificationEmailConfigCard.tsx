import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { NotificationEmailConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface NotificationEmailConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล เหมือนการ์ดอื่นทุกใบ */
  footer?: React.ReactNode;
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
  footer,
}) => {
  const { t } = useI18n();
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
      return value.length > 64 ? t('pages.platformConfig.tooLong64') : '';
    }
    const bad = splitCsv(value).filter((e) => !EMAIL_PATTERN.test(e));
    return bad.length > 0 ? t('pages.platformConfig.invalidEmails', { list: bad.join(', ') }) : '';
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
      toast.success(t('pages.platformConfig.savedNotificationToast'));
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
      title={t('pages.platformConfig.notificationTitle')}
      description={t('pages.platformConfig.notificationDescription')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
    >
      <ConfigField
        label={t('pages.platformConfig.sending')}
        htmlFor="notification-email-enabled"
        isEditing={isEditing}
        value={
          <Badge variant={form.enabled ? 'success' : 'secondary'}>
            {form.enabled ? t('pages.platformConfig.on') : t('pages.platformConfig.off')}
          </Badge>
        }
        hint={
          <>
            {t('pages.platformConfig.sendingHint1')} <code className="font-mono">SMTP_ENABLED</code>
            {t('pages.platformConfig.sendingHint2')}
          </>
        }
      >
        <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
          <input
            id="notification-email-enabled"
            type="checkbox"
            className="h-4 w-4"
            checked={formData.enabled}
            disabled={saving}
            onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          {t('pages.platformConfig.sendInternalEmail')}
        </label>
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.recipients')}
        htmlFor="notification-email-recipients"
        isEditing={isEditing}
        value={form.recipients}
        mono
        error={fieldErrors.recipients}
        hint={t('pages.platformConfig.recipientsHint')}
      >
        <Input
          id="notification-email-recipients"
          value={formData.recipients}
          onChange={(e) => handleChange('recipients', e.target.value)}
          onBlur={() => handleBlur('recipients')}
          className={fieldErrors.recipients ? 'border-destructive' : ''}
          placeholder={t('pages.platformConfig.recipientsPlaceholder')}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.cc')}
        htmlFor="notification-email-cc"
        isEditing={isEditing}
        value={form.cc}
        mono
        error={fieldErrors.cc}
      >
        <Input
          id="notification-email-cc"
          value={formData.cc}
          onChange={(e) => handleChange('cc', e.target.value)}
          onBlur={() => handleBlur('cc')}
          className={fieldErrors.cc ? 'border-destructive' : ''}
          placeholder={t('pages.platformConfig.ccPlaceholder')}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.subjectPrefix')}
        htmlFor="notification-email-subject-prefix"
        isEditing={isEditing}
        value={form.subject_prefix}
        mono
        error={fieldErrors.subject_prefix}
        hint={t('pages.platformConfig.subjectPrefixHint')}
      >
        <Input
          id="notification-email-subject-prefix"
          value={formData.subject_prefix}
          onChange={(e) => handleChange('subject_prefix', e.target.value)}
          onBlur={() => handleBlur('subject_prefix')}
          className={fieldErrors.subject_prefix ? 'border-destructive' : ''}
          placeholder="[Carmen]"
        />
      </ConfigField>
    </ConfigCardShell>
  );
};
