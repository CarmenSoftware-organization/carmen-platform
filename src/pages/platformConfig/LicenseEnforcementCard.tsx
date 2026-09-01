import React, { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { LicenseConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface LicenseEnforcementCardProps {
  config: PlatformConfig | null;
  /**
   * ต้องเป็น `platform_config.manage` **และ** `license.manage` รวมกันมาแล้ว — backend มีด่านที่สอง
   * เฉพาะคีย์นี้ (`platform_configs.controller.ts` → `mayWriteKey`) ส่งแค่ `platform_config.manage`
   * มาจะได้ปุ่ม Edit ที่กด Save แล้ว 403 เสมอ
   */
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล */
  footer?: React.ReactNode;
}

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม
 *
 * `=== true` ไม่ใช่ truthy โดยตั้งใจ ให้ตรงกับผู้อ่านฝั่ง backend ทั้งสองตัวที่ถือว่า
 * "ค่าที่เพี้ยน = ปิด" — ถ้าที่นี่ผ่อนกว่านั้น หน้าจอจะบอกว่าเปิดอยู่ทั้งที่ระบบไม่ได้บังคับใช้
 */
const toForm = (config: PlatformConfig | null): LicenseConfig => {
  const value = (config?.value ?? {}) as Partial<LicenseConfig>;
  return { enforcement_enabled: value.enforcement_enabled === true };
};

/**
 * การ์ดสวิตช์บังคับใช้ licensing
 *
 * ต่างจากการ์ดอื่นในหน้านี้ตรงที่มันไม่ใช่ "ค่าตั้ง" แต่เป็น **kill switch ของทั้งผลิตภัณฑ์** —
 * เปิดแล้วหน่วยธุรกิจที่ไม่มีสัญญาครอบคลุมจะได้ 403 ทันทีทุกเส้นทางของ inventory app และการเชิญ
 * ผู้ใช้จะถูกจำกัดด้วยเพดานที่นั่ง การเปิดจึงมี ConfirmDialog ส่วนการปิดไม่มี เพราะการปิดคือทางกลับ
 * ที่ปลอดภัยเสมอ และเป็นสิ่งที่คนจะรีบทำตอนมีอะไรพัง — อย่าใส่ขั้นตอนขวางมัน
 *
 * ขอบเขตที่ถูกบังคับใช้คือ `/api/:bu_code/*` และ `/api/config/:bu_code/*` เท่านั้น —
 * `/api-system/*` ที่หน้าจอนี้ใช้อยู่ไม่อยู่ในขอบเขต การเปิดสวิตช์จึงไม่ทำให้หน้า admin ล็อกตัวเอง
 */
export const LicenseEnforcementCard: React.FC<LicenseEnforcementCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<LicenseConfig>(() => toForm(config));
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const saved = toForm(config);

  const handleCancel = () => {
    setFormData(toForm(config));
    onCancelEdit();
  };

  const persist = async () => {
    try {
      setSaving(true);
      // PATCH ไม่ใช่ PUT ด้วยเหตุผลเดียวกับการ์ดอื่น: วันที่ schema ของคีย์นี้มีฟิลด์ที่สอง
      // การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะได้ 422 ทันที
      await platformConfigService.patch('license', {
        enforcement_enabled: formData.enforcement_enabled,
      });
      toast.success(
        formData.enforcement_enabled
          ? t('pages.platformConfig.enforcementEnabledToast')
          : t('pages.platformConfig.enforcementDisabledToast'),
      );
      await onSaved();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // ถามซ้ำเฉพาะขาเปิด และเฉพาะเมื่อค่าที่บันทึกไว้ยังไม่ได้เปิดอยู่แล้ว — กด Save ซ้ำโดยไม่ได้
    // เปลี่ยนอะไรไม่ควรเจอกล่องยืนยัน
    if (formData.enforcement_enabled && !saved.enforcement_enabled) {
      setConfirmOpen(true);
      return;
    }
    await persist();
  };

  return (
    <>
      <ConfigCardShell
        title={t('pages.platformConfig.licenseTitle')}
        description={
          <>
            {t('pages.platformConfig.licenseDesc1')}{' '}
            <code className="font-mono">license.manage</code>{' '}
            {t('pages.platformConfig.licenseDesc2')}{' '}
            <code className="font-mono">platform_config.manage</code>
            {t('pages.platformConfig.licenseDesc3')}
          </>
        }
        canManage={canManage}
        isEditing={isEditing}
        saving={saving}
        onRequestEdit={onRequestEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        footer={footer}
        note={
          // ขอบเขตของสวิตช์ต้องอ่านได้ตลอด ไม่ใช่แค่ตอนแก้ — มันคือคำตอบของ
          // "เปิดแล้วหน้าจอ admin จะล็อกตัวเองไหม" ซึ่งเป็นคำถามแรกที่ทุกคนถาม
          <p className="text-xs text-muted-foreground">
            {t('pages.platformConfig.licenseNote6')}
            <code className="font-mono">/api/:bu_code/…</code>
            {t('pages.platformConfig.licenseNote7')}
          </p>
        }
      >
        <ConfigField
          label={t('pages.platformConfig.enforcement')}
          htmlFor="license-enforcement-enabled"
          isEditing={isEditing}
          value={
            <Badge variant={saved.enforcement_enabled ? 'success' : 'secondary'}>
              {saved.enforcement_enabled
                ? t('pages.platformConfig.enforced')
                : t('pages.platformConfig.shadowMode')}
            </Badge>
          }
          badge={
            isEditing ? (
              <Badge variant={saved.enforcement_enabled ? 'success' : 'secondary'}>
                {saved.enforcement_enabled
                  ? t('pages.platformConfig.enforced')
                  : t('pages.platformConfig.shadowMode')}
              </Badge>
            ) : undefined
          }
          hint={
            <>
              <strong>{t('pages.platformConfig.licenseNote1Strong')}</strong>{' '}
              {t('pages.platformConfig.licenseNote1')}{' '}
              <code className="font-mono">LICENSE shadow-mode</code>{' '}
              {t('pages.platformConfig.licenseNote2')}{' '}
              <strong>{t('pages.platformConfig.licenseNote2Strong')}</strong>{' '}
              {t('pages.platformConfig.licenseNote3')}{' '}
              <code className="font-mono">403 LICENSE_REQUIRED</code>{' '}
              {t('pages.platformConfig.licenseNote4')}{' '}
              (<code className="font-mono">LICENSE_EXPIRED</code>){' '}
              {t('pages.platformConfig.licenseNote5')}{' '}
              <code className="font-mono">403 SEAT_LIMIT_REACHED</code>
            </>
          }
        >
          <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
            <input
              id="license-enforcement-enabled"
              type="checkbox"
              className="h-4 w-4"
              checked={formData.enforcement_enabled}
              disabled={saving}
              onChange={(e) => setFormData({ enforcement_enabled: e.target.checked })}
            />
            {t('pages.platformConfig.enforceCheckbox')}
          </label>
        </ConfigField>
      </ConfigCardShell>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('pages.platformConfig.confirmEnableTitle')}
        description={t('pages.platformConfig.confirmEnableDescription')}
        confirmText={t('pages.platformConfig.confirmEnableAction')}
        confirmVariant="destructive"
        onConfirm={persist}
      />
    </>
  );
};
