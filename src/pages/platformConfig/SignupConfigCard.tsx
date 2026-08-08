import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { PlatformConfig, SignupConfig } from '../../types';

interface SignupConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
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

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);

export const SignupConfigCard: React.FC<SignupConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
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
      if (!value.trim()) return 'ต้องระบุ Verify URL';
      try {
        new URL(value);
        return '';
      } catch {
        return 'รูปแบบ URL ไม่ถูกต้อง (ต้องมี scheme เช่น https://)';
      }
    }
    const n = Number(value);
    if (!value.trim()) return 'ต้องระบุจำนวนชั่วโมง';
    if (!Number.isInteger(n) || n < 1 || n > 720) return 'ต้องเป็นจำนวนเต็ม 1–720';
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
      await platformConfigService.update('signup', {
        verify_base_url: formData.verify_base_url.trim(),
        link_expiry_hours: Number(formData.link_expiry_hours),
      });
      toast.success('บันทึกการตั้งค่าการสมัครแล้ว');
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Sign-up</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            ลิงก์ปลายทางของอีเมลยืนยันอีเมลก่อนสร้างบัญชี
          </p>
        </div>
        {canManage && !isEditing && (
          <Button variant="outline" size="sm" onClick={onRequestEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-verify-base-url">Verify URL</Label>
          {isEditing ? (
            <>
              <Input
                id="signup-verify-base-url"
                value={formData.verify_base_url}
                onChange={(e) => handleChange('verify_base_url', e.target.value)}
                onBlur={() => handleBlur('verify_base_url')}
                className={fieldErrors.verify_base_url ? 'border-destructive' : ''}
                placeholder="https://inventory.carmen.io/register/verify"
              />
              {fieldErrors.verify_base_url && (
                <p className="text-xs text-destructive">{fieldErrors.verify_base_url}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={form.verify_base_url} />
          )}
          <p className="text-xs text-muted-foreground">
            Where the link in the sign-up verification email points. This is the Carmen inventory
            app, not this console — the recipient sets their password there and the account is
            created only at that point. The system appends{' '}
            <code className="font-mono">?token=…</code> itself, so enter the page URL only, e.g.{' '}
            <code className="font-mono">https://inventory.example.com/register/verify</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-link-expiry-hours">Expiry (hours)</Label>
          {isEditing ? (
            <>
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
              {fieldErrors.link_expiry_hours && (
                <p className="text-xs text-destructive">{fieldErrors.link_expiry_hours}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={`${form.link_expiry_hours} ชั่วโมง`} />
          )}
        </div>

        {isEditing && (
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
