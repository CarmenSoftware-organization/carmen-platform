import type { ColumnDef } from '@tanstack/react-table';
import { AuditMeta } from './AuditMeta';
import { normalizeAudit } from '../utils/audit';
import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';

interface AuditColumnsOptions {
  /** ซ่อนคอลัมน์ Updated บนการ์ดมือถือ (ต่ำกว่า lg) — การ์ดแคบ ใส่ครบสองอันแล้วเบียด */
  hideUpdatedOnCard?: boolean;
  /** ส่งเข้ามาเพื่อให้ผลลัพธ์คงที่ตอนทดสอบ */
  now?: Date;
  /**
   * Optional translator. This is a plain function, not a component — it cannot call
   * `useI18n()` itself, so a caller whose page is already translated passes its own `t`
   * down. Omit it to render the frozen-English header ('Created' / 'Updated'), exactly as
   * every existing caller renders today.
   */
  t?: TFunction;
}

/**
 * คืนคอลัมน์ Created / Updated สำเร็จรูปให้ spread เข้า `columns` array ของหน้า
 *
 * ใช้แทนการเขียน `fmt()` เองในแต่ละหน้า ซึ่งเดิมคัดลอกกันอยู่ 7 ชุดและไม่ตรงกัน
 * เรียก `normalizeAudit` ต่อแถวเพื่อให้รับได้ทั้ง response แบบ nested และแบบแบน
 *
 * ตัวอย่าง:
 * ```ts
 * const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
 *   ...myColumns,
 *   ...auditColumns<Cluster>({ hideUpdatedOnCard: true }),
 * ], []);
 * ```
 */
export function auditColumns<T>(opts: AuditColumnsOptions = {}): ColumnDef<T, unknown>[] {
  const { hideUpdatedOnCard = false, now, t } = opts;
  // Falls back to the English catalog when no translator is supplied, so callers that
  // have not been migrated render exactly what they render today — same shape as
  // `validateField`'s own `tr` (src/utils/validation.ts), pinned to the literal 'en' for
  // byte-identity with the frozen-English test suite.
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  // Dev-only signal for a caller that forgot to pass `t`: it renders English silently,
  // with no compiler error. Fires only when the UI is actually Thai (`document
  // .documentElement.lang`, set by useI18n.tsx), so callers deliberately left unwired for
  // a later slice stay quiet — and it can't fire in jsdom, where `documentElement.lang`
  // is `''` by default, so none of the 144 test files see it.
  if (
    process.env.NODE_ENV === 'development' &&
    !t &&
    typeof document !== 'undefined' &&
    document.documentElement.lang === 'th'
  ) {
    console.warn('[i18n] auditColumns called without `t` — this message renders English');
  }

  return [
    {
      id: 'created_at',
      accessorFn: (row: T) => normalizeAudit(row).created?.at ?? '',
      header: tr('common.audit.created'),
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).created} now={now} />
      ),
    },
    {
      id: 'updated_at',
      accessorFn: (row: T) => normalizeAudit(row).updated?.at ?? '',
      header: tr('common.audit.updatedDate'),
      ...(hideUpdatedOnCard ? { meta: { card: 'hidden' } } : {}),
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).updated} now={now} />
      ),
    },
  ];
}
