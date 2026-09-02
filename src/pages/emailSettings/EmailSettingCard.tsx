import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Save, Send, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { AuditMeta } from '../../components/AuditMeta';
import { normalizeAudit } from '../../utils/audit';
import { PasswordField } from './PasswordField';
import { TestEmailDialog } from './TestEmailDialog';
import { FlowChip } from './RoutingPanel';
import type { RoutingLane } from './routingLanes';
import emailSettingService from '../../services/emailSettingService';
import { parseApiError } from '../../utils/errorParser';
import { validateField } from '../../utils/validation';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import type { EmailSetting } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface EmailSettingCardProps {
  /** id ของโปรไฟล์ หรือ 'new' เมื่อยังไม่ได้บันทึก — ใช้ตั้ง id ของ input ให้ไม่ชนกันข้ามการ์ด */
  profileKey: string;
  /** ชื่อที่ผู้ดูแลตั้ง แสดงเป็นหัวการ์ด — โปรไฟล์ไม่ผูกกับวัตถุประสงค์อีกต่อไป */
  label: string;
  description: string;
  setting: EmailSetting | null;
  /**
   * เลนของโปรไฟล์นี้ในแผงสายด้านบน — null ระหว่างที่ mapping ยังโหลดไม่เสร็จหรือโหลดไม่สำเร็จ
   * ซึ่งต้องเงียบไว้ ไม่ใช่แสดงว่า "ไม่มีเส้นทางใดใช้" เพราะนั่นเป็นคำโกหกที่ทำให้ลบโปรไฟล์ผิดตัว
   */
  lane: RoutingLane | null;
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
  name: string;
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
  name: '',
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
        name: s.name ?? '',
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

/**
 * แถวอ่านอย่างเดียว — ข้อความล้วน ไม่ใช่กล่องมีกรอบ
 *
 * เดิมที่นี่ใช้ `ReadOnlyText` ที่วาดกรอบ `border bg-muted/50 h-9` เหมือน input ที่ถูก disable
 * ผลคือหน้าที่กดอะไรไม่ได้เลยดูเหมือนฟอร์มที่รอกรอก กรอบสี่เหลี่ยมถูกสงวนไว้ให้สิ่งที่พิมพ์ได้
 */
const ReadOnlyRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="min-w-0 space-y-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className={mono ? 'truncate font-mono text-[13px]' : 'truncate text-sm'}>
      {value || '—'}
    </dd>
  </div>
);

export const EmailSettingCard: React.FC<EmailSettingCardProps> = ({
  profileKey,
  label,
  description,
  setting,
  lane,
  canManage,
  isEditing,
  callerIdentity = '',
  shortcutsEnabled = true,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const { t } = useI18n();
  const isNew = setting === null;
  const [formData, setFormData] = useState<EmailSettingFormData>(() => toForm(setting));
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmUnset, setConfirmUnset] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
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
  const audit = useMemo(() => normalizeAudit(setting), [setting]);
  const carried = lane ? [...lane.explicit, ...lane.inherited] : [];

  // เทียบกับ toForm(setting) ตรง ๆ แทนที่จะเก็บ snapshot แยก — การ์ดเข้าโหมดแก้ด้วยการ seed
  // จาก setting เสมอ (ดู effect ด้านบน) ค่านั้นจึงเป็น baseline ที่ถูกต้องอยู่แล้ว และ state
  // ที่น้อยลงหนึ่งตัวคือจุดที่ desync ไม่ได้ · password นับด้วย: PasswordField เก็บค่าไว้เอง
  // การเปลี่ยนรหัสผ่านโดยไม่แตะช่องอื่นเลยจึงมองไม่เห็นใน formData
  const dirty = useMemo(
    () => password !== undefined || JSON.stringify(formData) !== JSON.stringify(toForm(setting)),
    [formData, password, setting],
  );

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
    if (!formData.name.trim()) errors.name = t('pages.emailSettings.profileNameRequired');
    if (!formData.from_email.trim()) errors.from_email = t('pages.emailSettings.fromEmailRequired');
    else {
      const message = validateField('from_email', formData.from_email);
      if (message) errors.from_email = message;
    }
    if (!formData.smtp_host.trim()) errors.smtp_host = t('pages.emailSettings.smtpHostRequired');
    const port = Number(formData.smtp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.smtp_port = t('pages.emailSettings.smtpPortRange');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    const payload: Partial<EmailSetting> = {
      name: formData.name.trim(),
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
        toast.success(t('pages.emailSettings.profileConfiguredToast', { label }));
      } else {
        await emailSettingService.update(setting.id, {
          ...payload,
          ...(docVersion != null ? { doc_version: docVersion } : {}),
        });
        toast.success(t('pages.emailSettings.profileSavedToast', { label }));
      }
      setPassword(undefined);
      onSaved();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        // Reload to latest but stay in edit mode — standard optimistic-lock UX.
        // The page re-keys this card on doc_version, so the remount refreshes the form.
        notifyVersionConflict(t);
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
      toast.success(t('pages.emailSettings.profileUnsetToast', { label }));
      setConfirmUnset(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(parseApiError(err).message);
    }
  };

  const discard = () => {
    setFormData(toForm(setting));
    setPassword(undefined);
    setFieldErrors({});
    setConfirmCancel(false);
    onCancelEdit();
  };

  const handleCancel = () => {
    // ทิ้งของที่แก้ไว้ต้องถามก่อนเสมอ — หน้านี้ถามอยู่แล้วตอนสลับไปแก้การ์ดอื่น การกด Cancel
    // แล้วหายเงียบจึงเป็นความไม่สม่ำเสมอที่ผู้ดูแลเรียนรู้ไม่ได้ว่าเมื่อไหร่งานจะปลอดภัย
    // (รหัสผ่านที่พิมพ์ไว้ก็นับเป็นของที่แก้ ทั้งที่ไม่โผล่ในช่องไหนเลย — ดู `dirty`)
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    discard();
  };

  // Ctrl/⌘+S และ Escape ผูกที่การ์ดที่กำลังแก้ ไม่ใช่ที่หน้า — หน้ารับประกันว่ามีการ์ดเดียว
  // ที่ isEditing ได้ในเวลาหนึ่ง ๆ คีย์ลัดจึงไม่กำกวมและไม่ต้องส่ง ref ขึ้นไปให้หน้าเรียก
  // ต้องเรียก "หลัง" ประกาศ handleSave/handleCancel เพื่อไม่ให้ชน no-use-before-define
  //
  // shortcutsEnabled=false เมื่อหน้ามี dialog ทับอยู่ (prompt ยืนยันทิ้งการแก้ไข) —
  // ConfirmDialog เป็น dialog ของหน้า ไม่ใช่ของการ์ด จึงไม่ stop propagation ของ Escape
  // ที่ useGlobalShortcuts ฟังที่ window; ถ้าไม่ปิดคีย์ลัดตรงนี้ Escape จะไปโดน onCancel
  // ของการ์ด (handleCancel) พร้อมกับที่ปิด dialog เอง — ทำลาย draft ที่ dialog มีไว้ปกป้อง
  // confirmCancel เป็น dialog ของการ์ดใบนี้เอง แต่เหตุผลเดียวกับ shortcutsEnabled ใช้ได้ตรง ๆ:
  // Escape ที่ตั้งใจปิดกล่องยืนยันจะทะลุไปสั่ง handleCancel ด้วย แล้วเปิดกล่องซ้ำไม่รู้จบ
  useGlobalShortcuts(
    isEditing && shortcutsEnabled && !confirmCancel
      ? { onSave: () => void handleSave(), onCancel: handleCancel }
      : {},
  );

  return (
    // ชื่อโปรไฟล์ปรากฏสองที่บนหน้าเดียวโดยตั้งใจ: เลนในแผงสายด้านบน กับหัวการ์ดใบนี้ การ์ดจึงต้อง
    // เป็นภูมิภาคที่เรียกชื่อได้ ไม่งั้นทั้งผู้ใช้ screen reader และเทสต์ต่างแยกไม่ออกว่าอยู่ที่ไหน
    <Card role="region" aria-label={label}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base font-medium">{label}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {isNew ? (
          <Badge variant="secondary">{t('pages.emailSettings.notConfigured')}</Badge>
        ) : (
          <Badge variant={setting.is_active ? 'success' : 'secondary'}>
            {setting.is_active ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!isEditing && !isNew && (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="truncate text-sm">
                {setting.from_name
                  ? `${setting.from_name} <${setting.from_email}>`
                  : setting.from_email}
              </p>
              {/* ค่า transport คือสิ่งที่พังจริงเวลาเมลไม่ออก จึงเป็น mono ให้อ่านทีละอักขระได้ */}
              <p className="text-muted-foreground truncate font-mono text-[11px]">
                {`${setting.smtp_host}:${setting.smtp_port}`}
                {setting.smtp_secure ? ' · implicit TLS' : ''}
              </p>
            </div>
          </div>
        )}

        {/*
          แถบเส้นทางอยู่นอก `!isEditing` โดยตั้งใจ — ฟอร์มแก้ไขมีช่อง `Active` ซึ่งปลดแล้ว
          ทุกเส้นทางที่วิ่งเข้าโปรไฟล์นี้ส่งไม่ได้ ถ้าแถบนี้หายไปตอนแก้ ผู้ดูแลจะตัดสินใจปิด
          โปรไฟล์ในจังหวะเดียวกับที่หลักฐานว่ามีใครพึ่งมันอยู่หายจากจอ ซึ่งเป็นความผิดพลาด
          ที่ไม่มีทางรู้ตัวจนกว่าเมลจะเงียบ · chip ยังกดไม่ได้: การ์ดนี้ไม่ใช่ที่แก้เส้นทาง
          แผงสายด้านบนเป็น (ดู RoutingPanel) การ์ดนี้แค่ต้องไม่ปิดบังมัน
        */}
        {!isNew &&
          lane &&
          (carried.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">
                {t('pages.emailSettings.carries')}
              </span>
              {lane.explicit.map((flow) => (
                <FlowChip key={flow.value} flow={flow} />
              ))}
              {lane.inherited.map((flow) => (
                <FlowChip key={flow.value} flow={flow} inherited />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{t('pages.emailSettings.laneDark')}</p>
          ))}

        {!isEditing && isNew && (
          <p className="text-sm text-muted-foreground">
            {t('pages.emailSettings.noProfileNote')}
          </p>
        )}

        {isEditing && canManage && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`name_${profileKey}`}>{t('pages.emailSettings.profileName')}</Label>
              <Input
                id={`name_${profileKey}`}
                value={formData.name}
                onChange={(e) => setValue('name', e.target.value)}
                onBlur={(e) => handleBlur('name', e.target.value)}
                className={fieldErrors.name ? 'border-destructive' : ''}
                placeholder={t('pages.emailSettings.profileNamePlaceholder')}
              />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`from_email_${profileKey}`}>{t('pages.emailSettings.fromEmail')}</Label>
              <Input
                id={`from_email_${profileKey}`}
                aria-label={t('pages.emailSettings.fromEmail')}
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
              <Label htmlFor={`from_name_${profileKey}`}>{t('pages.emailSettings.fromName')}</Label>
              <Input
                id={`from_name_${profileKey}`}
                aria-label={t('pages.emailSettings.fromName')}
                value={formData.from_name}
                onChange={(e) => setValue('from_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_host_${profileKey}`}>{t('pages.emailSettings.smtpHost')}</Label>
              <Input
                id={`smtp_host_${profileKey}`}
                aria-label={t('pages.emailSettings.smtpHost')}
                value={formData.smtp_host}
                onChange={(e) => setValue('smtp_host', e.target.value)}
                className={fieldErrors.smtp_host ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_host && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_host}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_port_${profileKey}`}>{t('pages.emailSettings.smtpPort')}</Label>
              <Input
                id={`smtp_port_${profileKey}`}
                aria-label={t('pages.emailSettings.smtpPort')}
                value={formData.smtp_port}
                onChange={(e) => setValue('smtp_port', e.target.value)}
                className={fieldErrors.smtp_port ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_port && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_port}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_username_${profileKey}`}>{t('pages.emailSettings.smtpUsername')}</Label>
              <Input
                id={`smtp_username_${profileKey}`}
                aria-label={t('pages.emailSettings.smtpUsername')}
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
                aria-label={t('pages.emailSettings.implicitTls')}
              />
              {t('pages.emailSettings.implicitTls')}
            </label>
            <p className="text-xs text-muted-foreground lg:col-span-2">
              {t('pages.emailSettings.implicitTlsHint')}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.is_active}
                onChange={(e) => setValue('is_active', e.target.checked)}
                aria-label={t('common.status.active')}
              />
              {t('common.status.active')}
            </label>

            {/*
              เตือนตอนกำลังตัดสินใจ ไม่ใช่หลังบันทึกไปแล้ว — แผงสายด้านบนขึ้นคำเตือน "เลนพัง"
              ก็จริง แต่นั่นเกิดหลังจากเมลหยุดส่งไปแล้ว ตรงนี้คือจุดเดียวที่ยังกลับตัวได้ฟรี
            */}
            {!formData.is_active && carried.length > 0 && (
              <p className="text-destructive flex items-start gap-1.5 text-xs lg:col-span-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('pages.emailSettings.deactivateWarning', { count: carried.length })}
              </p>
            )}

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor={`note_${profileKey}`}>{t('common.field.note')}</Label>
              <Input
                id={`note_${profileKey}`}
                aria-label={t('pages.databasePools.columnNote')}
                value={formData.note}
                onChange={(e) => setValue('note', e.target.value)}
                placeholder={t('pages.emailSettings.notePlaceholder')}
              />
            </div>
          </div>
        )}

        {!isEditing && !isNew && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <ReadOnlyRow
              label={t('pages.emailSettings.smtpUsername')}
              value={setting.smtp_username ?? ''}
              mono
            />
            <ReadOnlyRow label={t('common.field.note')} value={setting.note ?? ''} />
          </dl>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? t('common.busy.saving') : t('common.action.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                {/* เดิมมีข้อความ "Save before you can test" ห้อยอยู่ตรงนี้ตลอดเวลาที่แก้ ทั้งที่
                    ปุ่มส่งเมลทดสอบหายไปจากแถวนี้แล้วจริง ๆ — การอธิบายว่าทำไมของที่มองไม่เห็น
                    ถึงมองไม่เห็น ทำให้แถวปุ่มยาวขึ้นโดยไม่ได้เพิ่มสิ่งที่กดได้ */}
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onRequestEdit}>
                  {isNew ? t('pages.emailSettings.configure') : t('common.action.edit')}
                </Button>
                {!isNew && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      {t('pages.emailSettings.sendTestEmail')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmUnset(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('pages.emailSettings.unset')}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/*
          ที่มาของแถวนี้อยู่ในกรอบการ์ด ไม่ใช่ลอยอยู่ใต้กรอบเหมือนเดิม — ข้อความ "ใครแก้ล่าสุด"
          ที่วางนอกการ์ดอ่านได้ว่าเป็นของหน้า ไม่ใช่ของโปรไฟล์ใบนี้ ทั้งที่มันเจาะจงถึงใบเดียว
          และเมื่อการ์ดวางเป็นกริดสองคอลัมน์ที่สูงไม่เท่ากัน บรรทัดที่ลอยอยู่ข้างนอกจะไปเรียง
          ใกล้การ์ดใบถัดไปมากกว่าใบที่มันพูดถึง

          แสดงในโหมดแก้ด้วย: จังหวะที่กำลังจะเขียนทับคือจังหวะที่ "ใครแตะล่าสุด" มีค่าที่สุด
          (เรื่องเดียวกับ 409) · การ์ดโปรไฟล์ใหม่ไม่มี audit ให้แสดง AuditMeta คืน null เอง
        */}
        {(audit.created || audit.updated) && (
          <AuditMeta
            variant="header"
            audit={audit}
            className="text-muted-foreground border-t pt-3 text-xs"
          />
        )}
      </CardContent>

      {/* นอก `!isNew`: การ์ดโปรไฟล์ใหม่ก็มีของที่ยังไม่บันทึกให้ทิ้งได้เหมือนกัน */}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('pages.emailSettings.discardTitle')}
        description={t('pages.emailSettings.discardProfileDescription', { label })}
        confirmText={t('pages.emailSettings.discardAction')}
        confirmVariant="destructive"
        onConfirm={discard}
      />

      {!isNew && (
        <>
          <ConfirmDialog
            open={confirmUnset}
            onOpenChange={setConfirmUnset}
            title={t('pages.emailSettings.unsetTitle', { label })}
            description={t('pages.emailSettings.unsetDescription')}
            confirmText={t('pages.emailSettings.unset')}
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
