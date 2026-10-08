// Parser ของ Dialog XML ใน report template — กติกาเต็มอยู่ที่ docs/dialog-xml/README.md
// ต้องตีความให้ตรงกับ inventory (routes/report/list/parse-report-dialog.ts) — fixture ชุดเดียวกันคุมไว้

export const MAX_COLS = 4;
export const CONTROL_TAGS: ReadonlySet<string> = new Set(['Date', 'Lookup']);

export interface DialogLayout {
  colSpan: number;
}

export interface DialogField {
  key: string;
  label: string;
  element: Element;
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
  | { code: 'unknownElement'; at: string; tag: string }
  | { code: 'labelWithoutControl' | 'controlWithoutLabel'; at: string };

export interface DialogParseResult {
  ok: boolean;
  error?: 'empty' | 'parse' | 'noDialogRoot';
  errorDetail?: string;
  cols: number;
  cells: DialogCell[];
  counts: Record<string, number>;
  warnings: DialogWarning[];
}

// ลำดับของ Label / control หลังตัด element ที่ inventory ไม่รู้จักทิ้ง — เทียบเท่า DialogNode ของ inventory
type DialogNode =
  | { type: 'label'; text: string; visible: boolean; at: string }
  | { type: 'control'; key: string; tag: string; name: string; element: Element; layout: DialogLayout; at: string };

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

function toNodes(elements: Element[], cols: number, warnings: DialogWarning[], keyPrefix: string): DialogNode[] {
  const nodes: DialogNode[] = [];
  elements.forEach((el, i) => {
    const at = describeEl(el, i);
    if (el.tagName === 'Label') {
      if (el.hasAttribute('ColSpan')) warnings.push({ code: 'colSpanOnLabel', at });
      nodes.push({ type: 'label', text: el.getAttribute('Text') || '', visible: el.getAttribute('Visible') !== 'false', at });
    } else if (CONTROL_TAGS.has(el.tagName)) {
      nodes.push({
        type: 'control',
        key: `${keyPrefix}${i}`,
        tag: el.tagName,
        name: el.getAttribute('Name') || '',
        element: el,
        layout: { colSpan: readSpan(el, cols, at, warnings) },
        at,
      });
    } else {
      // inventory ไม่รู้จัก element นี้และตัดทิ้งก่อนจับคู่ — preview ต้องตัดเหมือนกัน
      warnings.push({ code: 'unknownElement', at, tag: el.tagName });
    }
  });
  return nodes;
}

type ControlNode = Extract<DialogNode, { type: 'control' }>;

const isControl = (n: DialogNode | undefined): n is ControlNode => n?.type === 'control';

// isToLabel / isNamedPair ของ inventory (parse-report-dialog.ts) ทีละบรรทัด
const isToLabel = (n: DialogNode | undefined) => n?.type === 'label' && (!n.visible || n.text === 'to');

const isNamedPair = (from: ControlNode, to: DialogNode | undefined) =>
  isControl(to) && to.tag === from.tag && from.name.endsWith('From') && to.name === `${from.name.slice(0, -'From'.length)}To`;

const toField = (label: string, c: ControlNode): DialogField => ({ key: c.key, label, element: c.element, layout: c.layout });

/**
 * กติกาเดียวกับ groupFields ของ inventory ทุกข้อ: cell ต้องเริ่มด้วย Label ที่มองเห็น ตามด้วย control
 * ส่วนที่ inventory ทิ้ง (Label ไม่มี control, control ไม่มี Label) ไม่ถูกวาด แต่ขึ้นคำเตือนแทน
 */
function groupNodes(nodes: DialogNode[], pairRanges: boolean, warnings: DialogWarning[]): DialogCell[] {
  const cells: DialogCell[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (node.type !== 'label' || !node.visible) {
      if (node.type === 'control') warnings.push({ code: 'controlWithoutLabel', at: node.at });
      i++;
      continue;
    }
    const next = nodes[i + 1];
    if (!isControl(next)) {
      warnings.push({ code: 'labelWithoutControl', at: node.text || node.at });
      i++;
      continue;
    }
    const after = nodes[i + 2];
    const to = nodes[i + 3];
    const isPaired = (isToLabel(after) && isControl(to)) || (after?.type === 'label' && isNamedPair(next, to));
    if (pairRanges && isPaired && isControl(to)) {
      cells.push({
        kind: 'range',
        key: next.key,
        label: node.text,
        from: toField(node.text, next),
        to: toField(after?.type === 'label' ? after.text : '', to),
        layout: next.layout,
      });
      i += 4;
    } else {
      cells.push({ kind: 'field', ...toField(node.text, next) });
      i += 2;
    }
  }
  return cells;
}

function tally(cells: DialogCell[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (f: DialogField) => {
    counts[f.element.tagName] = (counts[f.element.tagName] || 0) + 1;
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

/** Group ซ้อนไม่รองรับ — ยกลูกขึ้นมาแทนที่ (field ไม่หาย) และเตือนผู้เขียน */
function groupChildren(group: Element, at: string, warnings: DialogWarning[]): Element[] {
  return Array.from(group.children).flatMap((c) => {
    if (c.tagName !== 'Group') return [c];
    warnings.push({ code: 'nestedGroupFlattened', at });
    return groupChildren(c, at, warnings);
  });
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
    if (run.length) cells.push(...groupNodes(toNodes(run, cols, warnings, `${runStart}-`), true, warnings));
    run = [];
  };
  Array.from(root.children).forEach((el, index) => {
    if (el.tagName !== 'Group') {
      if (run.length === 0) runStart = index;
      run.push(el);
      return;
    }
    flush();
    const at = `<Group>#${index + 1}`;
    const fields = groupNodes(toNodes(groupChildren(el, at, warnings), cols, warnings, `${index}-`), false, warnings).flatMap(
      (c) => (c.kind === 'field' ? [{ key: c.key, label: c.label, element: c.element, layout: c.layout }] : []),
    );
    if (fields.length === 0) {
      warnings.push({ code: 'emptyGroup', at });
      return;
    }
    cells.push({
      kind: 'group',
      key: `g${index}`,
      layout: { colSpan: readSpan(el, cols, at, warnings) },
      fields,
    });
  });
  flush();

  return { ok: true, cols, cells, counts: tally(cells), warnings };
}
