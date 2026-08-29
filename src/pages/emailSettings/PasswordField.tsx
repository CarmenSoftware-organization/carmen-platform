import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useI18n } from '../../hooks/useI18n';

interface PasswordFieldProps {
  /** true เมื่อโปรไฟล์ที่บันทึกไว้มีรหัสผ่านอยู่ */
  hasStoredPassword: boolean;
  /** true เมื่อกำลังสร้างโปรไฟล์ใหม่ — ไม่มีสถานะ idle ให้กลับไป */
  isNew: boolean;
  /**
   * ค่าที่จะส่งไป backend: string = ตั้งค่าใหม่, undefined = ไม่เปลี่ยน
   * จงใจไม่รองรับ null/'' เพื่อให้ "ล้างรหัสผ่านโดยอุบัติเหตุ" เป็นสิ่งที่พิมพ์ไม่ออก
   */
  onChange: (value: string | undefined) => void;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  hasStoredPassword,
  isNew,
  onChange,
}) => {
  const { t } = useI18n();
  const [editing, setEditing] = useState(isNew);
  const [value, setValue] = useState('');

  const startEditing = () => {
    setEditing(true);
    setValue('');
    onChange(undefined);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue('');
    onChange(undefined);
  };

  const handleInput = (next: string) => {
    setValue(next);
    onChange(next === '' ? undefined : next);
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <Label>{t('pages.emailSettings.smtpPassword')}</Label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {hasStoredPassword ? t('pages.emailSettings.passwordSet') : t('pages.emailSettings.passwordNotSet')}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            {hasStoredPassword ? t('pages.emailSettings.changePassword') : t('pages.emailSettings.setPassword')}
          </Button>
        </div>
        {!hasStoredPassword && (
          <p className="text-xs text-muted-foreground">
            {t('pages.emailSettings.noAuthNote')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="smtp_password">{t('pages.emailSettings.smtpPassword')}</Label>
      <div className="flex items-center gap-3">
        <Input
          id="smtp_password"
          type="password"
          autoComplete="new-password"
          aria-label={t('pages.emailSettings.smtpPasswordAria')}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
        />
        {!isNew && (
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
      {!isNew && <p className="text-xs text-muted-foreground">{t('pages.emailSettings.keepPasswordHint')}</p>}
      <p className="text-xs text-muted-foreground">
        {t('pages.emailSettings.cannotRemovePasswordHint')}
      </p>
    </div>
  );
};
