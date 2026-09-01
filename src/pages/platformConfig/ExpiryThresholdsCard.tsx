import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import type { ExpiryThresholdsConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface ExpiryThresholdsCardProps {
  config: PlatformConfig | null;
  /**
   * ต้องเป็น `platform_config.manage` **เฉย ๆ** ไม่ต้องบวก `license.manage` เหมือน
   * `LicenseEnforcementCard` ที่อยู่ในหัวข้อเดียวกัน — คีย์นี้ไม่มีด่านที่สองใน
   * `platform_configs.controller.ts` → `mayWriteKey` การลอก `canManageLicense` มาใช้จะซ่อน
   * ปุ่ม Edit จากผู้ที่มีสิทธิ์เขียนจริง
   */
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล */
  footer?: React.ReactNode;
}

interface ThresholdsFormData {
  subscription_days: string;
  bu_quota_days: string;
  seat_days: string;
}

/**
 * ต้องเท่ากับ default ของ registry ฝั่ง backend (`expiry_thresholds` ใน micro-cluster) และเท่ากับ
 * `DEFAULT_EXPIRY_THRESHOLDS` ของ context — สามที่ต้องตรงกันเสมอ
 * Must equal the backend registry defaults and the context's own defaults.
 */
const DEFAULTS: ExpiryThresholdsConfig = {
  subscription_days: 30,
  bu_quota_days: 30,
  seat_days: 30,
};

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม
 * @param config - แถว config ที่หน้าเพจ fetch มา / The fetched config row
 * @returns ค่าฟอร์มเป็นสตริง (ค่าใน `<Input>`) / Form values as strings
 */
const toForm = (config: PlatformConfig | null): ThresholdsFormData => {
  const value = (config?.value ?? {}) as Partial<ExpiryThresholdsConfig>;
  const pick = (k: keyof ExpiryThresholdsConfig): string =>
    String(typeof value[k] === 'number' ? value[k] : DEFAULTS[k]);
  return {
    subscription_days: pick('subscription_days'),
    bu_quota_days: pick('bu_quota_days'),
    seat_days: pick('seat_days'),
  };
};

/**
 * การ์ดตั้งเกณฑ์ "ใกล้หมดอายุ" แยกตามชนิดใบ
 *
 * ต่างจาก `LicenseEnforcementCard` ที่อยู่ในหัวข้อเดียวกันตรงที่มันเป็น **เกณฑ์แสดงผล** ไม่ใช่
 * ตัวบังคับใช้ — เพิ่มค่าแล้วป้ายเตือนขึ้นเร็วขึ้นเท่านั้น ไม่มีใครถูกบล็อกเพิ่มหรือลด จึงไม่มี
 * ConfirmDialog และ gate ด้วย `platform_config.manage` เฉย ๆ
 */
export const ExpiryThresholdsCard: React.FC<ExpiryThresholdsCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const { refresh } = useExpiryThresholds();
  const [formData, setFormData] = useState<ThresholdsFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * backend เป็น `z.number().int().positive().max(365)` — ตรวจ max ที่นี่ด้วยได้ ต่างจากการ์ด
   * rate limits ที่ backend เป็น `positive()` เปล่า ๆ ซึ่งคอมเมนต์ในไฟล์นั้นห้ามใส่ max ฝั่ง FE ไว้
   * The backend caps at 365 here, unlike the rate-limit card whose backend has no ceiling.
   */
  const validate = (value: string): string => {
    if (!value.trim()) return t('pages.platformConfig.daysRequired');
    const n = Number(value);
    // ใช้คีย์ `daysRange` เดิมที่การ์ด Invitation ใช้อยู่ ("จำนวนเต็ม 1–365") แทนการเพิ่มคีย์ใหม่ —
    // ขอบเขตเหมือนกันเป๊ะเพราะ backend เป็น `.int().positive().max(365)` ทั้งสองคีย์
    // Reuses the existing daysRange copy: the bound is identical on both keys.
    if (!Number.isInteger(n) || n < 1 || n > 365) return t('pages.platformConfig.daysRange');
    return '';
  };

  const handleChange = (name: keyof ThresholdsFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof ThresholdsFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      subscription_days: validate(formData.subscription_days),
      bu_quota_days: validate(formData.bu_quota_days),
      seat_days: validate(formData.seat_days),
    };
    if (errors.subscription_days || errors.bu_quota_days || errors.seat_days) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // patch ไม่ใช่ update: วันที่คีย์นี้มีฟิลด์ที่สี่ การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะได้ 422
      await platformConfigService.patch('expiry_thresholds', {
        subscription_days: Number(formData.subscription_days),
        bu_quota_days: Number(formData.bu_quota_days),
        seat_days: Number(formData.seat_days),
      });
      toast.success(t('pages.platformConfig.savedThresholdsToast'));
      // ให้ป้ายในหน้า /licenses และ /clusters สะท้อนค่าใหม่โดยไม่ต้องรีโหลดทั้งแอป — ถ้าไม่เรียก
      // ผู้ดูแลจะบันทึกเสร็จแล้วเปิดหน้ารายการไปเจอเกณฑ์เดิม แล้วคิดว่าบันทึกไม่ติด
      // Without this the operator saves, opens a list, sees the old window and assumes it failed.
      await refresh();
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
      title={t('pages.platformConfig.expiryThresholdsTitle')}
      description={t('pages.platformConfig.expiryThresholdsDescription')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
      note={
        // ต้องอ่านได้ตลอด ไม่ใช่แค่ตอนแก้ — "เพิ่มค่านี้แล้วใครถูกบล็อกไหม" คือคำถามแรกที่ทุกคนถาม
        // โดยเฉพาะเมื่อการ์ดนี้อยู่ในหัวข้อเดียวกับสวิตช์บังคับใช้ license
        <p className="text-xs text-muted-foreground">
          {t('pages.platformConfig.thresholdsNote1')}
        </p>
      }
    >
      <ConfigField
        label={t('pages.platformConfig.subscriptionDays')}
        htmlFor="expiry-subscription-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.subscription_days })}
        error={fieldErrors.subscription_days}
      >
        <Input
          id="expiry-subscription-days"
          type="number"
          min={1}
          max={365}
          value={formData.subscription_days}
          onChange={(e) => handleChange('subscription_days', e.target.value)}
          onBlur={() => handleBlur('subscription_days')}
          className={fieldErrors.subscription_days ? 'border-destructive' : ''}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.buQuotaDays')}
        htmlFor="expiry-bu-quota-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.bu_quota_days })}
        error={fieldErrors.bu_quota_days}
      >
        <Input
          id="expiry-bu-quota-days"
          type="number"
          min={1}
          max={365}
          value={formData.bu_quota_days}
          onChange={(e) => handleChange('bu_quota_days', e.target.value)}
          onBlur={() => handleBlur('bu_quota_days')}
          className={fieldErrors.bu_quota_days ? 'border-destructive' : ''}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.seatDays')}
        htmlFor="expiry-seat-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.seat_days })}
        error={fieldErrors.seat_days}
      >
        <Input
          id="expiry-seat-days"
          type="number"
          min={1}
          max={365}
          value={formData.seat_days}
          onChange={(e) => handleChange('seat_days', e.target.value)}
          onBlur={() => handleBlur('seat_days')}
          className={fieldErrors.seat_days ? 'border-destructive' : ''}
        />
      </ConfigField>
    </ConfigCardShell>
  );
};
