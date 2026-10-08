// คำสั่งแก้ Dialog XML ของ editor แบบลากวาง — ทุกฟังก์ชันรับ string คืน string และไม่ throw
// แก้ DOM ตรงจุดแล้ว serialize กลับ เพื่อให้ attribute/comment/element ที่ไม่รู้จักอยู่ครบ
// กติกาเต็มอยู่ที่ docs/superpowers/specs/2026-10-08-dialog-layout-editor-design.md
import { CONTROL_TAGS, MAX_COLS, parseDialogDocument, type DialogCell } from './dialogXml';

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

/**
 * ตำแหน่งของ root ใน string: ข้าม <?…?>, <!--…-->, <!DOCTYPE…> ก่อนหน้าแบบไล่ทีละตัว
 * (regex หา "<Dialog" ตรง ๆ จะไปเจอในคอมเมนต์ได้) และหาจุดจบของ <Dialog/> แบบปิดในตัวด้วย
 */
function rootSpan(xml: string): { start: number; end: number } {
  let i = 0;
  for (;;) {
    while (i < xml.length && /\s/.test(xml[i])) i++;
    const close = xml.startsWith('<?', i) ? xml.indexOf('?>', i) + 2 : xml.startsWith('<!--', i) ? xml.indexOf('-->', i) + 3 : xml.startsWith('<!', i) ? xml.indexOf('>', i) + 1 : -1;
    if (close <= i) break;
    i = close;
  }
  const start = i;
  let quote = '';
  let j = start;
  for (; j < xml.length; j++) {
    const ch = xml[j];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') break;
  }
  if (xml[j - 1] === '/') return { start, end: j + 1 };
  const closeTag = xml.lastIndexOf('</Dialog>');
  return { start, end: closeTag >= 0 ? closeTag + '</Dialog>'.length : xml.length };
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
  const span = rootSpan(xml);
  return {
    root: doc.documentElement,
    cells: parsed.cells,
    cols: parsed.cols,
    prefix: xml.slice(0, span.start),
    suffix: xml.slice(span.end),
    eol: xml.includes('\r\n') ? '\r\n' : '\n',
  };
}

const save = (l: Loaded): string => l.prefix + new XMLSerializer().serializeToString(l.root) + l.suffix;

export function hasHiddenToLabel(cell: DialogCell): boolean {
  return cell.kind === 'range' && cell.to.labelElement?.getAttribute('Visible') === 'false';
}

// field ที่มี Label ในตัวไม่มี <Label> element — ย้ายแค่ control
const present = (nodes: (Element | null)[]): Element[] => nodes.filter((n): n is Element => n !== null);

function locate(l: Loaded, key: string): Located | null {
  for (const c of l.cells) {
    if (c.key === key) {
      if (c.kind === 'group') return { kind: 'group', nodes: [c.element], spanTarget: c.element, inGroup: null, hiddenTo: false };
      if (c.kind === 'range') {
        return {
          kind: 'range',
          nodes: present([c.from.labelElement, c.from.element, c.to.labelElement, c.to.element]),
          spanTarget: c.from.element,
          inGroup: null,
          hiddenTo: hasHiddenToLabel(c),
        };
      }
      return { kind: 'field', nodes: present([c.labelElement, c.element]), spanTarget: c.element, inGroup: null, hiddenTo: false };
    }
    if (c.kind === 'group') {
      const f = c.fields.find((x) => x.key === key);
      if (f) return { kind: 'field', nodes: present([f.labelElement, f.element]), spanTarget: f.element, inGroup: c.element, hiddenTo: false };
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
    // control ที่มี Label ในตัวไม่ใช่คู่ของ <Label> ข้างหน้า — ถ้ารวมบรรทัด XML จะดูเหมือนจับคู่ทั้งที่ไม่ได้จับ
    if (isEl(n, 'Label') && isEl(next) && next.tagName !== 'Label' && next.tagName !== 'Group' && !next.hasAttribute('Label')) {
      container.appendChild(next);
      i++;
    }
  }
  container.appendChild(doc.createTextNode(eol + '  '.repeat(depth - 1)));
}


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
  // ย้ายไปท้ายกล่องที่ตัวเองอยู่ท้ายสุดแล้ว = ไม่ได้ย้าย (กันการจัดช่องว่างใหม่ทำให้หน้า dirty เปล่า ๆ)
  if (ref === null && container === from) {
    let n = src.nodes[src.nodes.length - 1].nextSibling;
    while (n && n.nodeType === 3 && !(n.textContent ?? '').trim()) n = n.nextSibling;
    if (!n) return xml;
  }
  for (const node of src.nodes) container.insertBefore(node, ref);
  const touched = new Set<Element>([from, container]);
  // Group ที่ไม่เหลือ control แล้ว editor มองไม่เห็นอีก — ยกของที่เหลือ (comment, Label กำพร้า) ออกมาแทนการทิ้ง
  const hasControl = Array.from(from.getElementsByTagName('*')).some((e) => CONTROL_TAGS.has(e.tagName));
  if (from !== l.root && from.tagName === 'Group' && !hasControl) {
    const parent = from.parentElement as Element;
    while (from.firstChild) parent.insertBefore(from.firstChild, from);
    parent.removeChild(from);
    touched.delete(from);
    touched.add(parent);
  }
  touched.forEach((c) => relayout(c, l.eol));
  return save(l);
}

export function groupCells(xml: string, keys: string[]): string {
  const l = load(xml);
  const unique = Array.from(new Set(keys));
  if (!l || unique.length < 2) return xml;
  const found = unique.map((k) => locate(l, k));
  if (found.some((x) => !x || x.kind === 'group' || x.inGroup || x.hiddenTo)) return xml;
  const sorted = (found as Located[]).sort((a, b) =>
    a.nodes[0].compareDocumentPosition(b.nodes[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const group = l.root.ownerDocument.createElementNS(l.root.namespaceURI, 'Group');
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

export type Side = 'from' | 'to' | undefined;

/** control + ป้ายของ cell ที่แผง property กำลังแก้ — range ต้องระบุฝั่ง, field (รวมใน Group) ห้ามระบุ */
function controlOf(l: Loaded, key: string, side: Side): { control: Element; label: Element | null } | null {
  for (const c of l.cells) {
    if (c.key === key) {
      if (c.kind === 'range') {
        if (!side) return null;
        const f = side === 'from' ? c.from : c.to;
        return { control: f.element, label: f.labelElement };
      }
      return c.kind === 'field' && !side ? { control: c.element, label: c.labelElement } : null;
    }
    if (c.kind === 'group' && !side) {
      const f = c.fields.find((x) => x.key === key);
      if (f) return { control: f.element, label: f.labelElement };
    }
  }
  return null;
}

/** แก้ attribute ของ control ตรงจุด — null หรือ '' = ลบ attribute; ไม่จัดช่องว่างใหม่ */
export function setControlAttrs(xml: string, key: string, side: Side, patch: Record<string, string | null>): string {
  const l = load(xml);
  const t = l && controlOf(l, key, side);
  if (!l || !t) return xml;
  for (const [name, v] of Object.entries(patch)) {
    if (v === null || v === '') t.control.removeAttribute(name);
    else t.control.setAttribute(name, v);
  }
  return save(l);
}

/**
 * แก้ข้อความป้ายที่เดิมของมัน: <Label Text> หรือ Label= บน control — ไม่แปลงรูปแบบ (กฎ rollout ของ Label=)
 * ป้ายฝั่ง To ของช่วงคือสิ่งที่ทำให้จับคู่ จึงไม่ให้แก้; ป้ายในตัวที่ล้างทิ้งยังเหลือ Label="" — ลบออกจะกลายเป็น control เปล่าที่ inventory ทิ้ง
 */
export function setLabelText(xml: string, key: string, side: Side, text: string): string {
  if (side === 'to') return xml;
  const l = load(xml);
  const t = l && controlOf(l, key, side);
  if (!l || !t) return xml;
  if (t.label) t.label.setAttribute('Text', text);
  else t.control.setAttribute('Label', text);
  return save(l);
}

export function setGroupLabel(xml: string, groupKey: string, text: string): string {
  const l = load(xml);
  const g = l && locate(l, groupKey);
  if (!l || !g || g.kind !== 'group') return xml;
  const v = text.trim();
  if (v) g.nodes[0].setAttribute('Label', v);
  else g.nodes[0].removeAttribute('Label');
  return save(l);
}

export type NewFieldKind = 'date' | 'lookup' | 'dateRange' | 'lookupRange';

/** ค่าเริ่มต้นของ field ที่ editor สร้าง — ป้ายแบบ <Label> เดิม (Label= ใช้ไม่ได้จนกว่า inventory production รองรับ) */
export const NEW_FIELD_LABEL = 'New field';
/** Lookup ใหม่ต้องมีแหล่งข้อมูลตั้งแต่เขียนครั้งแรก — validateDataSource บังคับ และ XML ต้องไม่อยู่ในสภาพผิด */
export const NEW_LOOKUP_SOURCE = '@product_list';

/** เลข n ที่น้อยที่สุดที่ทุกชื่อที่จะสร้าง (ช่วง = ทั้ง From และ To) ยังไม่มี control ใดในเอกสารใช้ รวมใน Group */
function freeBase(root: Element, prefix: string, range: boolean): string {
  const used = new Set(
    Array.from(root.getElementsByTagName('*'))
      .filter((e) => CONTROL_TAGS.has(e.tagName))
      .map((e) => e.getAttribute('Name') ?? ''),
  );
  for (let n = 1; ; n++) {
    const base = `${prefix}${n}`;
    if ((range ? [`${base}From`, `${base}To`] : [base]).every((x) => !used.has(x))) return base;
  }
}

/**
 * เพิ่ม field ต่อหลัง cell afterKey (null = ท้าย Dialog) — field ใน Group: field เดี่ยวเข้ากลุ่ม ช่วงไปต่อหลังกลุ่ม
 * ช่วงที่สร้างจับคู่ได้ทั้งป้าย "to" และชื่อคู่ XFrom/XTo ผู้เขียนแก้อย่างใดอย่างหนึ่งทีหลังก็ยังเป็นช่วงเดียว
 */
export function insertField(xml: string, afterKey: string | null, kind: NewFieldKind): { xml: string; name: string | null } {
  const none = { xml, name: null };
  const l = load(xml);
  if (!l) return none;
  const range = kind === 'dateRange' || kind === 'lookupRange';
  const tag = kind === 'date' || kind === 'dateRange' ? 'Date' : 'Lookup';
  let parent: Element = l.root;
  let ref: Node | null = null;
  if (afterKey !== null) {
    const at = locate(l, afterKey);
    if (!at) return none;
    const anchor = range && at.inGroup ? at.inGroup : at.nodes[at.nodes.length - 1];
    parent = anchor.parentElement as Element;
    ref = anchor.nextSibling;
  }
  const doc = l.root.ownerDocument;
  const make = (name: string, attrs: Record<string, string>) => {
    const el = doc.createElementNS(l.root.namespaceURI, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const control = (name: string) => make(tag, tag === 'Lookup' ? { Name: name, DataSource: NEW_LOOKUP_SOURCE } : { Name: name });
  const base = freeBase(l.root, tag, range);
  const name = range ? `${base}From` : base;
  const nodes = [make('Label', { Text: NEW_FIELD_LABEL }), control(name)];
  if (range) nodes.push(make('Label', { Text: 'to' }), control(`${base}To`));
  for (const n of nodes) parent.insertBefore(n, ref);
  relayout(parent, l.eol);
  return { xml: save(l), name };
}

/** ลบ cell ทั้งก้อน (field = ป้าย + control, ช่วง = 4 โหนด, กลุ่ม = ทั้งกล่อง) — field สุดท้ายในกลุ่มพากลุ่มเปล่าออกไปด้วย */
export function deleteCell(xml: string, key: string): string {
  const l = load(xml);
  const at = l && locate(l, key);
  if (!l || !at) return xml;
  const parent = at.nodes[0].parentElement as Element;
  for (const n of at.nodes) n.parentNode?.removeChild(n);
  if (at.inGroup && at.inGroup.children.length === 0) {
    at.inGroup.parentNode?.removeChild(at.inGroup);
    relayout(l.root, l.eol);
  } else relayout(parent, l.eol);
  return save(l);
}

/** key ของ cell ที่ control ชื่อนี้อยู่ (ช่วง = ชื่อฝั่ง From) — key อิงตำแหน่ง หลังเพิ่ม field จึงต้องหาใหม่จากชื่อ */
export function keyOfName(cells: DialogCell[], name: string): string | null {
  for (const c of cells) {
    if (c.kind === 'group') {
      const f = c.fields.find((x) => x.element.getAttribute('Name') === name);
      if (f) return f.key;
    } else if ((c.kind === 'range' ? c.from.element : c.element).getAttribute('Name') === name) return c.key;
  }
  return null;
}

export function containerMap(cells: DialogCell[]): ContainerMap {
  const groups: Record<string, string[]> = {};
  for (const c of cells) if (c.kind === 'group') groups[c.key] = c.fields.map((f) => f.key);
  return { dialog: cells.map((c) => c.key), groups };
}

/** แปลงผลการลากของ dnd-kit (active, over) เป็นเป้าหมายของ moveCell — ลากลงในกล่องเดิม = วางหลังตัวที่ทับ */
export function dropTarget(map: ContainerMap, activeKey: string, overId: string): MoveTarget | null {
  if (overId === activeKey) return null;
  // closestCenter ชนกับกล่อง Group ที่ตัวเองอยู่ได้ง่าย (ศูนย์กลางใกล้กัน) — วางลงกล่องตัวเองไม่ใช่การย้ายออก
  const ownGroup = Object.entries(map.groups).find(([, list]) => list.includes(activeKey))?.[0];
  if (ownGroup && overId === ownGroup) return null;
  // Group ลากไปทับ field หรือช่องท้ายของตัวเอง = ไม่ย้าย
  const ownFields = map.groups[activeKey];
  if (ownFields && (ownFields.includes(overId) || overId === `end:${activeKey}`)) return null;
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
