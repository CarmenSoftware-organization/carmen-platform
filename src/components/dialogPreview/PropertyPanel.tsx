import React from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TFunction, TKey } from '../../i18n/types';
import type { DialogCell, DialogField, DialogParseResult } from '../../utils/dialogXml';
import { setColSpan, setControlAttrs, setGroupLabel, setLabelText, type Side } from '../../utils/dialogXmlEdit';
import { DATA_SOURCES } from '../../utils/dialogDataSources';
import { dataSourceUnknown, rangeWillSplit, validateName, validateRows, type IssueCode } from '../../utils/dialogXmlValidate';
import { CommitInput, RowsEditor, type Row } from './panelInputs';

export interface PropertyPanelProps {
  xml: string;
  parsed: DialogParseResult;
  focusKey: string | null;
  onApply: (next: string) => void;
  onUngroup: (groupKey: string) => void;
  onClose: () => void;
  className?: string;
  panelRef?: React.Ref<HTMLElement>;
}

type Focused =
  | { kind: 'field'; cell: DialogField; inGroup: boolean }
  | { kind: 'range'; cell: Extract<DialogCell, { kind: 'range' }> }
  | { kind: 'group'; cell: Extract<DialogCell, { kind: 'group' }> };

function findFocused(cells: DialogCell[], key: string | null): Focused | null {
  if (!key) return null;
  for (const c of cells) {
    if (c.key === key) {
      if (c.kind === 'range') return { kind: 'range', cell: c };
      if (c.kind === 'group') return { kind: 'group', cell: c };
      return { kind: 'field', cell: c, inGroup: false };
    }
    if (c.kind === 'group') {
      const f = c.fields.find((x) => x.key === key);
      if (f) return { kind: 'field', cell: f, inGroup: true };
    }
  }
  return null;
}

const KNOWN: Record<string, ReadonlySet<string>> = {
  Date: new Set(['Name', 'Value', 'ColSpan', 'Label']),
  Lookup: new Set(['Name', 'Value', 'ColSpan', 'Label', 'DataSource', 'Items', 'Values', 'Multi']),
};

/** Lookup โหมดรายการ/แหล่งข้อมูล — ใช้เป็น key เพื่อให้ mode รีเซ็ตเมื่อ XML เปลี่ยนจากข้างนอก (Same as From, แก้ในแท็บ XML) */
const listKey = (el: Element) => (el.hasAttribute('Items') || el.hasAttribute('Values') ? 'list' : 'src');

const split = (raw: string | null) => (raw ? raw.split('~') : []);
const DATALIST_ID = 'dialog-data-sources';

const ISSUE_KEY: Record<IssueCode, TKey> = {
  nameRequired: 'components.dialogPreview.panel.errNameRequired',
  namePattern: 'components.dialogPreview.panel.errNamePattern',
  nameDuplicate: 'components.dialogPreview.panel.errNameDuplicate',
  itemsEmptyRow: 'components.dialogPreview.panel.errItemsEmptyRow',
  itemsTilde: 'components.dialogPreview.panel.errItemsTilde',
};
const issueText = (t: TFunction, code: IssueCode | null) => (code ? t(ISSUE_KEY[code]) : null);

// ต้องอยู่ระดับ module — ประกาศในตัว PropertyPanel จะถูก remount ทุก render ทำให้ช่องที่พิมพ์อยู่เสียโฟกัสและร่าง
function Span({ xml, cols, k, span, onApply }: { xml: string; cols: number; k: string; span: number; onApply: (next: string) => void }) {
  const { t } = useI18n();
  if (cols === 1) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{t('components.dialogPreview.panel.colSpan')}</Label>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={span <= 1} aria-label={`${t('components.dialogPreview.panel.colSpan')} −`} onClick={() => onApply(setColSpan(xml, k, span - 1))}>
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-xs tabular-nums">{span}</span>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={span >= cols} aria-label={`${t('components.dialogPreview.panel.colSpan')} +`} onClick={() => onApply(setColSpan(xml, k, span + 1))}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface ControlFieldsProps {
  xml: string;
  k: string;
  side: Side;
  el: Element;
  nameWarn?: (v: string) => string | null;
  onApply: (next: string) => void;
}

/** ช่องของ control หนึ่งตัว (ไม่รวม Label/ColSpan) — ใช้ทั้ง field และแต่ละฝั่งของช่วง */
function ControlFields({ xml, k, side, el, nameWarn, onApply }: ControlFieldsProps) {
  const { t } = useI18n();
  const id = `${k}-${side ?? 'f'}`;
  const write = (patch: Record<string, string | null>) => onApply(setControlAttrs(xml, k, side, patch));
  const isLookup = el.tagName === 'Lookup';
  const items = split(el.getAttribute('Items'));
  const values = split(el.getAttribute('Values'));
  const [mode, setMode] = React.useState<'source' | 'list'>(el.hasAttribute('Items') || el.hasAttribute('Values') ? 'list' : 'source');
  return (
    <div className="space-y-3">
      <CommitInput
        id={`${id}-name`}
        label={t('components.dialogPreview.panel.name')}
        value={el.getAttribute('Name') ?? ''}
        validate={(v) => issueText(t, validateName(v, el))}
        warn={nameWarn}
        onCommit={(v) => write({ Name: v.trim() })}
      />
      {isLookup && (
        <div className="space-y-2">
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup">
            {(['source', 'list'] as const).map((m) => (
              <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'ghost'} className="h-6 px-2 text-[11px]" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {t(m === 'source' ? 'components.dialogPreview.panel.modeSource' : 'components.dialogPreview.panel.modeList')}
              </Button>
            ))}
          </div>
          {/* สลับโหมดเปลี่ยนแค่หน้าจอ — ค่าอีกฝั่งถูกลบตอนฝั่งใหม่เขียนค่าแรก จึงไม่มีช่วงที่ Lookup ไม่มีแหล่งข้อมูล */}
          {mode === 'source' ? (
            <CommitInput
              id={`${id}-ds`}
              label={t('components.dialogPreview.panel.dataSource')}
              value={el.getAttribute('DataSource') ?? ''}
              list={DATALIST_ID}
              warn={(v) => (dataSourceUnknown(v) ? t('components.dialogPreview.panel.warnUnknownDataSource') : null)}
              onCommit={(v) => write(v.trim() ? { DataSource: v.trim(), Items: null, Values: null } : { DataSource: null })}
            />
          ) : (
            <RowsEditor
              id={`${id}-rows`}
              items={items}
              values={values}
              validate={(rows) => issueText(t, validateRows(rows))}
              onCommit={(rows: Row[]) => write({ Items: rows.map((r) => r.item).join('~'), Values: rows.map((r) => r.value).join('~'), DataSource: null })}
            />
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={el.getAttribute('Multi') === 'true'} onChange={(e) => write({ Multi: e.target.checked ? 'true' : null })} />
            {t('components.dialogPreview.panel.multi')}
          </label>
        </div>
      )}
      {isLookup && mode === 'list' && values.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-value`} className="text-xs">
            {t('components.dialogPreview.panel.defaultValue')}
          </Label>
          <select
            id={`${id}-value`}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            value={el.getAttribute('Value') ?? ''}
            onChange={(e) => write({ Value: e.target.value || null })}
          >
            <option value="">{t('components.dialogPreview.panel.none')}</option>
            {values.map((v, i) => (
              <option key={`${v}-${i}`} value={v}>
                {items[i] ?? v}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <CommitInput
          id={`${id}-value`}
          label={t('components.dialogPreview.panel.defaultValue')}
          value={el.getAttribute('Value') ?? ''}
          hint={isLookup ? undefined : t('components.dialogPreview.panel.defaultDateHint')}
          onCommit={(v) => write({ Value: v.trim() || null })}
        />
      )}
    </div>
  );
}

const others = (el: Element) => Array.from(el.attributes).filter((a) => !KNOWN[el.tagName]?.has(a.name));

function Others({ els }: { els: Element[] }) {
  const { t } = useI18n();
  const list = els.flatMap(others);
  if (!list.length) return null;
  return (
    <div className="space-y-1 border-t pt-3">
      <p className="text-[11px] font-medium text-muted-foreground">{t('components.dialogPreview.panel.otherAttrs')}</p>
      <ul className="space-y-0.5 font-mono text-[11px]">
        {list.map((a, i) => (
          <li key={`${a.name}-${i}`} className="truncate" title={`${a.name}="${a.value}"`}>
            {a.name}="{a.value}"
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">{t('components.dialogPreview.panel.otherAttrsHint')}</p>
    </div>
  );
}

export function PropertyPanel({ xml, parsed, focusKey, onApply, onUngroup, onClose, className, panelRef }: PropertyPanelProps) {
  const { t } = useI18n();
  const f = findFocused(parsed.cells, focusKey);
  const cols = parsed.cols;

  let title = '';
  let body: React.ReactNode = <p className="text-xs text-muted-foreground">{t('components.dialogPreview.panel.empty')}</p>;
  if (f?.kind === 'field') {
    const el = f.cell.element;
    title = `${t(el.tagName === 'Date' ? 'components.dialogPreview.panel.kindDate' : 'components.dialogPreview.panel.kindLookup')} · ${el.getAttribute('Name') ?? ''}`;
    body = (
      <>
        <CommitInput id={`${f.cell.key}-label`} label={t('components.dialogPreview.panel.label')} value={f.cell.labelElement ? (f.cell.labelElement.getAttribute('Text') ?? '') : (el.getAttribute('Label') ?? '')} onCommit={(v) => onApply(setLabelText(xml, f.cell.key, undefined, v))} />
        <ControlFields key={`${f.cell.key}-f-${listKey(el)}`} xml={xml} k={f.cell.key} side={undefined} el={el} onApply={onApply} />
        {!f.inGroup && <Span xml={xml} cols={cols} k={f.cell.key} span={f.cell.layout.colSpan} onApply={onApply} />}
        <Others els={[el]} />
      </>
    );
  } else if (f?.kind === 'range') {
    const r = f.cell;
    const fromName = r.from.element.getAttribute('Name') ?? '';
    const toName = r.to.element.getAttribute('Name') ?? '';
    const splitWarn = (other: string, isFrom: boolean) => (v: string) =>
      rangeWillSplit(isFrom ? v.trim() : other, isFrom ? other : v.trim(), r.to.labelElement) ? t('components.dialogPreview.panel.warnRangeSplit') : null;
    const copySource = () => {
      const src = r.from.element;
      onApply(
        setControlAttrs(xml, r.key, 'to', {
          DataSource: src.getAttribute('DataSource'),
          Items: src.getAttribute('Items'),
          Values: src.getAttribute('Values'),
        }),
      );
    };
    title = `${t('components.dialogPreview.panel.kindRange')} · ${r.label}`;
    body = (
      <>
        <CommitInput id={`${r.key}-label`} label={t('components.dialogPreview.panel.rangeLabel')} value={r.from.labelElement?.getAttribute('Text') ?? ''} onCommit={(v) => onApply(setLabelText(xml, r.key, 'from', v))} />
        <section className="space-y-2">
          <h4 className="text-xs font-semibold">{t('components.dialogPreview.panel.from')}</h4>
          <ControlFields key={`${r.key}-from-${listKey(r.from.element)}`} xml={xml} k={r.key} side="from" el={r.from.element} nameWarn={splitWarn(toName, true)} onApply={onApply} />
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{t('components.dialogPreview.panel.to')}</h4>
            {r.from.element.tagName === 'Lookup' && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copySource}>
                {t('components.dialogPreview.panel.sameAsFrom')}
              </Button>
            )}
          </div>
          <ControlFields key={`${r.key}-to-${listKey(r.to.element)}`} xml={xml} k={r.key} side="to" el={r.to.element} nameWarn={splitWarn(fromName, false)} onApply={onApply} />
        </section>
        <Span xml={xml} cols={cols} k={r.key} span={r.layout.colSpan} onApply={onApply} />
        <Others els={[r.from.element, r.to.element]} />
      </>
    );
  } else if (f?.kind === 'group') {
    const g = f.cell;
    title = `${t('components.dialogPreview.panel.kindGroup')}${g.label ? ` · ${g.label}` : ''}`;
    body = (
      <>
        <CommitInput id={`${g.key}-heading`} label={t('components.dialogPreview.panel.heading')} value={g.label} onCommit={(v) => onApply(setGroupLabel(xml, g.key, v))} />
        <Span xml={xml} cols={cols} k={g.key} span={g.layout.colSpan} onApply={onApply} />
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUngroup(g.key)}>
          {t('components.dialogPreview.editor.ungroup')}
        </Button>
      </>
    );
  }

  return (
    // Esc ในแผง = ไม่ให้ลอยถึง window (KeyboardShortcuts ผูก Esc กับ Cancel ของหน้า) ครอบทุก control รวม select/checkbox/ปุ่ม
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()} ref={panelRef} aria-label={t('components.dialogPreview.panel.aria')} className={cn('space-y-3 rounded-md border bg-card p-3', className)}>
      <datalist id={DATALIST_ID}>
        {DATA_SOURCES.map((d) => (
          <option key={d.value} value={d.value} label={d.description} />
        ))}
      </datalist>
      {f && (
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold" title={title}>
            {title}
          </p>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={t('components.dialogPreview.panel.close')} onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {/* key = focusKey อย่างเดียว — ร่างที่พิมพ์ค้างไม่ข้ามไปอีก cell; โหมด Lookup รีเซ็ตด้วย key ของ ControlFields (listKey) ไม่ใช่ที่นี่ */}
      <div key={`${focusKey ?? ''}`} className="space-y-3">
        {body}
      </div>
    </aside>
  );
}
