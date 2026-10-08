import React from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import type { TFunction } from '../../i18n/types';
import { MAX_COLS, type DialogCell, type DialogField } from '../../utils/dialogXml';

// string เต็มเท่านั้น — Tailwind JIT ไม่เห็น class ที่ประกอบตอนรัน
export const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};
export const COL_SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
};
// กว้างเท่าพื้นที่เนื้อหาจริงใน modal ของ inventory (sm:max-w-lg / 3xl / 5xl ลบ p-4 สองข้าง) — ให้เห็นความแคบจริงของช่อง
export const CANVAS_W: Record<number, string> = {
  1: 'max-w-[480px]',
  2: 'max-w-[736px]',
  3: 'max-w-[992px]',
  4: 'max-w-[992px]',
};
/** ตัวเลขเดียวกับ CANVAS_W เป็น px — ใช้คำนวณว่าแผง property วางข้างผืนผ้าใบได้ไหม (แก้คู่กันเสมอ) */
export const CANVAS_PX: Record<number, number> = {
  1: 480,
  2: 736,
  3: 992,
  4: 992,
};

function cleanDataSource(src: string | null | undefined): string {
  if (!src) return '';
  return src
    .replace(/^@/, '')
    .replace(/_list$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function renderControl(el: Element, t: TFunction): React.ReactNode {
  const tag = el.tagName;
  const name = el.getAttribute('Name') || '';
  if (tag === 'Date') {
    return <Input type="date" disabled placeholder={name} />;
  }
  if (tag === 'Lookup') {
    const source = cleanDataSource(el.getAttribute('DataSource'));
    return (
      <select
        disabled
        className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm text-muted-foreground shadow-xs"
      >
        <option>
          {t('components.dialogPreview.selectPlaceholder', {
            source: source || t('components.dialogPreview.genericValue'),
          })}
        </option>
      </select>
    );
  }
  const attrs = Array.from(el.attributes);
  return (
    <div className="flex min-h-9 w-full items-center rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-mono">&lt;{tag}&gt;</span>
      {attrs.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-1">
          {attrs.map((a) => (
            <span key={a.name} className="font-mono">
              {a.name}="{a.value}"
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldBlock({ field, t, className }: { field: DialogField; t: TFunction; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-xs text-muted-foreground">{field.label || ' '}</Label>
      {renderControl(field.element, t)}
    </div>
  );
}

export function CellBlock({ cell, t }: { cell: DialogCell; t: TFunction }) {
  const headingId = React.useId();
  const span = COL_SPAN[cell.layout.colSpan];
  if (cell.kind === 'range') {
    return (
      <div className={cn('space-y-2', span)}>
        <Label className="text-xs text-muted-foreground">{cell.label.replace(/ From$/, '') || ' '}</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { side: cell.from, caption: t('components.dialogPreview.rangeFrom') },
            { side: cell.to, caption: t('components.dialogPreview.rangeTo') },
          ].map(({ side, caption }) => (
            <div key={side.key} className="space-y-1">
              <span className="text-[11px] text-muted-foreground">{caption}</span>
              {renderControl(side.element, t)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (cell.kind === 'group') {
    return (
      <div
        role={cell.label ? 'group' : undefined}
        aria-labelledby={cell.label ? headingId : undefined}
        className={cn('space-y-3 rounded-md border border-dashed p-3', span)}
      >
        {cell.label && (
          <p id={headingId} className="text-sm font-medium">
            {cell.label}
          </p>
        )}
        <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[Math.min(cell.fields.length, MAX_COLS)])}>
          {cell.fields.map((f) => (
            <FieldBlock key={f.key} field={f} t={t} />
          ))}
        </div>
      </div>
    );
  }
  return <FieldBlock field={cell} t={t} className={span} />;
}
