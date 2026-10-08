import React from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
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
  deleteCell,
  dropTarget,
  groupCells,
  hasHiddenToLabel,
  moveCell,
  setColSpan,
  setCols,
  ungroup,
} from '../../utils/dialogXmlEdit';
import { CANVAS_PX, CANVAS_W, COL_SPAN, CellBlock, FieldBlock, GRID_COLS } from './CellView';
import { CellToolbar } from './CellToolbar';
import { PropertyPanel } from './PropertyPanel';
import { EndZone, GroupItems, SortableCell } from './SortableCell';

export interface DialogLayoutEditorProps {
  xml: string;
  parsed: DialogParseResult;
  onChange: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

// แผง property กว้าง w-72 (288px) + gap-4 (16px) — ต้องตรงกับคลาสด้านล่าง
const PANEL_PX = 288;
const GAP_PX = 16;

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
      const name = c.label || `${groupWord} ${groupNo}`;
      labels.set(c.key, name);
      labels.set(`end:${c.key}`, `${t('components.dialogPreview.editor.dropAtEnd')} (${name})`);
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
  // ผูกการเลือกไว้กับ string ที่เลือก — XML เปลี่ยนจากที่ไหนก็ตาม key อาจเลื่อน จึงถือว่าไม่ได้เลือกอะไร
  const [selection, setSelection] = React.useState<{ xml: string; keys: string[] }>({ xml, keys: [] });
  const selected = selection.xml === xml ? selection.keys : [];
  const toggle = (key: string) =>
    setSelection({ xml, keys: selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key] });
  // cell ที่แผง property แก้อยู่ — ผูกกับ XML แบบเดียวกับการเลือก: แก้ attribute ไม่ทำให้ key เลื่อน จึงพาไปด้วย
  const [focus, setFocus] = React.useState<{ xml: string; key: string | null }>({ xml, key: null });
  const focusKey = focus.xml === xml ? focus.key : null;
  const panelRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  // แผงมีช่องที่โชว์ error — ห้ามสลับ/ปิด cell ไม่งั้นร่างที่ผิดหายเงียบ (ย้าย/จัดกลุ่มที่ทำให้ key เลื่อนยังล้าง focus ตามเดิม)
  const blockedRef = React.useRef(false);
  const blockedSwitch = () => {
    if (!blockedRef.current) return false;
    toast.warning(t('components.dialogPreview.panel.fixErrorFirst'));
    panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return true;
  };
  // ทางเมาส์: เลือกเฉย ๆ ไม่ย้าย focus ของ DOM
  const pickCell = (key: string) => {
    if (key === focusKey || blockedSwitch()) return;
    setFocus({ xml, key });
  };
  // ทางคีย์บอร์ด: เลือกแล้วย้าย focus เข้าแผง
  const focusCell = (key: string) => {
    if (key !== focusKey && blockedSwitch()) return;
    setFocus({ xml, key });
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input,select,button:not([aria-label])')?.focus());
  };
  // ปุ่มที่กดหายไปจาก DOM (× ของแผง, Ungroup) — focus ตกที่ body แล้ว Esc ถัดไปจะยกเลิกทั้งหน้า จึงพา focus กลับไปที่ cell บนผืนผ้าใบ
  const focusCanvasCell = (find: (cells: HTMLElement[]) => HTMLElement | undefined) =>
    requestAnimationFrame(() => {
      const grid = canvasRef.current;
      if (grid) find(Array.from(grid.querySelectorAll<HTMLElement>('[data-cell-key]')).filter((el) => el.parentElement === grid))?.focus();
    });
  const closePanel = () => {
    if (blockedSwitch()) return;
    const key = focusKey;
    setFocus({ xml, key: null });
    if (key) requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(key)}"]`)?.focus());
  };
  // Ungroup แล้ว field ตัวแรกของกลุ่มเข้ามาอยู่ตำแหน่งเดิมของกล่อง Group — key ใหม่ยังไม่รู้ จึงหาตามลำดับ
  const ungroupAt = (groupKey: string) => {
    const next = ungroup(xml, groupKey);
    if (next === xml) return;
    const index = parsed.cells.findIndex((c) => c.key === groupKey);
    onChange(next);
    focusCanvasCell((cells) => cells[index]);
  };
  // Cols/ColSpan และการแก้ใน PropertyPanel แก้แค่ attribute — key ไม่เลื่อน จึงพาการเลือกและ focus ตามไปยัง XML ใหม่ได้
  // ใช้ functional update: แผงอาจเขียนร่างตอน unmount (สลับ cell) ด้วย closure เก่า — ต้องเก็บ cell ที่เพิ่งเลือกไว้ ไม่ใช่ cell เก่า
  const applyKeepingSelection = (next: string) => {
    if (next === xml) return;
    setSelection((s) => ({ xml: next, keys: s.xml === xml ? s.keys : [] }));
    setFocus((f) => ({ xml: next, key: f.xml === xml ? f.key : null }));
    onChange(next);
  };
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

  // Undo จาก toast อาจถูกกดหลัง render อื่น ๆ หรือหลัง editor ปิดไปแล้ว — อ่านค่าล่าสุดผ่าน ref เสมอ
  const xmlRef = React.useRef(xml);
  xmlRef.current = xml;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const addRef = React.useRef<HTMLButtonElement | null>(null);
  const undoDelete = (before: string, after: string) => {
    // editor ปิดแล้ว (Save/Cancel) หรือมีการแก้หลังลบ — เขียน XML ก่อนลบทับไม่ได้ ไม่งั้นฟอร์มต่างจากที่ผู้ใช้เห็น/บันทึก
    if (!mountedRef.current || xmlRef.current !== after) {
      toast.info(t('components.dialogPreview.editor.undoStale'));
      return;
    }
    onChangeRef.current(before);
  };
  // ลบ cell — ห้ามลบตอนแผงมี error ของ cell อื่น (key เลื่อนแล้วแผงล้าง ร่างที่ผิดจะหายเงียบ); ลบ cell ที่แก้อยู่เองได้
  const deleteAt = (key: string) => {
    if (key !== focusKey && blockedSwitch()) return;
    const next = deleteCell(xml, key);
    if (next === xml) return;
    const label = nameOf(key);
    // field สุดท้ายในกลุ่มพากลุ่มออกไปด้วย — ตำแหน่งที่หายไปคือตำแหน่งของกล่องกลุ่ม
    const owner = parsed.cells.find((c) => c.kind === 'group' && c.fields.some((f) => f.key === key));
    const anchor = owner && owner.kind === 'group' && owner.fields.length === 1 ? owner.key : key;
    const flat = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-cell-key]') ?? []);
    const index = flat.findIndex((el) => el.dataset.cellKey === anchor);
    setFocus({ xml: next, key: null });
    onChange(next);
    // ปุ่มที่กดหายไปพร้อม cell — focus ตกที่ body แล้ว Esc ถัดไปจะยกเลิกทั้งหน้า จึงพาไปที่ cell ข้างเคียงหรือปุ่ม Add field
    requestAnimationFrame(() => {
      const after = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-cell-key]') ?? []);
      (after[index] ?? after[index - 1] ?? addRef.current)?.focus();
    });
    toast(t('components.dialogPreview.editor.deleted', { label }), {
      duration: 10000,
      action: { label: t('components.dialogPreview.editor.undo'), onClick: () => undoDelete(xml, next) },
    });
  };

  // วางแผงข้างผืนผ้าใบเมื่อพื้นที่ของ editor เอง (ไม่ใช่ viewport) พอให้ผืนผ้าใบเต็มความกว้างของ Cols ปัจจุบัน
  // — ที่ lg หน้ายังแบ่งคอลัมน์ซ้าย + sidebar อยู่ breakpoint จึงบีบผืนผ้าใบจนแคบ
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapW(el.getBoundingClientRect().width);
    // jsdom (เทสต์) ไม่มี ResizeObserver — วัดครั้งเดียวพอ
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWrapW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sideBySide = wrapW >= (CANVAS_PX[parsed.cols] ?? CANVAS_PX[MAX_COLS]) + PANEL_PX + GAP_PX;

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
      <div ref={wrapRef} className={sideBySide ? 'flex flex-row items-start gap-4' : 'flex flex-col gap-4'}>
        <div className="min-w-0 flex-1">
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
          <div ref={canvasRef} className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
            {parsed.cells.map((cell) => {
              const label = nameOf(cell.key);
              const toolbar = (handle: React.ReactNode) => (
                <CellToolbar
                  label={label}
                  span={cell.layout.colSpan}
                  cols={parsed.cols}
                  onSpan={(n) => applyKeepingSelection(setColSpan(xml, cell.key, n))}
                  onDelete={() => deleteAt(cell.key)}
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
                  <SortableCell
                    key={cell.key}
                    id={cell.key}
                    label={label}
                    className={COL_SPAN[cell.layout.colSpan]}
                    focused={focusKey === cell.key}
                    onFocusCell={() => pickCell(cell.key)}
                    onFocusCellByKey={() => focusCell(cell.key)}
                    toolbar={toolbar}
                  >
                    <CellBlock cell={{ ...cell, layout: { colSpan: 1 } }} t={t} />
                  </SortableCell>
                );
              }
              return (
                <SortableCell
                    key={cell.key}
                    id={cell.key}
                    label={label}
                    className={COL_SPAN[cell.layout.colSpan]}
                    focused={focusKey === cell.key}
                    onFocusCell={() => pickCell(cell.key)}
                    onFocusCellByKey={() => focusCell(cell.key)}
                    toolbar={toolbar}
                  >
                  <div className="rounded-md border border-dashed p-3 pt-8">
                    <div className="absolute left-3 right-28 top-1 flex min-w-0 items-center gap-2">
                      <span className="truncate text-[11px] font-medium text-muted-foreground" title={label}>
                        {label}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[11px]"
                        onClick={() => ungroupAt(cell.key)}
                      >
                        {t('components.dialogPreview.editor.ungroup')}
                      </Button>
                    </div>
                    <GroupItems items={map.groups[cell.key]}>
                      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[Math.min(cell.fields.length, MAX_COLS)])}>
                        {cell.fields.map((f) => (
                          <SortableCell
                            key={f.key}
                            id={f.key}
                            label={f.label}
                            hoverGroup="field"
                            focused={focusKey === f.key}
                            onFocusCell={() => pickCell(f.key)}
                            onFocusCellByKey={() => focusCell(f.key)}
                            toolbar={(handle) => (
                              <div className="absolute right-1 top-1 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  aria-label={t('components.dialogPreview.editor.deleteCell', { label: f.label })}
                                  onClick={() => deleteAt(f.key)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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
        <PropertyPanel
          xml={xml}
          parsed={parsed}
          focusKey={focusKey}
          onApply={applyKeepingSelection}
          onUngroup={ungroupAt}
          onClose={closePanel}
          onDelete={deleteAt}
          onBlockingChange={(blocked) => {
            blockedRef.current = blocked;
          }}
          panelRef={panelRef}
          className={sideBySide ? 'sticky top-4 w-72 shrink-0' : 'w-full'}
        />
      </div>
    </div>
  );
}
