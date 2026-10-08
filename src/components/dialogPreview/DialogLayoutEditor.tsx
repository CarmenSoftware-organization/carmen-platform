import React from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type Announcements,
  type CollisionDetection,
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

const cellLabel = (c: DialogCell): string => (c.kind === 'range' ? c.label.replace(/ From$/, '') : c.kind === 'group' ? '' : c.label);

// ชี้อยู่ในช่องไหนให้ช่องนั้นชนะ (ช่องท้าย Group ไม่ถูก field ใกล้ ๆ แย่ง) — ถ้าชี้อยู่ทั้งกล่อง Group และ field ข้างใน
// เลือกตัวข้างใน; คีย์บอร์ดไม่มีพิกัดเมาส์ pointerWithin จึงว่าง และตกไปใช้ closestCenter เหมือนเดิม
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const inner = hits.filter((h) => !/^g\d+$/.test(String(h.id)));
  if (inner.length) return inner;
  return hits.length ? hits : closestCenter(args);
};

export function DialogLayoutEditor({ xml, parsed, onChange, onDragActiveChange }: DialogLayoutEditorProps) {
  const { t } = useI18n();
  // คำสั่งที่ไม่เปลี่ยนอะไร (ค่าเดิม, key หาย, วางที่เดิม) คืน string เดิม — ไม่ต้องทำให้หน้า dirty
  const apply = (next: string) => {
    if (next !== xml) onChange(next);
  };
  const groupWord = t('components.dialogPreview.editor.groupLabel');
  // ชื่อที่อ่านออกเสียงได้ของทุก id ที่ dnd-kit รู้จัก — Group มีลำดับต่อท้าย ไม่อย่างนั้นทุกกล่องชื่อ "Group" เหมือนกัน
  const labels = new Map<string, string>();
  let groupNo = 0;
  for (const c of parsed.cells) {
    if (c.kind === 'group') {
      groupNo++;
      labels.set(c.key, `${groupWord} ${groupNo}`);
      labels.set(`end:${c.key}`, `${t('components.dialogPreview.editor.dropAtEnd')} (${groupWord} ${groupNo})`);
      c.fields.forEach((f) => labels.set(f.key, f.label));
    } else labels.set(c.key, cellLabel(c));
  }
  labels.set('end:dialog', t('components.dialogPreview.editor.dropAtEnd'));
  const nameOf = (id: string | number) => labels.get(String(id)) ?? String(id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('components.dialogPreview.editor.announceStart', { label: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('components.dialogPreview.editor.announceOver', { label: nameOf(active.id), target: nameOf(over.id) })
        : t('components.dialogPreview.editor.announceOverNone', { label: nameOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t('components.dialogPreview.editor.announceEnd', { label: nameOf(active.id), target: nameOf(over.id) })
        : t('components.dialogPreview.editor.announceEndNone', { label: nameOf(active.id) }),
    onDragCancel: ({ active }) => t('components.dialogPreview.editor.announceCancel', { label: nameOf(active.id) }),
  };
  // Cols/ColSpan แก้แค่ attribute — key ไม่เลื่อน จึงพาการเลือกตามไปยัง XML ใหม่ได้
  const applyKeepingSelection = (next: string) => {
    if (next === xml) return;
    setSelection({ xml: next, keys: selected });
    onChange(next);
  };

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
  // dnd-kit ไม่รื้อ KeyboardSensor ที่กำลังลากเมื่อ DndContext ถูก unmount (เช่น กด Cancel/Save กลางการลาก)
  // ปุ่มจบการลากตัวถัดไป (Space/Enter/Tab) จะเรียก onDragEnd ตัวเก่าที่ถือ xml/onChange เก่า แล้วเขียนทับฟอร์ม
  // จึงต้องทิ้งทุก callback หลัง unmount และคืนสถานะ "ไม่ได้ลาก" ให้หน้าเอง
  const mountedRef = React.useRef(true);
  const dragActiveChangeRef = React.useRef(onDragActiveChange);
  dragActiveChangeRef.current = onDragActiveChange;
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dragActiveChangeRef.current?.(false);
    };
  }, []);

  const map = containerMap(parsed.cells);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!mountedRef.current) return;
    onDragActiveChange?.(false);
    if (!over) return;
    const target = dropTarget(map, String(active.id), String(over.id));
    if (!target) return;
    const activeKey = String(active.id);
    const next = moveCell(xml, activeKey, target);
    if (next !== xml) {
      onChange(next);
      return;
    }
    // วางไม่ได้ (ไม่ใช่วางที่เดิม) — บอกเหตุผล ไม่ให้เงียบ
    const intoGroup =
      ('end' in target && target.end !== 'dialog') ||
      ('before' in target && Object.values(map.groups).some((list) => list.includes(target.before)));
    if (!intoGroup) return;
    if (map.groups[activeKey]) toast.info(t('components.dialogPreview.editor.groupIntoGroup'));
    else {
      const cell = parsed.cells.find((c) => c.key === activeKey);
      if (cell && hasHiddenToLabel(cell)) toast.info(t('components.dialogPreview.editor.hiddenToLabel'));
    }
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
              onClick={() => applyKeepingSelection(setCols(xml, n))}
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
        collisionDetection={collision}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t('components.dialogPreview.editor.instructions') } }}
        onDragStart={() => onDragActiveChange?.(true)}
        onDragCancel={() => {
          if (mountedRef.current) onDragActiveChange?.(false);
        }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={map.dialog} strategy={rectSortingStrategy}>
          <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
            {parsed.cells.map((cell) => {
              const label = nameOf(cell.key);
              const toolbar = (handle: React.ReactNode) => (
                <CellToolbar
                  label={label}
                  span={cell.layout.colSpan}
                  cols={parsed.cols}
                  onSpan={(n) => applyKeepingSelection(setColSpan(xml, cell.key, n))}
                  handle={handle}
                  select={
                    cell.kind === 'group' ? undefined : (
                      // input ที่ disabled ไม่โชว์ title ตอน hover — ใส่ title ที่ span ห่อ และผูกเหตุผลด้วย aria-describedby
                      <span className="mx-1 inline-flex" title={hasHiddenToLabel(cell) ? t('components.dialogPreview.editor.hiddenToLabel') : undefined}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary"
                          checked={selected.includes(cell.key)}
                          disabled={hasHiddenToLabel(cell)}
                          aria-label={t('components.dialogPreview.editor.selectCell', { label })}
                          aria-describedby={hasHiddenToLabel(cell) ? `why-${cell.key}` : undefined}
                          onChange={() => toggle(cell.key)}
                        />
                        {hasHiddenToLabel(cell) && (
                          <span id={`why-${cell.key}`} className="sr-only">
                            {t('components.dialogPreview.editor.hiddenToLabel')}
                          </span>
                        )}
                      </span>
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
                    <span className="absolute left-3 top-2 text-[11px] font-medium text-muted-foreground">{label}</span>
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
                            hoverGroup="field"
                            toolbar={(handle) => (
                              <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
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
