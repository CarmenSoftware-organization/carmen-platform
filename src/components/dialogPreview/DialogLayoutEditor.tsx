import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { MAX_COLS, type DialogCell, type DialogParseResult } from '../../utils/dialogXml';
import {
  containerMap,
  dropTarget,
  groupCells,
  hasHiddenToLabel,
  moveCell,
  setColSpan,
  setCols,
  ungroup,
} from '../../utils/dialogXmlEdit';
import { CANVAS_W, COL_SPAN, CellBlock, FieldBlock, GRID_COLS } from './CellView';
import { CellToolbar } from './CellToolbar';
import { EndZone, GroupItems, SortableCell } from './SortableCell';

export interface DialogLayoutEditorProps {
  xml: string;
  parsed: DialogParseResult;
  onChange: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

const cellLabel = (c: DialogCell, groupWord: string): string =>
  c.kind === 'group' ? groupWord : c.kind === 'range' ? c.label.replace(/ From$/, '') : c.label;

export function DialogLayoutEditor({ xml, parsed, onChange, onDragActiveChange }: DialogLayoutEditorProps) {
  const { t } = useI18n();
  // คำสั่งที่ไม่เปลี่ยนอะไร (ค่าเดิม, key หาย, วางที่เดิม) คืน string เดิม — ไม่ต้องทำให้หน้า dirty
  const apply = (next: string) => {
    if (next !== xml) onChange(next);
  };
  const groupWord = t('components.dialogPreview.editor.groupLabel');

  // ผูกการเลือกไว้กับ string ที่เลือก — XML เปลี่ยนจากที่ไหนก็ตาม key อาจเลื่อน จึงถือว่าไม่ได้เลือกอะไร
  const [selection, setSelection] = React.useState<{ xml: string; keys: string[] }>({ xml, keys: [] });
  const selected = selection.xml === xml ? selection.keys : [];
  const toggle = (key: string) =>
    setSelection({ xml, keys: selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key] });
  const selectedHasRange = parsed.cells.some((c) => c.kind === 'range' && selected.includes(c.key));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const map = containerMap(parsed.cells);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    onDragActiveChange?.(false);
    if (!over) return;
    const target = dropTarget(map, String(active.id), String(over.id));
    if (target) apply(moveCell(xml, String(active.id), target));
  };

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
      {selected.length >= 2 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-xs">
          <Button type="button" size="sm" onClick={() => apply(groupCells(xml, selected))}>
            {t('components.dialogPreview.editor.groupSelected', { count: selected.length })}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelection({ xml, keys: [] })}>
            {t('components.dialogPreview.editor.clearSelection')}
          </Button>
          {selectedHasRange && <span className="text-muted-foreground">{t('components.dialogPreview.editor.rangeSplits')}</span>}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onDragActiveChange?.(true)}
        onDragCancel={() => onDragActiveChange?.(false)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={map.dialog} strategy={rectSortingStrategy}>
          <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
            {parsed.cells.map((cell) => {
              const label = cellLabel(cell, groupWord);
              const toolbar = (handle: React.ReactNode) => (
                <CellToolbar
                  label={label}
                  span={cell.layout.colSpan}
                  cols={parsed.cols}
                  onSpan={(n) => apply(setColSpan(xml, cell.key, n))}
                  handle={handle}
                  select={
                    cell.kind === 'group' ? undefined : (
                      <input
                        type="checkbox"
                        className="mx-1 h-3.5 w-3.5 accent-primary"
                        checked={selected.includes(cell.key)}
                        disabled={hasHiddenToLabel(cell)}
                        title={hasHiddenToLabel(cell) ? t('components.dialogPreview.editor.hiddenToLabel') : undefined}
                        aria-label={t('components.dialogPreview.editor.selectCell', { label })}
                        onChange={() => toggle(cell.key)}
                      />
                    )
                  }
                />
              );
              if (cell.kind !== 'group') {
                return (
                  <SortableCell key={cell.key} id={cell.key} label={label} className={COL_SPAN[cell.layout.colSpan]} toolbar={toolbar}>
                    <CellBlock cell={{ ...cell, layout: { colSpan: 1 } }} t={t} />
                  </SortableCell>
                );
              }
              return (
                <SortableCell key={cell.key} id={cell.key} label={label} className={COL_SPAN[cell.layout.colSpan]} toolbar={toolbar}>
                  <div className="rounded-md border border-dashed p-3 pt-8">
                    <span className="absolute left-3 top-2 text-[11px] font-medium text-muted-foreground">{groupWord}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute left-14 top-1 h-6 px-2 text-[11px]"
                      onClick={() => apply(ungroup(xml, cell.key))}
                    >
                      {t('components.dialogPreview.editor.ungroup')}
                    </Button>
                    <GroupItems items={map.groups[cell.key]}>
                      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[Math.min(cell.fields.length, MAX_COLS)])}>
                        {cell.fields.map((f) => (
                          <SortableCell
                            key={f.key}
                            id={f.key}
                            label={f.label}
                            toolbar={(handle) => (
                              <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100">
                                {handle}
                              </div>
                            )}
                          >
                            <FieldBlock field={f} t={t} />
                          </SortableCell>
                        ))}
                        <EndZone id={`end:${cell.key}`} />
                      </div>
                    </GroupItems>
                  </div>
                </SortableCell>
              );
            })}
            <EndZone id="end:dialog" />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
