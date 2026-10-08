import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { EmptyState } from './EmptyState';
import { useI18n } from '../hooks/useI18n';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { cn } from '../lib/utils';
import { parseDialogXml } from '../utils/dialogXml';
import { CANVAS_W, CellBlock, GRID_COLS } from './dialogPreview/CellView';
import { warningText } from './dialogPreview/warningText';
import { DialogLayoutEditor } from './dialogPreview/DialogLayoutEditor';

export interface DialogPreviewProps {
  xml: string;
  /** มีเมื่อหน้าอยู่ในโหมดแก้ไข — เปิด editor แบบลากวาง */
  onChange?: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml, onChange, onDragActiveChange }) => {
  const { t } = useI18n();
  const wide = useMediaQuery('(min-width: 768px)');
  const editable = !!onChange && wide;
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
  // ลบบรรทัดนี้เมื่อ inventory รุ่นที่รองรับ Label บน control ขึ้น production แล้ว (docs/dialog-xml/README.md)
  if (parsed.hasLabelAttr) notices.push(t('components.dialogPreview.labelAttrNeedsInventory'));

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
          {!editable && (
            <Badge variant="outline" className="text-xs">
              {t('components.dialogPreview.colsBadge', { count: parsed.cols })}
            </Badge>
          )}
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
        {editable && onChange ? (
          <DialogLayoutEditor xml={xml} parsed={parsed} onChange={onChange} onDragActiveChange={onDragActiveChange} />
        ) : (
          <>
            {onChange && <p className="mb-3 text-xs text-muted-foreground">{t('components.dialogPreview.editor.narrowScreen')}</p>}
            <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
              {parsed.cells.map((cell) => (
                <CellBlock key={cell.key} cell={cell} t={t} />
              ))}
            </div>
          </>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          {t('components.dialogPreview.previewOnlyNote')}
        </p>
      </div>
    </div>
  );
};
