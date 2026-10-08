import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { useI18n } from '../../hooks/useI18n';

interface CellToolbarProps {
  label: string;
  span: number;
  cols: number;
  onSpan: (n: number) => void;
  handle?: React.ReactNode;
  select?: React.ReactNode;
}

/** แถบเครื่องมือมุมขวาบนของ cell — แสดงตอน hover หรือโฟกัสด้วยคีย์บอร์ด */
export function CellToolbar({ label, span, cols, onSpan, handle, select }: CellToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100">
      {select}
      {cols > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={span <= 1}
            aria-label={t('components.dialogPreview.editor.spanDecrease', { label })}
            onClick={() => onSpan(span - 1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-4 text-center text-[11px] tabular-nums" title={t('components.dialogPreview.editor.spanValue', { count: span, cols })}>
            {span}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={span >= cols}
            aria-label={t('components.dialogPreview.editor.spanIncrease', { label })}
            onClick={() => onSpan(span + 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {handle}
    </div>
  );
}
