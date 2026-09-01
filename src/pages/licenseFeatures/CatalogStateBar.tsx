import React from 'react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { FEATURE_STATES, type FeatureState } from '../../constants/featureFlags';
import type { TKey } from '../../i18n/types';

export type CatalogFilter = FeatureState | 'all';

export interface CatalogStateCounts {
  all: number;
  active: number;
  inactive: number;
  hide: number;
}

interface CatalogStateBarProps {
  counts: CatalogStateCounts;
  value: CatalogFilter;
  onChange: (next: CatalogFilter) => void;
  /** ป้ายชื่อสถานะของหน้านี้ — คนละชุดกับหน้า Feature Flags โดยเจตนา */
  labelKeys: Record<FeatureState, TKey>;
  hintKeys: Record<FeatureState, TKey>;
}

/**
 * แถบสรุป–ตัวกรองของแค็ตตาล็อก: ตัวเลขคือตัวกรอง ไม่ใช่ป้ายประดับ
 *
 * แทนที่ dropdown "ทุกสถานะ" เดิมซึ่งบอกได้แค่ว่ากำลังกรองอะไรอยู่ แต่ตอบไม่ได้เลยว่า
 * **แค็ตตาล็อกนี้มีอะไรอยู่บ้าง** — คำถามแรกที่ผู้ดูแลเปิดหน้านี้มาถาม ("ตอนนี้ปิดขายไปกี่ตัว")
 * ก่อนหน้านี้ต้องเลือกกรองทีละสถานะแล้วนับแถวเอาเอง
 *
 * **ตัวเลขนับหลังคำค้นแต่ก่อนตัวกรองสถานะ** (facet count มาตรฐาน) ถ้านับหลังตัวกรองด้วย
 * ช่องที่ไม่ได้เลือกจะกลายเป็น 0 ทุกช่องเสมอ และแถบทั้งแถบก็จะไร้ความหมายทันทีที่ถูกใช้งาน
 *
 * ช่องที่นับได้ 0 **ไม่ถูก disable** — "ยังไม่มีตัวไหนถูกปิดขายเลย" เป็นคำตอบที่มีความหมาย
 * และกดเข้าไปดูแล้วเจอหน้าว่างที่พูดชัดยังดีกว่าปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล
 */
export const CatalogStateBar: React.FC<CatalogStateBarProps> = ({
  counts,
  value,
  onChange,
  labelKeys,
  hintKeys,
}) => {
  const { t } = useI18n();

  const options: { key: CatalogFilter; count: number; label: string; hint?: string }[] = [
    { key: 'all', count: counts.all, label: t('pages.licenseFeatures.filterAll') },
    ...FEATURE_STATES.map((s) => ({
      key: s as CatalogFilter,
      count: counts[s],
      label: t(labelKeys[s]),
      hint: t(hintKeys[s]),
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t('pages.licenseFeatures.filterAll')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.hint}
            onClick={() => onChange(o.key)}
            className={cn(
              'rounded-md border px-3 py-2 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
          >
            <span
              className={cn(
                'block text-lg font-semibold leading-tight tabular-nums',
                o.count === 0 && 'text-muted-foreground',
              )}
            >
              {o.count}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
};
