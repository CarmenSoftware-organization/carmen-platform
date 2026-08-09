import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConfigCardShell, ReadOnlyText } from './ConfigCardShell';
import { INVITATION_CONFIG_DEFAULTS } from './invitationDefaults';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { InvitationConfig, PlatformConfig } from '../../types';

interface InvitationLimitsCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

interface LimitsFormData {
  max_per_admin_per_hour: string;
  max_per_cluster_per_day: string;
}

const DEFAULTS = INVITATION_CONFIG_DEFAULTS;

const toForm = (config: PlatformConfig | null): LimitsFormData => {
  const value = (config?.value ?? {}) as Partial<InvitationConfig>;
  return {
    max_per_admin_per_hour: String(
      typeof value.max_per_admin_per_hour === 'number'
        ? value.max_per_admin_per_hour
        : DEFAULTS.max_per_admin_per_hour,
    ),
    max_per_cluster_per_day: String(
      typeof value.max_per_cluster_per_day === 'number'
        ? value.max_per_cluster_per_day
        : DEFAULTS.max_per_cluster_per_day,
    ),
  };
};

export const InvitationLimitsCard: React.FC<InvitationLimitsCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<LimitsFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * backend ใช้ z.number().int().positive() — ไม่มีเพดานบน จึงไม่ตรวจ max ที่นี่
   * การใส่เพดานฝั่ง FE จะทำให้ฟอร์มปฏิเสธค่าที่ API รับได้จริง
   */
  const validate = (value: string): string => {
    if (!value.trim()) return 'ต้องระบุจำนวน';
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return 'ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป';
    return '';
  };

  const handleChange = (name: keyof LimitsFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof LimitsFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      max_per_admin_per_hour: validate(formData.max_per_admin_per_hour),
      max_per_cluster_per_day: validate(formData.max_per_cluster_per_day),
    };
    if (errors.max_per_admin_per_hour || errors.max_per_cluster_per_day) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // patch ไม่ใช่ update: base_url และ expiry_days ของคีย์เดียวกันนี้อยู่ในการ์ด
      // Invitation อีกใบ การส่งด้วย update() ซึ่งเป็น full replace จะล้างสองค่านั้น
      await platformConfigService.patch('invitation', {
        max_per_admin_per_hour: Number(formData.max_per_admin_per_hour),
        max_per_cluster_per_day: Number(formData.max_per_cluster_per_day),
      });
      toast.success('บันทึกเพดานคำเชิญแล้ว');
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
      title="Rate limits"
      description="เพดานจำนวนคำเชิญที่ออกได้ในช่วงเวลาหนึ่ง"
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <div className="space-y-2">
        <Label htmlFor="invitation-max-per-admin-per-hour">ต่อผู้ดูแลหนึ่งคน / ชั่วโมง</Label>
        {isEditing ? (
          <>
            <Input
              id="invitation-max-per-admin-per-hour"
              type="number"
              min={1}
              value={formData.max_per_admin_per_hour}
              onChange={(e) => handleChange('max_per_admin_per_hour', e.target.value)}
              onBlur={() => handleBlur('max_per_admin_per_hour')}
              className={fieldErrors.max_per_admin_per_hour ? 'border-destructive' : ''}
            />
            {fieldErrors.max_per_admin_per_hour && (
              <p className="text-xs text-destructive">{fieldErrors.max_per_admin_per_hour}</p>
            )}
          </>
        ) : (
          <ReadOnlyText value={`${form.max_per_admin_per_hour} คำเชิญ`} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="invitation-max-per-cluster-per-day">ต่อคลัสเตอร์ / วัน</Label>
        {isEditing ? (
          <>
            <Input
              id="invitation-max-per-cluster-per-day"
              type="number"
              min={1}
              value={formData.max_per_cluster_per_day}
              onChange={(e) => handleChange('max_per_cluster_per_day', e.target.value)}
              onBlur={() => handleBlur('max_per_cluster_per_day')}
              className={fieldErrors.max_per_cluster_per_day ? 'border-destructive' : ''}
            />
            {fieldErrors.max_per_cluster_per_day && (
              <p className="text-xs text-destructive">{fieldErrors.max_per_cluster_per_day}</p>
            )}
          </>
        ) : (
          <ReadOnlyText value={`${form.max_per_cluster_per_day} คำเชิญ`} />
        )}
      </div>

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
        <p>
          ค่าเริ่มต้นตั้งไว้สูงโดยตั้งใจ — การเปิดโรงแรมใหม่แล้วเชิญพนักงาน 30–50 คนรวดเดียวเป็น
          สถานการณ์ปกติ เพดานนี้กันการใช้ผิดปกติ <strong>ไม่ใช่ขอบเขตความปลอดภัย</strong> จึงไม่ควรลดลงมา
          ใกล้จำนวนการใช้งานจริง
        </p>
        <p className="mt-2">
          ตัวนับอยู่ในหน่วยความจำของแต่ละ process — <strong>เพดานที่มีผลจริงคูณตามจำนวน instance</strong>{' '}
          ที่รันอยู่ ตั้ง 100 บนสอง instance หมายถึงได้จริงถึง 200
        </p>
      </div>
    </ConfigCardShell>
  );
};
