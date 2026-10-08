// คำสั่งแก้ Dialog XML ของ editor แบบลากวาง — ทุกฟังก์ชันรับ string คืน string และไม่ throw
// แก้ DOM ตรงจุดแล้ว serialize กลับ เพื่อให้ attribute/comment/element ที่ไม่รู้จักอยู่ครบ
// กติกาเต็มอยู่ที่ docs/superpowers/specs/2026-10-08-dialog-layout-editor-design.md
import { MAX_COLS, parseDialogDocument, type DialogCell } from './dialogXml';

export type MoveTarget = { before: string } | { end: string };

export interface ContainerMap {
  dialog: string[];
  groups: Record<string, string[]>;
}

interface Loaded {
  root: Element;
  cells: DialogCell[];
  cols: number;
  prefix: string;
  suffix: string;
  eol: string;
}

interface Located {
  kind: 'field' | 'range' | 'group';
  nodes: Element[];
  spanTarget: Element;
  inGroup: Element | null;
  hiddenTo: boolean;
}

function load(xml: string): Loaded | null {
  if (!xml.trim()) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  if (doc.querySelector('parsererror')) return null;
  const parsed = parseDialogDocument(doc);
  if (!parsed.ok) return null;
  const start = xml.search(/<Dialog[\s/>]/);
  const close = xml.lastIndexOf('</Dialog>');
  return {
    root: doc.documentElement,
    cells: parsed.cells,
    cols: parsed.cols,
    prefix: start > 0 ? xml.slice(0, start) : '',
    suffix: close >= 0 ? xml.slice(close + '</Dialog>'.length) : (xml.match(/\s*$/)?.[0] ?? ''),
    eol: xml.includes('\r\n') ? '\r\n' : '\n',
  };
}

const save = (l: Loaded): string => l.prefix + new XMLSerializer().serializeToString(l.root) + l.suffix;

export function hasHiddenToLabel(cell: DialogCell): boolean {
  return cell.kind === 'range' && cell.to.labelElement.getAttribute('Visible') === 'false';
}

function locate(l: Loaded, key: string): Located | null {
  for (const c of l.cells) {
    if (c.key === key) {
      if (c.kind === 'group') return { kind: 'group', nodes: [c.element], spanTarget: c.element, inGroup: null, hiddenTo: false };
      if (c.kind === 'range') {
        return {
          kind: 'range',
          nodes: [c.from.labelElement, c.from.element, c.to.labelElement, c.to.element],
          spanTarget: c.from.element,
          inGroup: null,
          hiddenTo: hasHiddenToLabel(c),
        };
      }
      return { kind: 'field', nodes: [c.labelElement, c.element], spanTarget: c.element, inGroup: null, hiddenTo: false };
    }
    if (c.kind === 'group') {
      const f = c.fields.find((x) => x.key === key);
      if (f) return { kind: 'field', nodes: [f.labelElement, f.element], spanTarget: f.element, inGroup: c.element, hiddenTo: false };
    }
  }
  return null;
}

const isEl = (n: Node | undefined, tag?: string): n is Element =>
  !!n && n.nodeType === 1 && (tag === undefined || (n as Element).tagName === tag);

const depthOf = (el: Element): number => {
  let d = 1;
  for (let p = el.parentElement; p; p = p.parentElement) d++;
  return d;
};

/** จัดช่องว่างใหม่ใน container: Label + control บรรทัดเดียวกัน คู่ละบรรทัด โหนดอื่นบรรทัดของตัวเอง */
function relayout(container: Element, eol: string): void {
  const kids = Array.from(container.childNodes).filter((n) => !(n.nodeType === 3 && !(n.textContent ?? '').trim()));
  while (container.firstChild) container.removeChild(container.firstChild);
  if (kids.length === 0) return;
  const depth = depthOf(container);
  const doc = container.ownerDocument;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    const next = kids[i + 1];
    container.appendChild(doc.createTextNode(eol + '  '.repeat(depth)));
    container.appendChild(n);
    if (isEl(n, 'Label') && isEl(next) && next.tagName !== 'Label' && next.tagName !== 'Group') {
      container.appendChild(next);
      i++;
    }
  }
  container.appendChild(doc.createTextNode(eol + '  '.repeat(depth - 1)));
}

const hasContent = (el: Element) =>
  Array.from(el.childNodes).some((n) => !(n.nodeType === 3 && !(n.textContent ?? '').trim()));

export function setCols(xml: string, n: number): string {
  const l = load(xml);
  if (!l) return xml;
  const v = Math.max(1, Math.min(MAX_COLS, Math.round(n)));
  if (v === 1) l.root.removeAttribute('Cols');
  else l.root.setAttribute('Cols', String(v));
  return save(l);
}

export function setColSpan(xml: string, key: string, n: number): string {
  const l = load(xml);
  const target = l && locate(l, key);
  if (!l || !target) return xml;
  const v = Math.max(1, Math.min(l.cols, Math.round(n)));
  if (v === 1) target.spanTarget.removeAttribute('ColSpan');
  else target.spanTarget.setAttribute('ColSpan', String(v));
  return save(l);
}

export function moveCell(xml: string, key: string, target: MoveTarget): string {
  const l = load(xml);
  const src = l && locate(l, key);
  if (!l || !src) return xml;
  let container: Element;
  let ref: Element | null;
  if ('before' in target) {
    if (target.before === key) return xml;
    const dst = locate(l, target.before);
    if (!dst || (src.kind === 'group' && dst.inGroup)) return xml;
    ref = dst.nodes[0];
    container = ref.parentElement as Element;
  } else if (target.end === 'dialog') {
    container = l.root;
    ref = null;
  } else {
    const g = locate(l, target.end);
    if (!g || g.kind !== 'group' || src.kind === 'group') return xml;
    container = g.nodes[0];
    ref = null;
  }
  if (src.hiddenTo && container !== l.root) return xml;
  const from = src.nodes[0].parentElement as Element;
  for (const node of src.nodes) container.insertBefore(node, ref);
  const touched = new Set<Element>([from, container]);
  if (from !== l.root && from.tagName === 'Group' && !hasContent(from)) {
    from.parentElement?.removeChild(from);
    touched.delete(from);
    touched.add(l.root);
  }
  touched.forEach((c) => relayout(c, l.eol));
  return save(l);
}

export function groupCells(xml: string, keys: string[]): string {
  const l = load(xml);
  const unique = [...new Set(keys)];
  if (!l || unique.length < 2) return xml;
  const found = unique.map((k) => locate(l, k));
  if (found.some((x) => !x || x.kind === 'group' || x.inGroup || x.hiddenTo)) return xml;
  const sorted = (found as Located[]).sort((a, b) =>
    a.nodes[0].compareDocumentPosition(b.nodes[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const group = l.root.ownerDocument.createElement('Group');
  l.root.insertBefore(group, sorted[0].nodes[0]);
  for (const x of sorted) for (const node of x.nodes) group.appendChild(node);
  relayout(group, l.eol);
  relayout(l.root, l.eol);
  return save(l);
}

export function ungroup(xml: string, groupKey: string): string {
  const l = load(xml);
  const g = l && locate(l, groupKey);
  if (!l || !g || g.kind !== 'group') return xml;
  const el = g.nodes[0];
  const parent = el.parentElement as Element;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  relayout(l.root, l.eol);
  return save(l);
}

export function containerMap(cells: DialogCell[]): ContainerMap {
  const groups: Record<string, string[]> = {};
  for (const c of cells) if (c.kind === 'group') groups[c.key] = c.fields.map((f) => f.key);
  return { dialog: cells.map((c) => c.key), groups };
}

/** แปลงผลการลากของ dnd-kit (active, over) เป็นเป้าหมายของ moveCell — ลากลงในกล่องเดิม = วางหลังตัวที่ทับ */
export function dropTarget(map: ContainerMap, activeKey: string, overId: string): MoveTarget | null {
  if (overId === activeKey) return null;
  if (overId.startsWith('end:')) return { end: overId.slice('end:'.length) };
  const listOf = (k: string): [string, string[]] | null => {
    if (map.dialog.includes(k)) return ['dialog', map.dialog];
    for (const [g, list] of Object.entries(map.groups)) if (list.includes(k)) return [g, list];
    return null;
  };
  const src = listOf(activeKey);
  const dst = listOf(overId);
  if (!src || !dst) return null;
  if (src[0] === dst[0]) {
    const list = dst[1];
    const a = list.indexOf(activeKey);
    const o = list.indexOf(overId);
    if (a < o) {
      const next = list[o + 1];
      return next ? { before: next } : { end: dst[0] };
    }
  }
  return { before: overId };
}
