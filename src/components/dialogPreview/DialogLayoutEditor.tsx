import React from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { MAX_COLS, type DialogCell, type DialogParseResult } from '../../utils/dialogXml';
import { setColSpan, setCols } from '../../utils/dialogXmlEdit';
import { CANVAS_W, COL_SPAN, CellBlock, GRID_COLS } from './CellView';
import { CellToolbar } from './CellToolbar';

export interface DialogLayoutEditorProps {
  xml: string;
  parsed: DialogParseResult;
  onChange: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

const cellLabel = (c: DialogCell, groupWord: string): string =>
  c.kind === 'group' ? groupWord : c.kind === 'range' ? c.label.replace(/ From$/, '') : c.label;

export function DialogLayoutEditor({ xml, parsed, onChange }: DialogLayoutEditorProps) {
  const { t } = useI18n();
  // คำสั่งที่ไม่เปลี่ยนอะไร (ค่าเดิม, key หาย) คืน string เดิม — ไม่ต้องทำให้หน้า dirty
  const apply = (next: string) => {
    if (next !== xml) onChange(next);
  };
  const groupWord = t('components.dialogPreview.editor.groupLabel');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t('components.dialogPreview.editor.colsLabel')}</span>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('components.dialogPreview.editor.colsLabel')}>
          {Array.from({ length: MAX_COLS }, (_, i) => i + 1).map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={parsed.cols === n ? 'secondary' : 'ghost'}
              className="h-7 w-8 px-0"
              aria-pressed={parsed.cols === n}
              onClick={() => apply(setCols(xml, n))}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>
      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
        {parsed.cells.map((cell) => (
          <div key={cell.key} className={cn('group/cell relative', COL_SPAN[cell.layout.colSpan])}>
            <CellToolbar
              label={cellLabel(cell, groupWord)}
              span={cell.layout.colSpan}
              cols={parsed.cols}
              onSpan={(n) => apply(setColSpan(xml, cell.key, n))}
            />
            <CellBlock cell={{ ...cell, layout: { colSpan: 1 } }} t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}
