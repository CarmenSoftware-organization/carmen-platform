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

export interface PanelContextValue {
  /** ช่องหนึ่งรายงานว่ากำลังโชว์ error อยู่หรือไม่ — แผงรวมเป็น "มี error ที่บล็อก" ส่งให้ editor ห้ามสลับ cell */
  report: (id: string, blocked: boolean) => void;
  /** XML ล่าสุดที่แผงได้รับ (อัปเดตตอน render) — ใช้ตัดสินตอน unmount ว่าร่างยังเขียนลง XML เดิมได้ไหม */
  xmlRef: React.RefObject<string>;
  /** false เมื่อทั้งแผงกำลังถูกถอด (ปิด editor หลัง Save/Cancel, ออกจากหน้า) — ร่างที่ค้างต้องทิ้ง ไม่ใช่เขียนลงฟอร์ม */
  aliveRef: React.RefObject<boolean>;
}

export const PanelContext = React.createContext<PanelContextValue | null>(null);

function useReportBlocking(id: string, blocked: boolean) {
  const ctx = React.useContext(PanelContext);
  const report = ctx?.report;
  // layout effect — ต้องรายงานก่อน click ถัดไปที่อาจสลับ cell (blur → error → click)
  React.useLayoutEffect(() => {
    report?.(id, blocked);
  }, [report, id, blocked]);
  React.useLayoutEffect(() => () => report?.(id, false), [report, id]);
}

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

/** ช่องข้อความที่เขียนลง XML ตอน blur/Enter เท่านั้น (ตัดช่องว่างหัวท้าย) — ค่าผิดไม่ถูกเขียนและบล็อกการสลับ cell, Esc คืนค่าที่เขียนไว้ล่าสุด */
export function CommitInput({ id, label, value, onCommit, validate, warn, hint, list }: CommitInputProps) {
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);
  useReportBlocking(id, !!error);
  React.useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);
  const commit = () => {
    if (draft === value) return setError(null);
    // ทุกช่องของแผงตัดช่องว่างหัวท้ายก่อนเขียน — ร่างก็ตัดตามด้วย ไม่งั้นค่าที่ตัดแล้วเท่าเดิมทำให้ช่องค้างช่องว่างไว้
    const v = draft.trim();
    if (v !== draft) setDraft(v);
    if (v === value) return setError(null);
    const err = validate?.(v) ?? null;
    setError(err);
    if (!err) onCommit(v);
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

const sameRows = (a: Row[], b: Row[]) => a.length === b.length && a.every((r, i) => r.item === b[i].item && r.value === b[i].value);

/**
 * ตาราง Items/Values — พิมพ์แล้วเขียนตอนโฟกัสออกจากทั้งตาราง (XML ไม่มีสองฝั่งจำนวนไม่เท่ากันระหว่างแก้)
 * ลบ/เลื่อนแถวเขียนทันทีถ้าผลยังถูกต้อง — ปุ่มบน Safari/Firefox ไม่รับ focus จึงไม่มี blur มาเขียนให้
 * และตอน unmount (สลับ cell) ร่างที่ถูกต้องแต่ยังไม่ได้เขียนถูกเขียนผ่าน onLeave
 */
export function RowsEditor({
  id,
  label,
  items,
  values,
  onCommit,
  onLeave,
  validate,
}: {
  id: string;
  /** ชื่อที่อ่านออกเสียงของตาราง */
  label: string;
  items: string[];
  values: string[];
  onCommit: (rows: Row[]) => void;
  /** เรียกตอน unmount เมื่อร่างต่างจาก XML และถูกต้อง — ผู้เรียกต้องเช็คเองว่า XML ยังเป็นฉบับเดิม */
  onLeave?: (rows: Row[]) => void;
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
  useReportBlocking(id, !!error);
  React.useEffect(() => {
    setRows(initial);
    setError(null);
  }, [initial]);
  // ร่างล่าสุดสำหรับ cleanup ตอน unmount — cleanup เห็นแค่ค่าของ render แรก
  const latest = React.useRef({ rows, initial, validate, onLeave });
  latest.current = { rows, initial, validate, onLeave };
  React.useEffect(
    () => () => {
      const { rows: r, initial: init, validate: check, onLeave: leave } = latest.current;
      if (leave && !sameRows(r, init) && !check(r)) leave(r);
    },
    [],
  );
  const commit = () => {
    if (sameRows(rows, initial)) return setError(null);
    const err = validate(rows);
    setError(err);
    if (!err) onCommit(rows);
  };
  // ลบ/เลื่อน = การกระทำเชิงโครงสร้างที่จบในตัว — ถูกต้องก็เขียนเลย ผิดก็โชว์ error เลย (ไม่รอ blur ที่อาจไม่มา)
  const restructure = (next: Row[]) => {
    setRows(next);
    if (sameRows(next, initial)) return setError(null);
    const err = validate(next);
    setError(err);
    if (!err) onCommit(next);
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const swap = (i: number, j: number) => {
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    restructure(next);
  };
  const addRow = () => {
    const n = rows.length;
    setRows([...rows, { item: '', value: '' }]);
    // ย้าย focus เข้าแถวใหม่ — ปุ่มบางเบราว์เซอร์ไม่รับ focus ถ้าไม่ย้าย จะไม่มี blur มาตรวจ/เขียนแถวนี้
    requestAnimationFrame(() => document.getElementById(`${id}-r${n}-item`)?.focus());
  };
  const errId = `${id}-err`;
  return (
    // เหตุการณ์ blur/keydown ลอยขึ้นมาจาก Input ลูกเท่านั้น — wrapper ไม่ใช่ control ที่โต้ตอบเอง
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label={label}
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
          <Input
            id={`${id}-r${i}-item`}
            value={r.item}
            className="h-7 text-xs"
            aria-label={`${t('components.dialogPreview.panel.shown')} ${i + 1}`}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => set(i, { item: e.target.value })}
          />
          <Input
            id={`${id}-r${i}-value`}
            value={r.value}
            className="h-7 text-xs"
            aria-label={`${t('components.dialogPreview.panel.sent')} ${i + 1}`}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => set(i, { value: e.target.value })}
          />
          <div className="flex">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} aria-label={t('components.dialogPreview.panel.moveUp', { n: i + 1 })} onClick={() => swap(i, i - 1)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === rows.length - 1} aria-label={t('components.dialogPreview.panel.moveDown', { n: i + 1 })} onClick={() => swap(i, i + 1)}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={t('components.dialogPreview.panel.removeRow', { n: i + 1 })} onClick={() => restructure(rows.filter((_, j) => j !== i))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addRow}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t('components.dialogPreview.panel.addRow')}
      </Button>
      {error && (
        <p id={errId} className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
