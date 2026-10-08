import React from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useI18n } from '../../hooks/useI18n';

// Esc ในช่องของแผง = คืนค่าเดิม — หยุดไม่ให้ไปถึง window ที่ KeyboardShortcuts ผูก Esc ไว้กับ Cancel ของหน้า
const stopEsc = (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') e.stopPropagation();
};

interface CommitInputProps {
  id: string;
  label: string;
  value: string;
  onCommit: (v: string) => void;
  /** ข้อความ error ที่แปลแล้ว — มีค่า = ไม่เขียน */
  validate?: (v: string) => string | null;
  /** คำเตือนไม่บล็อก คิดจากค่าที่กำลังพิมพ์ */
  warn?: (v: string) => string | null;
  hint?: string;
  list?: string;
}

/** ช่องข้อความที่เขียนลง XML ตอน blur/Enter เท่านั้น — ค่าผิดไม่ถูกเขียน, Esc คืนค่าที่เขียนไว้ล่าสุด */
export function CommitInput({ id, label, value, onCommit, validate, warn, hint, list }: CommitInputProps) {
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);
  const commit = () => {
    if (draft === value) return setError(null);
    const err = validate?.(draft) ?? null;
    setError(err);
    if (!err) onCommit(draft);
  };
  const warning = error ? null : (warn?.(draft) ?? null);
  const note = error ?? warning ?? hint;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={draft}
        list={list}
        className="h-8 text-xs"
        aria-invalid={!!error}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          stopEsc(e);
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setError(null);
          }
        }}
      />
      {note && (
        <p id={`${id}-note`} className={error ? 'text-[11px] text-destructive' : warning ? 'text-[11px] text-warning' : 'text-[11px] text-muted-foreground'}>
          {note}
        </p>
      )}
    </div>
  );
}

export interface Row {
  item: string;
  value: string;
}

const toRows = (items: string[], values: string[]): Row[] =>
  Array.from({ length: Math.max(items.length, values.length) }, (_, i) => ({ item: items[i] ?? '', value: values[i] ?? '' }));

/** ตาราง Items/Values — เขียนครั้งเดียวตอนโฟกัสออกจากทั้งตาราง ไม่ให้ XML มีสองฝั่งจำนวนไม่เท่ากันระหว่างแก้ */
export function RowsEditor({
  id,
  items,
  values,
  onCommit,
  validate,
}: {
  id: string;
  items: string[];
  values: string[];
  onCommit: (rows: Row[]) => void;
  validate: (rows: Row[]) => string | null;
}) {
  const { t } = useI18n();
  // items/values มาจาก split() ใหม่ทุก render — reset ตามเนื้อหาจริง ไม่ใช่ตามตัวตนของ array ไม่งั้น draft หายทุกครั้งที่แม่ render
  const sig = JSON.stringify([items, values]);
  const initial = React.useMemo(() => {
    const [i, v] = JSON.parse(sig) as [string[], string[]];
    return toRows(i, v);
  }, [sig]);
  const [rows, setRows] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setRows(initial);
    setError(null);
  }, [initial]);
  const same = rows.length === initial.length && rows.every((r, i) => r.item === initial[i].item && r.value === initial[i].value);
  const commit = () => {
    if (same || rows.length === 0) return setError(null);
    const err = validate(rows);
    setError(err);
    if (!err) onCommit(rows);
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const swap = (i: number, j: number) => {
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  return (
    // เหตุการณ์ blur/keydown ลอยขึ้นมาจาก Input ลูกเท่านั้น — wrapper ไม่ใช่ control ที่โต้ตอบเอง
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      className="space-y-1.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
      onKeyDown={(e) => {
        stopEsc(e);
        if (e.key === 'Escape') {
          setRows(initial);
          setError(null);
        }
      }}
    >
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1 text-[11px] text-muted-foreground">
        <span>{t('components.dialogPreview.panel.shown')}</span>
        <span>{t('components.dialogPreview.panel.sent')}</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1">
          <Input value={r.item} className="h-7 text-xs" aria-label={`${t('components.dialogPreview.panel.shown')} ${i + 1}`} onChange={(e) => set(i, { item: e.target.value })} />
          <Input value={r.value} className="h-7 text-xs" aria-label={`${t('components.dialogPreview.panel.sent')} ${i + 1}`} onChange={(e) => set(i, { value: e.target.value })} />
          <div className="flex">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} aria-label={t('components.dialogPreview.panel.moveUp', { n: i + 1 })} onClick={() => swap(i, i - 1)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === rows.length - 1} aria-label={t('components.dialogPreview.panel.moveDown', { n: i + 1 })} onClick={() => swap(i, i + 1)}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={t('components.dialogPreview.panel.removeRow', { n: i + 1 })} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRows([...rows, { item: '', value: '' }])}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t('components.dialogPreview.panel.addRow')}
      </Button>
      {error && (
        <p id={`${id}-err`} className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
