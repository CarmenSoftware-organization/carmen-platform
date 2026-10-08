import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

interface SortableShellProps {
  id: string;
  label: string;
  className?: string;
  /** field ใน Group ใช้ชื่อ hover group ของตัวเอง — ชี้กล่อง Group แล้วที่จับของทุก field ข้างในจะได้ไม่โผล่พร้อมกัน */
  hoverGroup?: 'cell' | 'field';
  /** cell ที่แผง property กำลังแก้ */
  focused?: boolean;
  /** คลิก cell — เลือกให้แผงแก้ แต่ไม่ย้าย focus ของ DOM (ไม่แย่ง focus กลางการใช้เมาส์) */
  onFocusCell?: () => void;
  /** Enter/Space บน cell — เลือกและย้าย focus เข้าแผง */
  onFocusCellByKey?: () => void;
  toolbar: (handle: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}

/** ห่อ cell ด้วย useSortable — ลากได้จากปุ่มจับเท่านั้น (setActivatorNodeRef) */
export function SortableCell({ id, label, className, hoverGroup = 'cell', focused, onFocusCell, onFocusCellByKey, toolbar, children }: SortableShellProps) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      aria-label={t('components.dialogPreview.editor.dragHandle', { label })}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
  const byKey = onFocusCellByKey ?? onFocusCell;
  return (
    // cell เป็นพื้นที่เลือกที่ผูกกับแผง property (คลิก/Enter/Space) — ปุ่มจริงอยู่ใน toolbar ข้างใน
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={onFocusCell || onFocusCellByKey ? 0 : undefined}
      aria-current={focused || undefined}
      onClick={(e) => {
        // คลิก toolbar/ปุ่ม/ช่องที่ใช้งานได้ไม่ใช่การเลือก cell — label และช่อง disabled ในพรีวิวนับเป็นการเลือก
        // field ใน Group stopPropagation ด้านล่าง กล่อง Group จึงไม่แย่งไป
        if (!onFocusCell || (e.target as HTMLElement).closest('[data-cell-toolbar],button,a,input:not(:disabled),select:not(:disabled)')) return;
        e.stopPropagation();
        onFocusCell();
      }}
      onKeyDown={(e) => {
        if (!byKey || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        e.stopPropagation();
        byKey();
      }}
      className={cn(
        hoverGroup === 'field' ? 'group/field' : 'group/cell',
        'relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        focused && 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background',
        isDragging && 'z-20 opacity-60',
        className,
      )}
    >
      <div data-cell-toolbar className="contents">
        {toolbar(handle)}
      </div>
      {/* ช่อง disabled ในพรีวิวไม่ส่งคลิกขึ้นมาที่ cell เสมอไป — pointer-events-none ให้คลิกตกที่ cell */}
      <div className="contents [&_input:disabled]:pointer-events-none [&_select:disabled]:pointer-events-none">{children}</div>
    </div>
  );
}

/** ช่องวางท้ายกล่อง — ให้ลากไปต่อท้าย Dialog หรือท้าย Group ได้ */
export function EndZone({ id }: { id: string }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'col-span-full flex h-8 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground',
        isOver && 'border-primary bg-primary/5 text-foreground',
      )}
    >
      {t('components.dialogPreview.editor.dropAtEnd')}
    </div>
  );
}

export function GroupItems({ items, children }: { items: string[]; children: React.ReactNode }) {
  return (
    <SortableContext items={items} strategy={rectSortingStrategy}>
      {children}
    </SortableContext>
  );
}
