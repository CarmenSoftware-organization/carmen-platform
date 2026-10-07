import React, { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { GoogleSignInConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface GoogleSignInConfigCardProps {
  config: PlatformConfig | null;
  /** `platform_config.manage` อย่างเดียว — คีย์นี้ไม่มีด่านที่สองฝั่ง backend */
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  /** แถบ audit ท้ายการ์ด — หน้าเพจเป็นเจ้าของข้อมูล */
  footer?: React.ReactNode;
}

/** `=== true` ไม่ใช่ truthy — ตรงกับ GoogleSignInFlagService ฝั่ง gateway ที่ถือว่าค่าเพี้ยน = ปิด */
const toForm = (config: PlatformConfig | null): GoogleSignInConfig => {
  const value = (config?.value ?? {}) as Partial<GoogleSignInConfig>;
  return { platform: value.platform === true, app: value.app === true };
};

/**
 * สวิตช์ปุ่ม "Continue with Google" แยกต่อแอป — ปิดแล้ว gateway ซ่อนปุ่มและปฏิเสธ flow ด้วย
 * (redirect กลับ `/login?error=google_disabled`) ปุ่มจะขึ้นจริงก็ต่อเมื่อ gateway ตั้งค่า Google OAuth
 * ครบด้วย เปิดสวิตช์บน env ที่ยังไม่ตั้งจึงไม่มีผล
 */
export const GoogleSignInConfigCard: React.FC<GoogleSignInConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<GoogleSignInConfig>(() => toForm(config));
  const [saving, setSaving] = useState(false);
  const saved = toForm(config);

  const handleCancel = () => {
    setFormData(toForm(config));
    onCancelEdit();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await platformConfigService.patch('google_sign_in', {
        platform: formData.platform,
        app: formData.app,
      });
      toast.success(t('pages.platformConfig.googleSignInSavedToast'));
      await onSaved();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const stateBadge = (on: boolean) => (
    <Badge variant={on ? 'success' : 'secondary'}>
      {on ? t('pages.platformConfig.googleSignInOn') : t('pages.platformConfig.googleSignInOff')}
    </Badge>
  );

  const field = (target: keyof GoogleSignInConfig, label: string, hint: string) => (
    <ConfigField
      label={label}
      htmlFor={`google-sign-in-${target}`}
      isEditing={isEditing}
      value={stateBadge(saved[target])}
      badge={isEditing ? stateBadge(saved[target]) : undefined}
      hint={hint}
    >
      <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
        <input
          id={`google-sign-in-${target}`}
          type="checkbox"
          className="h-4 w-4"
          checked={formData[target]}
          disabled={saving}
          onChange={(e) => setFormData({ ...formData, [target]: e.target.checked })}
        />
        {t('pages.platformConfig.googleSignInCheckbox')}
      </label>
    </ConfigField>
  );

  return (
    <ConfigCardShell
      title={t('pages.platformConfig.googleSignInTitle')}
      description={t('pages.platformConfig.googleSignInDesc')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
    >
      {field(
        'platform',
        t('pages.platformConfig.googleSignInPlatform'),
        t('pages.platformConfig.googleSignInPlatformHint'),
      )}
      {field('app', t('pages.platformConfig.googleSignInApp'), t('pages.platformConfig.googleSignInAppHint'))}
    </ConfigCardShell>
  );
};
