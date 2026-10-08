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
  toolbar: (handle: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}

/** ห่อ cell ด้วย useSortable — ลากได้จากปุ่มจับเท่านั้น (setActivatorNodeRef) */
export function SortableCell({ id, label, className, hoverGroup = 'cell', toolbar, children }: SortableShellProps) {
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
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(hoverGroup === 'field' ? 'group/field' : 'group/cell', 'relative', isDragging && 'z-20 opacity-60', className)}
    >
      {toolbar(handle)}
      {children}
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
