import React from 'react';
import { Badge } from '../../components/ui/badge';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import type { CalculationMethod } from '../../services/reportTemplateService';

/** ลำดับมาตรฐาน — ใช้เรียงทุกที่ เพื่อให้ JSON.stringify ของ formData เทียบกันได้ */
export const CALCULATION_METHODS: readonly CalculationMethod[] = ['fifo', 'average', 'average_per_location'];

export const CALCULATION_METHOD_KEYS: Record<CalculationMethod, TKey> = {
  fifo: 'common.option.fifo',
  average: 'common.option.average',
  average_per_location: 'common.option.averagePerLocation',
};

/** ค่าในตัวกรอง: method หรือ 'restricted' = เฉพาะ template ที่ติด tag แล้ว */
export type CalculationMethodFilterValue = CalculationMethod | 'restricted';

const FILTER_VALUES: readonly CalculationMethodFilterValue[] = [...CALCULATION_METHODS, 'restricted'];

/** อ่านค่าจาก localStorage — ทิ้งค่าที่ไม่รู้จัก เพราะ enum ผิดตัวเดียวทำ Prisma ตอบ 500 ทั้งหน้า */
export function readCalculationMethodFilter(raw: unknown): CalculationMethodFilterValue[] {
  if (!Array.isArray(raw)) return [];
  return FILTER_VALUES.filter((v) => raw.includes(v));
}

export function sortCalculationMethods(list: CalculationMethod[]): CalculationMethod[] {
  return CALCULATION_METHODS.filter((m) => list.includes(m));
}

/**
 * where ของ Prisma สำหรับตัวกรอง:
 * - เลือก method → ติด tag ที่มี method ใดก็ได้ที่เลือก หรือไม่ได้ติด tag (= ทุก method)
 * - restricted อย่างเดียว → ติด tag แล้ว
 * - ทั้งคู่ → ติด tag และมี method ที่เลือก (hasSome บังคับไม่ว่างอยู่แล้ว)
 */
export function buildCalculationMethodWhere(sel: CalculationMethodFilterValue[]): Record<string, unknown> | null {
  const methods = CALCULATION_METHODS.filter((m) => sel.includes(m));
  const restricted = sel.includes('restricted');
  if (methods.length > 0 && restricted) return { calculation_methods: { hasSome: methods } };
  if (methods.length > 0) {
    return { OR: [{ calculation_methods: { isEmpty: true } }, { calculation_methods: { hasSome: methods } }] };
  }
  if (restricted) return { calculation_methods: { isEmpty: false } };
  return null;
}

export const CalculationMethodBadges: React.FC<{ methods?: CalculationMethod[] | null }> = ({ methods }) => {
  const { t } = useI18n();
  const list = sortCalculationMethods(methods ?? []);
  if (list.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('pages.reportTemplates.calculationMethodAll')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((m) => (
        <Badge key={m} variant="outline">{t(CALCULATION_METHOD_KEYS[m])}</Badge>
      ))}
    </div>
  );
};
