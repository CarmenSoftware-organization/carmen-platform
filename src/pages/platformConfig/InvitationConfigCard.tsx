import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { InvitationConfig, PlatformConfig } from '../../types';

interface InvitationConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

interface InvitationFormData {
  base_url: string;
  expiry_days: string;
}

const DEFAULTS: InvitationConfig = {
  base_url: 'http://localhost:3000/invitations',
  expiry_days: 7,
};

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม — ค่าที่ backend คืนมาผ่าน Zod แล้วเสมอ
 * แต่ยังกันไว้ด้วย fallback เผื่อ backend เวอร์ชันเก่ายังไม่รู้จักคีย์นี้
 */
const toForm = (config: PlatformConfig | null): InvitationFormData => {
  const value = (config?.value ?? {}) as Partial<InvitationConfig>;
  return {
    base_url: typeof value.base_url === 'string' ? value.base_url : DEFAULTS.base_url,
    expiry_days: String(
      typeof value.expiry_days === 'number' ? value.expiry_days : DEFAULTS.expiry_days,
    ),
  };
};

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);

export const InvitationConfigCard: React.FC<InvitationConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<InvitationFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * ตรวจ base_url ฝั่ง FE เพื่อ UX เท่านั้น — backend ตัดสินสุดท้ายเสมอด้วย z.string().url()
   * ซึ่งอาจเข้มกว่านี้ในบางเคส ถ้าผลไม่ตรงกันให้ยึด error จาก backend
   * base URL ที่มี query string ติดมาแล้วถือว่าถูกต้อง ฝั่ง backend ประกอบ token ด้วย
   * searchParams.set() ไม่ใช่การต่อสตริง อย่าเพิ่มกฎห้าม query string ตรงนี้
   */
  const validate = (name: keyof InvitationFormData, value: string): string => {
    if (name === 'base_url') {
      if (!value.trim()) return 'ต้องระบุ Base URL';
      try {
        new URL(value);
        return '';
      } catch {
        return 'รูปแบบ URL ไม่ถูกต้อง (ต้องมี scheme เช่น https://)';
      }
    }
    const n = Number(value);
    if (!value.trim()) return 'ต้องระบุจำนวนวัน';
    if (!Number.isInteger(n) || n < 1 || n > 365) return 'ต้องเป็นจำนวนเต็ม 1–365';
    return '';
  };

  const handleChange = (name: keyof InvitationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof InvitationFormData) => {
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
      expiry_days: validate('expiry_days', formData.expiry_days),
    };
    if (errors.base_url || errors.expiry_days) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      await platformConfigService.update('invitation', {
        base_url: formData.base_url.trim(),
        expiry_days: Number(formData.expiry_days),
      });
      toast.success('บันทึกการตั้งค่าคำเชิญแล้ว');
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
          <CardTitle className="text-base">Invitation</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            ลิงก์ปลายทางและอายุของคำเชิญเข้าคลัสเตอร์
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
          <Label htmlFor="invitation-base-url">Base URL</Label>
          {isEditing ? (
            <>
              <Input
                id="invitation-base-url"
                value={formData.base_url}
                onChange={(e) => handleChange('base_url', e.target.value)}
                onBlur={() => handleBlur('base_url')}
                className={fieldErrors.base_url ? 'border-destructive' : ''}
                placeholder="https://app.carmen.io/invitations"
              />
              {fieldErrors.base_url && (
                <p className="text-xs text-destructive">{fieldErrors.base_url}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={form.base_url} />
          )}
          <p className="text-xs text-muted-foreground">
            ระบบจะเติม <code className="font-mono">?token=…</code> ต่อท้ายให้เอง
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invitation-expiry-days">Expiry (days)</Label>
          {isEditing ? (
            <>
              <Input
                id="invitation-expiry-days"
                type="number"
                min={1}
                max={365}
                value={formData.expiry_days}
                onChange={(e) => handleChange('expiry_days', e.target.value)}
                onBlur={() => handleBlur('expiry_days')}
                className={fieldErrors.expiry_days ? 'border-destructive' : ''}
              />
              {fieldErrors.expiry_days && (
                <p className="text-xs text-destructive">{fieldErrors.expiry_days}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={`${form.expiry_days} วัน`} />
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
