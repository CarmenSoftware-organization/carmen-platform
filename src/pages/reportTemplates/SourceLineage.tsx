import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

const SOURCE_TYPE_KEYS: Record<'view' | 'function' | 'procedure', TKey> = {
  view: 'pages.reportTemplates.sourceTypeView',
  function: 'pages.reportTemplates.sourceTypeFunction',
  procedure: 'pages.reportTemplates.sourceTypeProcedure',
};

/** จำนวนช่องกรอกใน `<Dialog>` — นับลูกที่ไม่ใช่ `<Label>`; XML พังหรือ root ไม่ใช่ Dialog คืน null */
export function countDialogFields(xml: string): number | null {
  if (!xml.trim()) return 0;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  if (!root || root.tagName !== 'Dialog') return null;
  return Array.from(root.children).filter((el) => el.tagName !== 'Label').length;
}

interface Props {
  dialog: string;
  sourceType: 'view' | 'function' | 'procedure';
  sourceName: string;
  builderKey: string;
}

/**
 * แถบเส้นทางข้อมูลใต้หัวเรื่อง: Dialog (ผู้ใช้กรอกอะไร) → แหล่งข้อมูล (ดึงจากไหน) → builder
 * ตอบคำถามแรกของคนเปิดหน้านี้ — "รายงานนี้ประกอบจากอะไร" — โดยไม่ต้องเลื่อนไปหาการ์ด Data Source
 */
export const SourceLineage: React.FC<Props> = ({ dialog, sourceType, sourceName, builderKey }) => {
  const { t } = useI18n();
  const fields = useMemo(() => countDialogFields(dialog), [dialog]);

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>
        {fields == null
          ? t('pages.reportTemplates.lineage.dialog')
          : fields === 1
            ? t('pages.reportTemplates.lineage.dialogFieldsOne')
            : t('pages.reportTemplates.lineage.dialogFields', { count: fields })}
      </span>
      <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>{t(SOURCE_TYPE_KEYS[sourceType])}</span>
      <code title={t('pages.reportTemplates.sourceName')} className="break-all font-mono text-xs text-foreground">
        {sourceName || '—'}
      </code>
      {builderKey && (
        <>
          <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <code title={t('pages.reportTemplates.builderKey')} className="break-all font-mono text-xs text-foreground">
            {builderKey}
          </code>
        </>
      )}
    </span>
  );
};
