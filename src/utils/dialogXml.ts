// Parser ของ Dialog XML ใน report template — กติกาเต็มอยู่ที่ docs/dialog-xml/README.md
// ต้องตีความให้ตรงกับ inventory (routes/report/list/parse-report-dialog.ts) — fixture ชุดเดียวกันคุมไว้

export const MAX_COLS = 4;
export const CONTROL_TAGS: ReadonlySet<string> = new Set(['Date', 'Lookup']);

export interface DialogLayout {
  colSpan: number;
}

export interface DialogField {
  key: string;
  label?: string;
  element: Element | null;
  layout: DialogLayout;
}

export type DialogCell =
  | ({ kind: 'field' } & DialogField)
  | { kind: 'range'; key: string; label: string; from: DialogField; to: DialogField; layout: DialogLayout }
  | { kind: 'group'; key: string; layout: DialogLayout; fields: DialogField[] };

export type DialogWarning =
  | { code: 'colsClamped' | 'colsInvalid'; raw: string; used: number }
  | { code: 'colSpanClamped' | 'colSpanInvalid'; raw: string; used: number; at: string }
  | { code: 'nestedGroupFlattened' | 'emptyGroup' | 'colSpanOnLabel'; at: string }
  | { code: 'unknownElement'; at: string; tag: string };

export interface DialogParseResult {
  ok: boolean;
  error?: 'empty' | 'parse' | 'noDialogRoot';
  errorDetail?: string;
  cols: number;
  cells: DialogCell[];
  counts: Record<string, number>;
  warnings: DialogWarning[];
}

interface Draft extends DialogField {
  hiddenLabel: boolean;
}

const INT = /^\s*\d+\s*$/;

const failure = (error: DialogParseResult['error'], errorDetail?: string): DialogParseResult => ({
  ok: false,
  error,
  errorDetail,
  cols: 1,
  cells: [],
  counts: {},
  warnings: [],
});

const describeEl = (el: Element, index: number): string =>
  el.getAttribute('Name') || el.getAttribute('Text') || `<${el.tagName}>#${index + 1}`;

function readCols(root: Element, warnings: DialogWarning[]): number {
  const raw = root.getAttribute('Cols');
  if (raw === null) return 1;
  const n = INT.test(raw) ? Number.parseInt(raw, 10) : 0;
  if (n < 1) {
    warnings.push({ code: 'colsInvalid', raw, used: 1 });
    return 1;
  }
  if (n > MAX_COLS) {
    warnings.push({ code: 'colsClamped', raw, used: MAX_COLS });
    return MAX_COLS;
  }
  return n;
}

function readSpan(el: Element, cols: number, at: string, warnings: DialogWarning[]): number {
  const raw = el.getAttribute('ColSpan');
  if (raw === null) return 1;
  const n = INT.test(raw) ? Number.parseInt(raw, 10) : 0;
  if (n < 1) {
    warnings.push({ code: 'colSpanInvalid', raw, used: 1, at });
    return 1;
  }
  if (n > cols) {
    warnings.push({ code: 'colSpanClamped', raw, used: cols, at });
    return cols;
  }
  return n;
}

/** Label + element ถัดไปที่ไม่ใช่ Label = หนึ่ง field (กติกาเดิมของ preview) */
function toDrafts(elements: Element[], cols: number, warnings: DialogWarning[], keyPrefix: string): Draft[] {
  const drafts: Draft[] = [];
  const control = (el: Element, index: number) => {
    const at = describeEl(el, index);
    if (!CONTROL_TAGS.has(el.tagName)) warnings.push({ code: 'unknownElement', at, tag: el.tagName });
    return { element: el, layout: { colSpan: readSpan(el, cols, at, warnings) } };
  };
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const key = `${keyPrefix}${i}`;
    if (el.tagName !== 'Label') {
      drafts.push({ key, label: undefined, hiddenLabel: false, ...control(el, i) });
      continue;
    }
    if (el.hasAttribute('ColSpan')) warnings.push({ code: 'colSpanOnLabel', at: describeEl(el, i) });
    const label = el.getAttribute('Text') || '';
    const hiddenLabel = el.getAttribute('Visible') === 'false';
    const next = elements[i + 1];
    if (next && next.tagName !== 'Label') {
      drafts.push({ key, label, hiddenLabel, ...control(next, i + 1) });
      i++;
    } else {
      drafts.push({ key, label, hiddenLabel, element: null, layout: { colSpan: 1 } });
    }
  }
  return drafts;
}

/** กติกาจับคู่ From/To เดียวกับ inventory (isToLabel / isNamedPair) */
function isRangePair(a: Draft, b: Draft | undefined): b is Draft {
  if (!b || !a.element || !b.element) return false;
  if (a.label === undefined || a.hiddenLabel || b.label === undefined) return false;
  const tag = a.element.tagName;
  if (!CONTROL_TAGS.has(tag) || b.element.tagName !== tag) return false;
  if (b.hiddenLabel || b.label === 'to') return true;
  const from = a.element.getAttribute('Name') || '';
  const to = b.element.getAttribute('Name') || '';
  return from.endsWith('From') && to === `${from.slice(0, -'From'.length)}To`;
}

const strip = (d: Draft): DialogField => ({ key: d.key, label: d.label, element: d.element, layout: d.layout });

function pairRanges(drafts: Draft[]): DialogCell[] {
  const cells: DialogCell[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const a = drafts[i];
    const b = drafts[i + 1];
    if (isRangePair(a, b)) {
      cells.push({ kind: 'range', key: a.key, label: a.label ?? '', from: strip(a), to: strip(b), layout: a.layout });
      i++;
    } else {
      cells.push({ kind: 'field', ...strip(a) });
    }
  }
  return cells;
}

function tally(cells: DialogCell[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (f: DialogField) => {
    if (f.element) counts[f.element.tagName] = (counts[f.element.tagName] || 0) + 1;
  };
  for (const c of cells) {
    if (c.kind === 'range') {
      add(c.from);
      add(c.to);
    } else if (c.kind === 'group') c.fields.forEach(add);
    else add(c);
  }
  return counts;
}

export function parseDialogXml(xml: string): DialogParseResult {
  if (!xml.trim()) return failure('empty');
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (e) {
    return failure('parse', e instanceof Error ? e.message : undefined);
  }
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return failure('parse', (parserError.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) || undefined);
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== 'Dialog') return failure('noDialogRoot');

  const warnings: DialogWarning[] = [];
  const cols = readCols(root, warnings);
  const cells: DialogCell[] = [];
  let run: Element[] = [];
  let runStart = 0;
  const flush = () => {
    if (run.length) cells.push(...pairRanges(toDrafts(run, cols, warnings, `${runStart}-`)));
    run = [];
  };
  Array.from(root.children).forEach((el, index) => {
    if (run.length === 0) runStart = index;
    run.push(el);
  });
  flush();

  return { ok: true, cols, cells, counts: tally(cells), warnings };
}
