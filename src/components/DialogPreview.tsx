import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { EmptyState } from './EmptyState';
import { useI18n } from '../hooks/useI18n';
import { cn } from '../lib/utils';
import type { TFunction } from '../i18n/types';
import { MAX_COLS, parseDialogXml, type DialogCell, type DialogField, type DialogWarning } from '../utils/dialogXml';

export interface DialogPreviewProps {
  xml: string;
}

// string เต็มเท่านั้น — Tailwind JIT ไม่เห็น class ที่ประกอบตอนรัน
const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};
const COL_SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
};
// กว้างเท่า modal จริงของ inventory (DialogContent sm:max-w-lg และ MODAL_W) — ให้เห็นความแคบจริงของช่อง
const CANVAS_W: Record<number, string> = {
  1: 'max-w-lg',
  2: 'max-w-3xl',
  3: 'max-w-5xl',
  4: 'max-w-5xl',
};

function cleanDataSource(src: string | null | undefined): string {
  if (!src) return '';
  return src
    .replace(/^@/, '')
    .replace(/_list$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderControl(el: Element, t: TFunction): React.ReactNode {
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

function FieldBlock({ field, t, className }: { field: DialogField; t: TFunction; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-xs text-muted-foreground">{field.label || ' '}</Label>
      {renderControl(field.element, t)}
    </div>
  );
}

function CellBlock({ cell, t }: { cell: DialogCell; t: TFunction }) {
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
        className={cn(
          'grid grid-cols-1 gap-4 rounded-md border border-dashed p-3',
          GRID_COLS[Math.min(cell.fields.length, MAX_COLS)],
          span,
        )}
      >
        {cell.fields.map((f) => (
          <FieldBlock key={f.key} field={f} t={t} />
        ))}
      </div>
    );
  }
  return <FieldBlock field={cell} t={t} className={span} />;
}

function warningText(w: DialogWarning, t: TFunction): string {
  switch (w.code) {
    case 'colsInvalid':
      return t('components.dialogPreview.warnColsInvalid', { raw: w.raw, used: w.used });
    case 'colsClamped':
      return t('components.dialogPreview.warnColsClamped', { raw: w.raw, used: w.used });
    case 'colSpanInvalid':
      return t('components.dialogPreview.warnColSpanInvalid', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanClamped':
      return t('components.dialogPreview.warnColSpanClamped', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanOnLabel':
      return t('components.dialogPreview.warnColSpanOnLabel', { at: w.at });
    case 'unknownElement':
      return t('components.dialogPreview.warnUnknownElement', { at: w.at, tag: w.tag });
    case 'nestedGroupFlattened':
      return t('components.dialogPreview.warnNestedGroup', { at: w.at });
    case 'emptyGroup':
      return t('components.dialogPreview.warnEmptyGroup', { at: w.at });
    case 'labelWithoutControl':
      return t('components.dialogPreview.warnLabelWithoutControl', { at: w.at });
    case 'controlWithoutLabel':
      return t('components.dialogPreview.warnControlWithoutLabel', { at: w.at });
  }
}

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml }) => {
  const { t } = useI18n();
  const parsed = useMemo(() => parseDialogXml(xml), [xml]);

  // ไม่มี XML เลยไม่ใช่ความผิดพลาด (template แบบ Form มักไม่มี dialog) — สีแดงเก็บไว้ให้ XML ที่ parse ไม่ผ่านจริง
  if (!xml.trim()) {
    return (
      <EmptyState
        icon={Eye}
        title={t('components.dialogPreview.noXmlProvided')}
        description={t('components.dialogPreview.emptyHint')}
      />
    );
  }

  if (!parsed.ok) {
    const message =
      parsed.error === 'noDialogRoot'
        ? t('components.dialogPreview.requiresDialogRoot')
        : parsed.errorDetail || t('components.xml.invalidXml');
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-medium text-destructive">{t('components.dialogPreview.previewUnavailable')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{message}</div>
          </div>
        </div>
      </div>
    );
  }

  const fieldCount = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
  const countBadges = Object.entries(parsed.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => (
      <Badge key={tag} variant="outline" className="text-xs">
        {n} {tag}
      </Badge>
    ));
  const notices = parsed.warnings.map((w) => warningText(w, t));
  // ลบบรรทัดนี้เมื่อ inventory รุ่นที่รองรับ <Group> ขึ้น production แล้ว (docs/dialog-xml/README.md)
  if (parsed.cells.some((c) => c.kind === 'group')) notices.push(t('components.dialogPreview.groupNeedsInventory'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{t('components.dialogPreview.title')}</span>
          <Badge variant="secondary" className="text-xs">
            {fieldCount === 1
              ? t('components.dialogPreview.fieldCountSingular', { count: fieldCount })
              : t('components.dialogPreview.fieldCountPlural', { count: fieldCount })}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t('components.dialogPreview.colsBadge', { count: parsed.cols })}
          </Badge>
          {notices.length > 0 && (
            <Badge variant="warning" className="text-xs">
              {notices.length === 1
                ? t('components.dialogPreview.warningCountSingular', { count: notices.length })
                : t('components.dialogPreview.warningCountPlural', { count: notices.length })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">{countBadges}</div>
      </div>
      {notices.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          {notices.map((text, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border bg-muted/20 p-4 sm:p-6">
        <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
          {parsed.cells.map((cell) => (
            <CellBlock key={cell.key} cell={cell} t={t} />
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          {t('components.dialogPreview.previewOnlyNote')}
        </p>
      </div>
    </div>
  );
};
