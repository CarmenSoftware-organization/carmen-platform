import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Send, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { PasswordField } from './PasswordField';
import { TestEmailDialog } from './TestEmailDialog';
import emailSettingService from '../../services/emailSettingService';
import { parseApiError } from '../../utils/errorParser';
import { validateField } from '../../utils/validation';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import type { EmailSenderPurpose, EmailSetting } from '../../types';

interface EmailSettingCardProps {
  purpose: EmailSenderPurpose;
  label: string;
  description: string;
  inUse: boolean;
  setting: EmailSetting | null;
  canManage: boolean;
  isEditing: boolean;
  callerIdentity?: string;
  /**
   * false เมื่อหน้ามี dialog ทับอยู่เหนือการ์ดนี้ (เช่น prompt ยืนยันทิ้งการแก้ไข) —
   * ปิดคีย์ลัดของการ์ดชั่วคราวเพื่อไม่ให้ Escape ของ dialog ไปโดน onCancel ของการ์ดด้วย
   * ค่าเริ่มต้น true เพื่อไม่กระทบพฤติกรรมเดิมเมื่อไม่มี dialog ใดทับอยู่
   */
  shortcutsEnabled?: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  /** keepEditing = true เมื่อเจอ 409 — หน้าต้อง refetch แต่ไม่ปิดโหมดแก้ */
  onSaved: (opts?: { keepEditing?: boolean }) => void;
}

interface EmailSettingFormData {
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_username: string;
  is_active: boolean;
  note: string;
}

const emptyForm: EmailSettingFormData = {
  from_email: '',
  from_name: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: false,
  smtp_username: '',
  is_active: true,
  note: '',
};

const toForm = (s: EmailSetting | null): EmailSettingFormData =>
  s
    ? {
        from_email: s.from_email ?? '',
        from_name: s.from_name ?? '',
        smtp_host: s.smtp_host ?? '',
        smtp_port: String(s.smtp_port ?? 587),
        smtp_secure: !!s.smtp_secure,
        smtp_username: s.smtp_username ?? '',
        is_active: s.is_active !== false,
        note: s.note ?? '',
      }
    : { ...emptyForm };

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);

export const EmailSettingCard: React.FC<EmailSettingCardProps> = ({
  purpose,
  label,
  description,
  inUse,
  setting,
  canManage,
  isEditing,
  callerIdentity = '',
  shortcutsEnabled = true,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const isNew = setting === null;
  const [formData, setFormData] = useState<EmailSettingFormData>(() => toForm(setting));
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmUnset, setConfirmUnset] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  // การ์ดไม่ unmount เมื่อออกจากโหมดแก้ไข (มีแค่ isEditing เปลี่ยน) ต่างจาก PasswordField
  // ที่ unmount ทุกครั้ง — ถ้าไม่ resync ที่นี่ draft เก่า (รวมรหัสผ่านที่พิมพ์ไว้) จะค้างอยู่ใน
  // state ของการ์ดเงียบ ๆ แล้วถูกส่งไป backend ตอน save ครั้งถัดไปโดยที่ UI ไม่ได้บอกอะไรเลย
  // (ดู F1/F3 ใน final-fix-report.md). จุดนี้เป็นจุด reset เดียวของการออกจากโหมดแก้ไข —
  // ครอบคลุมทั้ง Cancel ปกติและ "ทิ้งการแก้ไข" ที่หน้าสั่งเปลี่ยน editingPurpose ตรง ๆ
  // โดยไม่ผ่าน handleCancel ของการ์ดนี้เลย
  //
  // deps: [isEditing, setting] — ทั้งคู่จำเป็น ไม่ suppress exhaustive-deps
  //
  // isEditing คือทริกเกอร์หลัก แต่ setting ต้องอยู่ด้วยเพราะ key ที่หน้าแม่ใช้ remount การ์ด คือ
  // `${purpose}-${setting?.doc_version ?? 'new'}` ซึ่ง **fail open**: `doc_version` เป็น optional
  // (`doc_version?: number` ตามกฎข้อ 11) ถ้าวันหนึ่ง backend อ่านกลับมาโดยไม่มีฟิลด์นี้ key จะกลาย
  // เป็นค่าคงที่ การ์ดจะไม่ remount แล้ว formData ที่ seed ไว้ตอน mount แรกจะค้าง — ส่วนแสดงผล
  // แบบอ่านอย่างเดียวโชว์ค่าใหม่ (อ่าน setting ตรง ๆ) แต่ฟอร์มแก้ไขโชว์ค่าเก่า และการบันทึกจะ
  // ทับงานของคนอื่นเงียบ ๆ
  //
  // การมี setting เป็น dep ปิดช่องนั้นโดยไม่พึ่งสมมติฐานเรื่อง backend ที่การ์ดตรวจเองไม่ได้
  // ส่วน guard `if (!isEditing)` ทำให้ effect ที่รันเพิ่มตอน fetchAll ของการ์ดอื่นเป็น no-op
  // จึงไม่ไปรบกวนคนที่กำลังพิมพ์อยู่ และไม่แตะเส้นทาง 409 ซึ่ง isEditing ยังเป็น true ตลอด
  useEffect(() => {
    if (!isEditing) {
      setFormData(toForm(setting));
      setPassword(undefined);
      setFieldErrors({});
    }
  }, [isEditing, setting]);

  const docVersion = useMemo(() => getDocVersion(setting), [setting]);

  const setValue = (name: keyof EmailSettingFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof EmailSettingFormData, value: string) => {
    const message = validateField(name, value);
    if (message) setFieldErrors((prev) => ({ ...prev, [name]: message }));
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.from_email.trim()) errors.from_email = 'From email is required';
    else {
      const message = validateField('from_email', formData.from_email);
      if (message) errors.from_email = message;
    }
    if (!formData.smtp_host.trim()) errors.smtp_host = 'SMTP host is required';
    const port = Number(formData.smtp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.smtp_port = 'Port must be a whole number between 1 and 65535';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    const payload: Partial<EmailSetting> = {
      purpose,
      from_email: formData.from_email.trim(),
      from_name: formData.from_name.trim() || null,
      smtp_host: formData.smtp_host.trim(),
      smtp_port: Number(formData.smtp_port),
      smtp_secure: formData.smtp_secure,
      smtp_username: formData.smtp_username.trim() || null,
      is_active: formData.is_active,
      note: formData.note.trim() || null,
      ...(password !== undefined ? { smtp_password: password } : {}),
    };
    try {
      if (isNew) {
        await emailSettingService.create(payload);
        toast.success(`ตั้งค่าโปรไฟล์ ${label} แล้ว`);
      } else {
        await emailSettingService.update(setting.id, {
          ...payload,
          ...(docVersion != null ? { doc_version: docVersion } : {}),
        });
        toast.success(`บันทึกโปรไฟล์ ${label} แล้ว`);
      }
      setPassword(undefined);
      onSaved();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        // Reload to latest but stay in edit mode — standard optimistic-lock UX.
        // The page re-keys this card on doc_version, so the remount refreshes the form.
        notifyVersionConflict();
        onSaved({ keepEditing: true });
      } else {
        const parsed = parseApiError(err);
        toast.error(parsed.message);
        if (parsed.fields) setFieldErrors(parsed.fields);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnset = async () => {
    if (!setting) return;
    try {
      await emailSettingService.remove(setting.id);
      toast.success(`ยกเลิกการตั้งค่าโปรไฟล์ ${label} แล้ว`);
      setConfirmUnset(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(parseApiError(err).message);
    }
  };

  const handleCancel = () => {
    setFormData(toForm(setting));
    setPassword(undefined);
    setFieldErrors({});
    onCancelEdit();
  };

  // Ctrl/⌘+S และ Escape ผูกที่การ์ดที่กำลังแก้ ไม่ใช่ที่หน้า — หน้ารับประกันว่ามีการ์ดเดียว
  // ที่ isEditing ได้ในเวลาหนึ่ง ๆ คีย์ลัดจึงไม่กำกวมและไม่ต้องส่ง ref ขึ้นไปให้หน้าเรียก
  // ต้องเรียก "หลัง" ประกาศ handleSave/handleCancel เพื่อไม่ให้ชน no-use-before-define
  //
  // shortcutsEnabled=false เมื่อหน้ามี dialog ทับอยู่ (prompt ยืนยันทิ้งการแก้ไข) —
  // ConfirmDialog เป็น dialog ของหน้า ไม่ใช่ของการ์ด จึงไม่ stop propagation ของ Escape
  // ที่ useGlobalShortcuts ฟังที่ window; ถ้าไม่ปิดคีย์ลัดตรงนี้ Escape จะไปโดน onCancel
  // ของการ์ด (handleCancel) พร้อมกับที่ปิด dialog เอง — ทำลาย draft ที่ dialog มีไว้ปกป้อง
  useGlobalShortcuts(
    isEditing && shortcutsEnabled
      ? { onSave: () => void handleSave(), onCancel: handleCancel }
      : {},
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{label}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {!inUse && (
            <p className="mt-2 text-xs text-warning">
              ยังไม่มีระบบไหนส่งอีเมลผ่านช่องทางนี้ — ตั้งค่าไว้ล่วงหน้าได้ แต่จะยังไม่มีเมลออก
            </p>
          )}
        </div>
        {isNew ? (
          <Badge variant="secondary">ยังไม่ตั้งค่า</Badge>
        ) : (
          <Badge variant={setting.is_active ? 'success' : 'secondary'}>
            {setting.is_active ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!isEditing && !isNew && (
          <div className="space-y-1 text-sm">
            <div>
              {setting.from_name ? `${setting.from_name} <${setting.from_email}>` : setting.from_email}
            </div>
            <div className="text-muted-foreground">
              {`${setting.smtp_host}:${setting.smtp_port}`}
              {setting.smtp_secure ? ' · implicit TLS' : ''}
            </div>
          </div>
        )}

        {!isEditing && isNew && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีโปรไฟล์สำหรับช่องทางนี้ — ระบบจะใช้ค่า SMTP จาก environment ของเซิร์ฟเวอร์แทน
          </p>
        )}

        {isEditing && canManage && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`from_email_${purpose}`}>From email</Label>
              <Input
                id={`from_email_${purpose}`}
                aria-label="From email"
                value={formData.from_email}
                onChange={(e) => setValue('from_email', e.target.value)}
                onBlur={(e) => handleBlur('from_email', e.target.value)}
                className={fieldErrors.from_email ? 'border-destructive' : ''}
              />
              {fieldErrors.from_email && (
                <p className="text-xs text-destructive">{fieldErrors.from_email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`from_name_${purpose}`}>From name</Label>
              <Input
                id={`from_name_${purpose}`}
                aria-label="From name"
                value={formData.from_name}
                onChange={(e) => setValue('from_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_host_${purpose}`}>SMTP host</Label>
              <Input
                id={`smtp_host_${purpose}`}
                aria-label="SMTP host"
                value={formData.smtp_host}
                onChange={(e) => setValue('smtp_host', e.target.value)}
                className={fieldErrors.smtp_host ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_host && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_host}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_port_${purpose}`}>SMTP port</Label>
              <Input
                id={`smtp_port_${purpose}`}
                aria-label="SMTP port"
                value={formData.smtp_port}
                onChange={(e) => setValue('smtp_port', e.target.value)}
                className={fieldErrors.smtp_port ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_port && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_port}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_username_${purpose}`}>SMTP username</Label>
              <Input
                id={`smtp_username_${purpose}`}
                aria-label="SMTP username"
                value={formData.smtp_username}
                onChange={(e) => setValue('smtp_username', e.target.value)}
              />
            </div>

            <PasswordField
              hasStoredPassword={!!setting?.smtp_password}
              isNew={isNew}
              onChange={setPassword}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.smtp_secure}
                onChange={(e) => setValue('smtp_secure', e.target.checked)}
                aria-label="Use implicit TLS"
              />
              Implicit TLS
            </label>
            <p className="text-xs text-muted-foreground lg:col-span-2">
              เปิดเมื่อใช้ implicit TLS (มักเป็นพอร์ต 465) — พอร์ต 587 ปกติใช้ STARTTLS ให้ปิดไว้
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.is_active}
                onChange={(e) => setValue('is_active', e.target.checked)}
                aria-label="Active"
              />
              Active
            </label>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor={`note_${purpose}`}>Note</Label>
              <Input
                id={`note_${purpose}`}
                aria-label="Note"
                value={formData.note}
                onChange={(e) => setValue('note', e.target.value)}
                placeholder="ใครเป็นเจ้าของ mailbox นี้ / ใช้ provider อะไร"
              />
            </div>
          </div>
        )}

        {!isEditing && !isNew && (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">SMTP username</Label>
              <ReadOnlyText value={setting.smtp_username ?? ''} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Note</Label>
              <ReadOnlyText value={setting.note ?? ''} />
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
                <span className="text-xs text-muted-foreground">บันทึกก่อนจึงจะทดสอบได้</span>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onRequestEdit}>
                  {isNew ? 'ตั้งค่า' : 'Edit'}
                </Button>
                {!isNew && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      ส่งเมลทดสอบ
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmUnset(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      ยกเลิกการตั้งค่า
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>

      {!isNew && (
        <>
          <ConfirmDialog
            open={confirmUnset}
            onOpenChange={setConfirmUnset}
            title={`ยกเลิกการตั้งค่าโปรไฟล์ ${label}`}
            description={
              `หลังจากนี้ระบบจะกลับไปใช้ค่า SMTP จาก environment ของเซิร์ฟเวอร์ ` +
              `ถ้าไม่ได้ตั้งค่านั้นไว้ อีเมลของช่องทางนี้จะหยุดส่ง ` +
              `และต้องตั้งรหัสผ่านใหม่ทั้งหมดหากจะสร้างโปรไฟล์นี้อีกครั้ง`
            }
            confirmText="ยกเลิกการตั้งค่า"
            confirmVariant="destructive"
            onConfirm={handleUnset}
          />
          {testOpen && (
            <TestEmailDialog
              open
              settingId={setting.id}
              defaultTo={callerIdentity}
              onOpenChange={setTestOpen}
            />
          )}
        </>
      )}
    </Card>
  );
};
