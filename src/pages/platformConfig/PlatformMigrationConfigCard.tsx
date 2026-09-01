import React, { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { PlatformMigrationConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface PlatformMigrationConfigCardProps {
  config: PlatformConfig | null;
  /**
   * ต้องเป็น **super-admin** ไม่ใช่แค่ `platform_config.manage` — backend มีด่านที่สองเฉพาะคีย์นี้
   * (`platform_configs.controller.ts` → `writeKeyDenial`) ซึ่งไม่รับสิทธิ์ใด ๆ แทน ต่างจากคีย์
   * `license` ที่ยอมรับ `license.manage` ส่ง canManage ที่ผ่อนกว่านี้มาจะได้ปุ่ม Edit ที่กด Save
   * แล้ว 403 เสมอ
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
 * `=== true` ไม่ใช่ truthy ให้ตรงกับ PlatformMigrationGuard ที่ถือว่า "ค่าที่เพี้ยน = ปิด"
 * ถ้าที่นี่ผ่อนกว่านั้น หน้าจอจะบอกว่าเปิดอยู่ทั้งที่ทุกคำขอยัง 403
 */
const toForm = (config: PlatformConfig | null): PlatformMigrationConfig => {
  const value = (config?.value ?? {}) as Partial<PlatformMigrationConfig>;
  return { api_enabled: value.api_enabled === true };
};

/**
 * การ์ดสวิตช์เปิด/ปิด API migration ของฐานข้อมูลแพลตฟอร์ม
 *
 * ค่านี้เคยเป็น env `PLATFORM_MIGRATION_API_ENABLED` ของ backend-gateway การย้ายมาที่นี่แลก
 * ความจริงข้อหนึ่งไป: การเปิดไม่ต้องใช้สิทธิ์เข้าเครื่องอีกแล้ว จึงกันไว้สองชั้น — เขียนได้เฉพาะ
 * super-admin (ทั้งที่นี่และที่ backend) และขาเปิดมี ConfirmDialog ส่วนขาปิดไม่มี เพราะการปิดคือ
 * ทางกลับที่ปลอดภัยเสมอและเป็นสิ่งที่คนจะรีบทำตอนมีอะไรพัง
 *
 * สิ่งที่อยู่หลังสวิตช์คือ `/api-system/platform/migrations/*` ซึ่งรัน `prisma migrate deploy`
 * บนฐานข้อมูลกลางของทุก cluster ไม่ใช่ของ BU ใด BU หนึ่ง
 *
 * guard ฝั่ง backend cache ค่าไว้ 60 วินาที การสลับสวิตช์จึงมีผลภายในหนึ่งนาที ไม่ใช่ทันที
 */
export const PlatformMigrationConfigCard: React.FC<PlatformMigrationConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<PlatformMigrationConfig>(() => toForm(config));
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
      // PATCH ไม่ใช่ PUT ด้วยเหตุผลเดียวกับการ์ดอื่นในหน้านี้: วันที่ schema ของคีย์นี้มีฟิลด์ที่สอง
      // การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะได้ 422 ทันที
      await platformConfigService.patch('platform_migration', {
        api_enabled: formData.api_enabled,
      });
      toast.success(
        formData.api_enabled
          ? t('pages.platformConfig.migrationApiEnabledToast')
          : t('pages.platformConfig.migrationApiDisabledToast'),
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
    if (formData.api_enabled && !saved.api_enabled) {
      setConfirmOpen(true);
      return;
    }
    await persist();
  };

  return (
    <>
      <ConfigCardShell
        title={t('pages.platformConfig.migrationTitle')}
        description={
          <>
            {t('pages.platformConfig.migrationDesc1')}{' '}
            <code className="font-mono">/api-system/platform/migrations</code>
            {t('pages.platformConfig.migrationDesc2')}
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
          // ต้องอ่านได้ตลอด ไม่ใช่แค่ตอนแก้: หน่วงหนึ่งนาทีคือคำอธิบายของ "เปิดแล้วทำไมยัง 403"
          // ซึ่งไม่งั้นจะถูกเข้าใจว่าเป็นบั๊ก
          <p className="text-xs text-muted-foreground">
            {t('pages.platformConfig.migrationNoteCache')}
          </p>
        }
      >
        <ConfigField
          label={t('pages.platformConfig.migrationApi')}
          htmlFor="platform-migration-api-enabled"
          isEditing={isEditing}
          value={
            <Badge variant={saved.api_enabled ? 'success' : 'secondary'}>
              {saved.api_enabled
                ? t('pages.platformConfig.migrationApiOn')
                : t('pages.platformConfig.migrationApiOff')}
            </Badge>
          }
          badge={
            isEditing ? (
              <Badge variant={saved.api_enabled ? 'success' : 'secondary'}>
                {saved.api_enabled
                  ? t('pages.platformConfig.migrationApiOn')
                  : t('pages.platformConfig.migrationApiOff')}
              </Badge>
            ) : undefined
          }
          hint={
            <>
              <strong>{t('pages.platformConfig.migrationHintOffStrong')}</strong>{' '}
              {t('pages.platformConfig.migrationHintOff')}{' '}
              <strong>{t('pages.platformConfig.migrationHintOnStrong')}</strong>{' '}
              {t('pages.platformConfig.migrationHintOn')}
            </>
          }
        >
          <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
            <input
              id="platform-migration-api-enabled"
              type="checkbox"
              className="h-4 w-4"
              checked={formData.api_enabled}
              disabled={saving}
              onChange={(e) => setFormData({ api_enabled: e.target.checked })}
            />
            {t('pages.platformConfig.migrationCheckbox')}
          </label>
        </ConfigField>
      </ConfigCardShell>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('pages.platformConfig.migrationConfirmTitle')}
        description={t('pages.platformConfig.migrationConfirmDescription')}
        confirmText={t('pages.platformConfig.migrationConfirmAction')}
        confirmVariant="destructive"
        onConfirm={persist}
      />
    </>
  );
};

export default PlatformMigrationConfigCard;
