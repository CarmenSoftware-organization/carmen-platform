import React, { useState } from 'react';
import { toast } from 'sonner';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ConfigCardShell, ReadOnlyText } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { LicenseConfig, PlatformConfig } from '../../types';

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
}) => {
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
          ? 'เปิดการบังคับใช้ license แล้ว — มีผลภายใน 60 วินาที'
          : 'ปิดการบังคับใช้ license แล้ว (shadow mode) — มีผลภายใน 60 วินาที',
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
        title="License Enforcement"
        description={
          <>
            สวิตช์เดียวที่ตัดสินว่า licensing บังคับใช้จริงหรือแค่บันทึกไว้เฉย ๆ (shadow mode) ·
            ต้องมีสิทธิ์ <code className="font-mono">license.manage</code> เพิ่มจาก{' '}
            <code className="font-mono">platform_config.manage</code> จึงจะแก้ได้
          </>
        }
        canManage={canManage}
        isEditing={isEditing}
        saving={saving}
        onRequestEdit={onRequestEdit}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="license-enforcement-enabled">Enforcement</Label>
            <Badge variant={saved.enforcement_enabled ? 'success' : 'secondary'}>
              {saved.enforcement_enabled ? 'บังคับใช้จริง' : 'shadow mode'}
            </Badge>
          </div>
          {isEditing ? (
            <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
              <input
                id="license-enforcement-enabled"
                type="checkbox"
                className="h-4 w-4"
                checked={formData.enforcement_enabled}
                disabled={saving}
                onChange={(e) =>
                  setFormData({ enforcement_enabled: e.target.checked })
                }
              />
              บังคับใช้ license จริง (ปิดไว้ = บันทึกอย่างเดียว ไม่บล็อกใคร)
            </label>
          ) : (
            <ReadOnlyText value={saved.enforcement_enabled ? 'เปิด' : 'ปิด'} />
          )}
          <p className="text-xs text-muted-foreground">
            <strong>ปิด (ค่าเริ่มต้น)</strong> = ระบบตรวจสิทธิ์ตามปกติแต่ไม่ปฏิเสธใคร เขียนเป็น log{' '}
            <code className="font-mono">LICENSE shadow-mode</code> ไว้ให้ตรวจย้อนหลังได้ ·{' '}
            <strong>เปิด</strong> = หน่วยธุรกิจที่ไม่มีสัญญาครอบคลุมฟีเจอร์นั้นจะได้{' '}
            <code className="font-mono">403 LICENSE_REQUIRED</code> สัญญาที่หมดอายุจะอ่านได้แต่เขียนไม่ได้
            (<code className="font-mono">LICENSE_EXPIRED</code>) และการเชิญผู้ใช้เกินเพดานที่นั่งจะได้{' '}
            <code className="font-mono">403 SEAT_LIMIT_REACHED</code>
          </p>
          <p className="text-xs text-muted-foreground">
            มีผลภายใน 60 วินาที ไม่ต้อง deploy ใหม่ และปิดกลับได้ทันทีด้วยวิธีเดียวกัน ·
            ครอบคลุมเฉพาะเส้นทางของแอปหน่วยธุรกิจ (
            <code className="font-mono">/api/:bu_code/…</code>) หน้าจอผู้ดูแลนี้ไม่อยู่ในขอบเขต
          </p>
        </div>
      </ConfigCardShell>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="เปิดการบังคับใช้ license?"
        description={
          'ทุกหน่วยธุรกิจที่ไม่มีสัญญาครอบคลุมฟีเจอร์ที่กำลังใช้อยู่จะถูกปฏิเสธทันทีภายใน 60 วินาที ' +
          'และการเชิญผู้ใช้เกินเพดานที่นั่งจะทำไม่ได้อีก · ตรวจให้แน่ใจก่อนว่าทุกหน่วยธุรกิจมีสัญญาที่ยัง ' +
          'active และถือฟีเจอร์ครบแล้ว (ดูหน้า Subscriptions) · ปิดกลับได้ทันทีด้วยการเอาเครื่องหมายถูกออก'
        }
        confirmText="เปิดการบังคับใช้"
        confirmVariant="destructive"
        onConfirm={persist}
      />
    </>
  );
};
