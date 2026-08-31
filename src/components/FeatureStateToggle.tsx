import React from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useI18n } from '../hooks/useI18n';
import { FEATURE_STATES, type FeatureState } from '../constants/featureFlags';
import type { TKey } from '../i18n/types';

const DEFAULT_STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.active',
  inactive: 'pages.featureFlags.state.inactive',
  hide: 'pages.featureFlags.state.hide',
};

const DEFAULT_STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.activeHint',
  inactive: 'pages.featureFlags.state.inactiveHint',
  hide: 'pages.featureFlags.state.hideHint',
};

interface FeatureStateToggleProps {
  value: FeatureState;
  onChange: (next: FeatureState) => void;
  /** ชื่อฟีเจอร์ที่แปลแล้ว ใช้ประกอบชื่อที่โปรแกรมอ่านหน้าจอประกาศ */
  featureLabel: string;
  /**
   * คีย์ป้ายชื่อของแต่ละสถานะ — ตั้งต้นเป็นของหน้า Feature Flags
   * หน้า License Features **ต้องส่งชุดของตัวเองมา** เพราะ `hideHint` ของ feature flag
   * พูดเรื่องหน้า 404 ซึ่งผิดความหมายสิ้นเชิงสำหรับ license feature ที่พูดเรื่องการขาย
   */
  labelKeys?: Record<FeatureState, TKey>;
  hintKeys?: Record<FeatureState, TKey>;
  /** ปิดทั้งกลุ่มระหว่างรอบันทึก หรือเมื่อผู้ใช้ไม่มีสิทธิ์แก้ */
  disabled?: boolean;
}

/**
 * กลุ่มปุ่มสามค่าแบบเลือกได้ค่าเดียว ประกอบจาก `Button` ที่มีอยู่ เพราะรีโปนี้ยังไม่มี primitive
 * ToggleGroup และกฎห้ามเพิ่ม/แก้ไฟล์ใน `src/components/ui/` โดยไม่ได้ขอ
 *
 * ใช้ร่วมกันสองหน้า: /platform/features (สวิตช์ฟีเจอร์ฝั่งหน้าจอ) และ /license-features
 * (สถานะการขายของ license feature) — คำอธิบายของสองหน้าคนละเรื่องกันสิ้นเชิง จึงส่งคีย์เข้ามาได้
 * Built from the existing Button: this repo has no ToggleGroup primitive and ui/ is off limits.
 */
export const FeatureStateToggle: React.FC<FeatureStateToggleProps> = ({
  value,
  onChange,
  featureLabel,
  labelKeys,
  hintKeys,
  disabled = false,
}) => {
  const { t } = useI18n();
  const STATE_LABEL = labelKeys ?? DEFAULT_STATE_LABEL;
  const STATE_HINT = hintKeys ?? DEFAULT_STATE_HINT;
  return (
    <div
      role="radiogroup"
      aria-label={featureLabel}
      /*
       * `flex-wrap` + `max-w-full` แทน `shrink-0` เดิม — ในการ์ดของ DataTable ที่จอ 390px
       * ป้ายชุดยาวอย่างของหน้า /license-features ("Closed to new sales") ทำให้กลุ่มปุ่มกว้าง
       * เกินการ์ดจนปุ่มขวาสุดถูกตัดและกดไม่ได้ · `shrink-0` เป็นตัวห้ามไม่ให้ยุบ จึงไม่มีทางขึ้น
       * บรรทัดใหม่ได้เลย · ตัวเลขจากการวัดจริง: กลุ่มปุ่มจบที่ 391px ขณะที่การ์ดจบที่ 330px
       */
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-border p-0.5"
    >
      {FEATURE_STATES.map((state) => (
        <Button
          key={state}
          type="button"
          role="radio"
          aria-checked={value === state}
          size="sm"
          disabled={disabled}
          variant={value === state ? 'default' : 'ghost'}
          className={cn('h-7 px-2 text-xs sm:px-3', value !== state && 'text-muted-foreground')}
          title={t(STATE_HINT[state])}
          onClick={() => onChange(state)}
        >
          {t(STATE_LABEL[state])}
        </Button>
      ))}
    </div>
  );
};
