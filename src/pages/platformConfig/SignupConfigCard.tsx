import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { PlatformConfig, SignupConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface SignupConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล */
  footer?: React.ReactNode;
}

interface SignupFormData {
  verify_base_url: string;
  link_expiry_hours: string;
}

const DEFAULTS: SignupConfig = {
  verify_base_url: 'http://localhost:3000/register/verify',
  link_expiry_hours: 24,
};

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม — ค่าที่ backend คืนมาผ่าน Zod แล้วเสมอ
 * แต่ยังกันไว้ด้วย fallback เผื่อ backend เวอร์ชันเก่ายังไม่รู้จักคีย์นี้
 */
const toForm = (config: PlatformConfig | null): SignupFormData => {
  const value = (config?.value ?? {}) as Partial<SignupConfig>;
  return {
    verify_base_url:
      typeof value.verify_base_url === 'string'
        ? value.verify_base_url
        : DEFAULTS.verify_base_url,
    link_expiry_hours: String(
      typeof value.link_expiry_hours === 'number'
        ? value.link_expiry_hours
        : DEFAULTS.link_expiry_hours,
    ),
  };
};

export const SignupConfigCard: React.FC<SignupConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<SignupFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * ตรวจ URL ฝั่ง FE เพื่อ UX เท่านั้น — backend ตัดสินสุดท้ายด้วย z.string().url() เสมอ
   * base URL ที่มี query string ติดมาแล้วถือว่าถูกต้อง เพราะ backend ประกอบ token ด้วย
   * searchParams.set() ไม่ใช่การต่อสตริง อย่าเพิ่มกฎห้าม query string ตรงนี้
   */
  const validate = (name: keyof SignupFormData, value: string): string => {
    if (name === 'verify_base_url') {
      if (!value.trim()) return t('pages.platformConfig.verifyUrlRequired');
      try {
        new URL(value);
        return '';
      } catch {
        return t('pages.platformConfig.urlInvalid');
      }
    }
    const n = Number(value);
    if (!value.trim()) return t('pages.platformConfig.hoursRequired');
    if (!Number.isInteger(n) || n < 1 || n > 720) return t('pages.platformConfig.hoursRange');
    return '';
  };

  const handleChange = (name: keyof SignupFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof SignupFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(name, formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      verify_base_url: validate('verify_base_url', formData.verify_base_url),
      link_expiry_hours: validate('link_expiry_hours', formData.link_expiry_hours),
    };
    if (errors.verify_base_url || errors.link_expiry_hours) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // PATCH ไม่ใช่ PUT: หลัง backend PR #319 การส่งไม่ครบทุกฟิลด์ของ schema ตอบ 422
      // การ์ดนี้แสดงครบทั้ง 2 ฟิลด์ในวันนี้ แต่ PATCH ทำให้วันที่ backend เติมฟิลด์ที่ 3
      // เข้า schema การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะพังทันที
      await platformConfigService.patch('signup', {
        verify_base_url: formData.verify_base_url.trim(),
        link_expiry_hours: Number(formData.link_expiry_hours),
      });
      toast.success(t('pages.platformConfig.savedSignupToast'));
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
      title={t('pages.platformConfig.signupTitle')}
      description={t('pages.platformConfig.signupDescription')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
    >
      <ConfigField
        label={t('pages.platformConfig.verifyUrl')}
        htmlFor="signup-verify-base-url"
        isEditing={isEditing}
        value={form.verify_base_url}
        mono
        error={fieldErrors.verify_base_url}
        hint={
          <>
            {t('pages.platformConfig.signupHint1')} <code className="font-mono">?token=…</code>{' '}
            {t('pages.platformConfig.signupHint2')}{' '}
            <code className="font-mono">https://inventory.example.com/register/verify</code>.
          </>
        }
      >
        <Input
          id="signup-verify-base-url"
          value={formData.verify_base_url}
          onChange={(e) => handleChange('verify_base_url', e.target.value)}
          onBlur={() => handleBlur('verify_base_url')}
          className={fieldErrors.verify_base_url ? 'border-destructive' : ''}
          placeholder={t('pages.platformConfig.signupUrlPlaceholder')}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.expiryHours')}
        htmlFor="signup-link-expiry-hours"
        isEditing={isEditing}
        value={t('pages.platformConfig.hoursValue', { count: form.link_expiry_hours })}
        error={fieldErrors.link_expiry_hours}
      >
        <Input
          id="signup-link-expiry-hours"
          type="number"
          min={1}
          max={720}
          value={formData.link_expiry_hours}
          onChange={(e) => handleChange('link_expiry_hours', e.target.value)}
          onBlur={() => handleBlur('link_expiry_hours')}
          className={fieldErrors.link_expiry_hours ? 'border-destructive' : ''}
        />
      </ConfigField>
    </ConfigCardShell>
  );
};
