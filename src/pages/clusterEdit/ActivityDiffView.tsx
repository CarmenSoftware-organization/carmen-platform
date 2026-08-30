import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { TFunction } from '../../i18n/types';
import type { ActivityDiff, ActivityFieldChange } from '../../types';

/**
 * ฟิลด์ที่ระบบเขียนเองทุกครั้งที่บันทึก
 *
 * backend ส่งมาใน `fields` แต่ไม่นับใน `has_changes` — ซ่อนไว้เพราะทุกการแก้จะมีสามตัวนี้
 * เสมอ ถ้าโชว์จะกลบฟิลด์จริงที่ผู้ใช้เปิดมาดู
 */
const HOUSEKEEPING = new Set(['updated_at', 'updated_by_id', 'doc_version']);

/**
 * ฟิลด์ที่จะถูกแสดงจริง หลังตัดฟิลด์ระบบออก
 *
 * export ออกไปเพราะหัวแถวที่ยุบอยู่ต้องบอกจำนวนเดียวกับที่กางออกมาแล้วเห็น — นับจาก
 * `changes.fields` ตรง ๆ จะได้ตัวเลขที่มากกว่าของที่แสดงเสมอ (ทุกการแก้มีฟิลด์ระบบ 3 ตัว)
 * @param changes - ผลต่างที่ backend คำนวณมา
 * @returns เฉพาะฟิลด์ที่ผู้ใช้จะได้เห็น
 */
export const visibleFieldChanges = (changes?: ActivityDiff): ActivityFieldChange[] =>
  (changes?.fields ?? []).filter((f) => !HOUSEKEEPING.has(f.field));

/** ค่าที่ writer ปิดบังตอนบันทึก — เก็บเป็นสตริงนี้ตรง ๆ ใน JSONB */
const REDACTED = '[REDACTED]';

/** แปลงค่าดิบจาก JSONB ให้อ่านได้ โดยไม่เผยค่าที่ถูกปิดบัง */
const renderValue = (value: unknown, t: TFunction): string => {
  if (value === REDACTED) return t('pages.activityTrail.redactedValue');
  if (value === null || value === undefined || value === '') {
    return t('pages.activityTrail.emptyValue');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const FieldRow: React.FC<{ change: ActivityFieldChange }> = ({ change }) => {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 text-xs sm:grid-cols-3 sm:gap-2">
      <span className="text-muted-foreground truncate font-mono">{change.field}</span>
      <span className="text-muted-foreground break-all line-through">
        {renderValue(change.old, t)}
      </span>
      <span className="break-all">{renderValue(change.new, t)}</span>
    </div>
  );
};

/**
 * แสดงว่าฟิลด์ไหนเปลี่ยนจากอะไรเป็นอะไรในรายการประวัติหนึ่งรายการ
 *
 * ตารางลูกสรุปเป็นตัวเลขอย่างเดียว — กางลึกกว่านั้นในแผ่นกว้าง 20rem อ่านไม่ไหว
 * และเรคอร์ดฝั่ง platform รอบแรก (tb_cluster) ไม่มีตารางลูกอยู่แล้ว
 */
export const ActivityDiffView: React.FC<{ changes?: ActivityDiff }> = ({ changes }) => {
  const { t } = useI18n();
  const fields = visibleFieldChanges(changes);
  const children = changes?.children ?? [];

  if (fields.length === 0 && children.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {t('pages.activityTrail.noFieldChanges')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {fields.length > 0 && (
        <div className="divide-border divide-y">
          {fields.map((f) => (
            <FieldRow key={f.field} change={f} />
          ))}
        </div>
      )}
      {children.map((c) => (
        <p key={c.relation} className="text-muted-foreground text-xs">
          {t('pages.activityTrail.childSummary', {
            relation: c.relation,
            added: c.added?.length ?? 0,
            removed: c.removed?.length ?? 0,
            updated: c.updated?.length ?? 0,
          })}
        </p>
      ))}
    </div>
  );
};
