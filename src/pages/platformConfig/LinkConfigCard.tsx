import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { LinkConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface LinkConfigCardProps {
  /** คีย์ใน tb_platform_config เช่น `email_verification` หรือ `password_reset` */
  configKey: string;
  title: string;
  description: string;
  /** ตัวอย่าง URL ที่ถูกต้องของคีย์นี้ ใช้เป็น placeholder และในข้อความช่วย */
  urlExample: string;
  /** ค่าที่แสดงเมื่อยังไม่เคยบันทึก — ต้องเท่ากับ default ใน registry ฝั่ง backend */
  defaults: LinkConfig;
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล */
  footer?: React.ReactNode;
}

interface LinkFormData {
  base_url: string;
  expiry_hours: string;
}

/**
 * การ์ดของค่าตั้งที่มีรูปร่าง "ปลายทางลิงก์ + อายุลิงก์" — ใช้ร่วมกันหลายคีย์
 *
 * `email_verification` กับ `password_reset` มีฟิลด์เหมือนกันทุกประการ การเขียนการ์ดแยกสองใบจึงเป็น
 * การคัดลอกโค้ดเปล่า ๆ ส่วน `invitation` และ `signup` มีชื่อฟิลด์ของตัวเองจึงยังมีการ์ดเฉพาะ
 */
export const LinkConfigCard: React.FC<LinkConfigCardProps> = ({
  configKey,
  title,
  description,
  urlExample,
  defaults,
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  /**
   * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม — ค่าที่ backend คืนมาผ่าน Zod แล้วเสมอ
   * แต่ยังกันไว้ด้วย fallback เผื่อ backend เวอร์ชันเก่ายังไม่รู้จักคีย์นี้
   */
  const toForm = (row: PlatformConfig | null): LinkFormData => {
    const value = (row?.value ?? {}) as Partial<LinkConfig>;
    return {
      base_url: typeof value.base_url === 'string' ? value.base_url : defaults.base_url,
      expiry_hours: String(
        typeof value.expiry_hours === 'number' ? value.expiry_hours : defaults.expiry_hours,
      ),
    };
  };

  const [formData, setFormData] = useState<LinkFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * ตรวจฝั่ง FE เพื่อ UX เท่านั้น — backend ตัดสินสุดท้ายเสมอ
   * base URL ที่มี query string ติดมาแล้วถือว่าถูกต้อง เพราะ backend ประกอบ token ด้วย
   * searchParams.set() ไม่ใช่การต่อสตริง อย่าเพิ่มกฎห้าม query string ตรงนี้
   */
  const validate = (name: keyof LinkFormData, value: string): string => {
    if (name === 'base_url') {
      if (!value.trim()) return t('pages.platformConfig.baseUrlRequired');
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

  const handleChange = (name: keyof LinkFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof LinkFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(name, formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      base_url: validate('base_url', formData.base_url),
      expiry_hours: validate('expiry_hours', formData.expiry_hours),
    };
    if (errors.base_url || errors.expiry_hours) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // PATCH ไม่ใช่ PUT: หลัง backend PR #319 การส่งไม่ครบทุกฟิลด์ของ schema ตอบ 422
      // การ์ดนี้แสดงครบทั้ง 2 ฟิลด์ในวันนี้ แต่ PATCH ทำให้วันที่ backend เติมฟิลด์ที่ 3
      // เข้า schema การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะพังทันที
      await platformConfigService.patch(configKey, {
        base_url: formData.base_url.trim(),
        expiry_hours: Number(formData.expiry_hours),
      });
      toast.success(t('pages.platformConfig.savedToast', { title }));
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
      title={title}
      description={description}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
    >
      <ConfigField
        label={t('pages.platformConfig.baseUrl')}
        htmlFor={`${configKey}-base-url`}
        isEditing={isEditing}
        value={form.base_url}
        mono
        error={fieldErrors.base_url}
        hint={
          <>
            {t('pages.platformConfig.baseUrlHint1')} <code className="font-mono">?token=…</code>{' '}
            {t('pages.platformConfig.baseUrlHint2')} <code className="font-mono">{urlExample}</code>
          </>
        }
      >
        <Input
          id={`${configKey}-base-url`}
          value={formData.base_url}
          onChange={(e) => handleChange('base_url', e.target.value)}
          onBlur={() => handleBlur('base_url')}
          className={fieldErrors.base_url ? 'border-destructive' : ''}
          placeholder={urlExample}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.expiryHours')}
        htmlFor={`${configKey}-expiry-hours`}
        isEditing={isEditing}
        value={t('pages.platformConfig.hoursValue', { count: form.expiry_hours })}
        error={fieldErrors.expiry_hours}
      >
        <Input
          id={`${configKey}-expiry-hours`}
          type="number"
          min={1}
          max={720}
          value={formData.expiry_hours}
          onChange={(e) => handleChange('expiry_hours', e.target.value)}
          onBlur={() => handleBlur('expiry_hours')}
          className={fieldErrors.expiry_hours ? 'border-destructive' : ''}
        />
      </ConfigField>
    </ConfigCardShell>
  );
};
