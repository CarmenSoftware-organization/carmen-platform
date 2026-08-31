import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { useI18n } from '../../hooks/useI18n';
import { FEATURE_STATES, type FeatureState } from '../../constants/featureFlags';
import type { TKey } from '../../i18n/types';

const STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.active',
  inactive: 'pages.featureFlags.state.inactive',
  hide: 'pages.featureFlags.state.hide',
};

const STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.activeHint',
  inactive: 'pages.featureFlags.state.inactiveHint',
  hide: 'pages.featureFlags.state.hideHint',
};

interface FeatureStateToggleProps {
  value: FeatureState;
  onChange: (next: FeatureState) => void;
  /** ชื่อฟีเจอร์ที่แปลแล้ว ใช้ประกอบชื่อที่โปรแกรมอ่านหน้าจอประกาศ */
  featureLabel: string;
}

/**
 * กลุ่มปุ่มสามค่าแบบเลือกได้ค่าเดียว ประกอบจาก `Button` ที่มีอยู่ เพราะรีโปนี้ยังไม่มี primitive
 * ToggleGroup และกฎห้ามเพิ่ม/แก้ไฟล์ใน `src/components/ui/` โดยไม่ได้ขอ
 * Built from the existing Button: this repo has no ToggleGroup primitive and ui/ is off limits.
 */
export const FeatureStateToggle: React.FC<FeatureStateToggleProps> = ({
  value,
  onChange,
  featureLabel,
}) => {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={featureLabel}
      className="inline-flex shrink-0 gap-0.5 rounded-md border border-border p-0.5"
    >
      {FEATURE_STATES.map((state) => (
        <Button
          key={state}
          type="button"
          role="radio"
          aria-checked={value === state}
          size="sm"
          variant={value === state ? 'default' : 'ghost'}
          className={cn('h-7 px-3 text-xs', value !== state && 'text-muted-foreground')}
          title={t(STATE_HINT[state])}
          onClick={() => onChange(state)}
        >
          {t(STATE_LABEL[state])}
        </Button>
      ))}
    </div>
  );
};
