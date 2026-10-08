# Dialog Layout Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let template authors arrange a report filter dialog's layout (order, `Cols`, `ColSpan`, `<Group>`) by drag and drop on the Preview tab, writing the result back into the dialog XML.

**Architecture:** A pure module `src/utils/dialogXmlEdit.ts` turns each user action into `xml → xml`. It parses with the existing `dialogXml.ts` parser on a shared `Document`, mutates the nodes the cells reference, and serializes with `XMLSerializer`. The editor UI (dnd-kit) holds no XML of its own: it calls `onChange(newXml)`, which flows through the page's existing `handleXmlChange('dialog')`.

**Tech Stack:** React 19 + TypeScript, `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`, Vitest (jsdom), Tailwind literal class tables.

**Spec:** `docs/superpowers/specs/2026-10-08-dialog-layout-editor-design.md`

## Global Constraints

- Repo: `carmen-platform` only. Branch `feature/dialog-layout-editor` (already exists, holds the spec). Never commit to `main`.
- Tests: write tests **only** for `src/utils/dialogXmlEdit.ts` and the parser change (user choice A). No component tests.
- Every edit op is `(xml: string, …) => string` and returns the input unchanged on bad XML, missing `<Dialog>`, unknown key, or a disallowed move. It never throws.
- Attribute-only ops never change whitespace. Move ops re-layout only the containers they touch: Label + control on one line, one pair per line, 2-space indent in `<Dialog>`, 4 in `<Group>`. Text before `<Dialog` and after `</Dialog>` is preserved verbatim; line endings follow the input (`\r\n` if present, else `\n`).
- `Cols` 1 and `ColSpan` 1 are written by **removing** the attribute.
- A range whose To label is `Visible="false"` cannot be moved into or grouped into a `<Group>` (inside a group that control would lose its label and inventory would drop it). The op returns the input; the UI disables the checkbox.
- Never modify `src/components/ui/`. New strings go into **both** `src/i18n/en.ts` and `src/i18n/th.ts`.
- Tailwind classes only from literal tables (`GRID_COLS`, `COL_SPAN`, `CANVAS_W`).
- Dependencies: exactly `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2`. Update **both** `bun.lock` and `package-lock.json`. Never run `npm ci` inside the repo (it rewrites the bun tree).
- Static checks before every commit: `bun run typecheck && bun run lint`.
- Run tests with `bunx vitest run <path>`.

## Review Focus

1. **Chrome's `XMLSerializer` differs from jsdom's** (attribute quoting, self-closing form, `xmlns=""`). Every editor action would then reformat the whole template. → Task 9 step runs a no-op round trip of all 18 real templates in Chrome.
2. **Esc pressed to cancel a keyboard drag also cancels the page edit.** Both listeners sit on `window`; their order is not guaranteed. → Task 8 defers clearing the drag flag to the next tick; Task 9 verifies in the browser.
3. **A drag that lands where it started.** It must not rewrite the XML or mark the page dirty. → Task 2 test `move before itself is a no-op`; Task 6 skips `onChange` when the string is unchanged.
4. **Selection after the XML changes from the XML tab.** Stale keys could group the wrong cells. → Task 7 derives the selection from the current XML string, so any change clears it.
5. **A comment or unknown element sitting between a cell's nodes.** Moving the cell must not carry it along or drop it. → Task 2 test `comments and unknown elements stay in place`.

---

### Task 1: Parser exposes label and group nodes; parse an existing document

**Files:**
- Modify: `src/utils/dialogXml.ts`
- Modify: `src/utils/dialogXml.test.ts` (append)

**Interfaces:**
- Produces:

```ts
export interface DialogField { key: string; label: string; element: Element; labelElement: Element; layout: DialogLayout }
// group cell gains: element: Element   (the <Group>)
export function parseDialogDocument(doc: Document): DialogParseResult;
export function parseDialogXml(xml: string): DialogParseResult; // unchanged behaviour
```

- [ ] **Step 1: Write the failing tests** — append inside the `describe` in `src/utils/dialogXml.test.ts`:

```ts
  it('exposes the label node of every field and both ends of a range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="Date From"/><Date Name="DateFrom"/><Label Text="to" Visible="false"/><Date Name="DateTo"/><Label Text="S"/><Lookup Name="S"/></Dialog>',
    );
    const [range, single] = r.cells;
    if (range.kind !== 'range' || single.kind !== 'field') throw new Error('unexpected cells');
    expect(range.from.labelElement.getAttribute('Text')).toBe('Date From');
    expect(range.to.labelElement.getAttribute('Visible')).toBe('false');
    expect(single.labelElement.getAttribute('Text')).toBe('S');
  });

  it('exposes the <Group> element and its fields’ label nodes', () => {
    const r = parseDialogXml('<Dialog><Group ColSpan="1"><Label Text="A"/><Date Name="A"/></Group></Dialog>');
    const g = r.cells[0];
    if (g.kind !== 'group') throw new Error('expected group');
    expect(g.element.tagName).toBe('Group');
    expect(g.fields[0].labelElement.getAttribute('Text')).toBe('A');
  });

  it('parseDialogDocument returns cells that point into the given document', () => {
    const doc = new DOMParser().parseFromString('<Dialog><Label Text="A"/><Date Name="A"/></Dialog>', 'application/xml');
    const r = parseDialogDocument(doc);
    const c = r.cells[0];
    if (c.kind !== 'field') throw new Error('expected field');
    expect(c.element.ownerDocument).toBe(doc);
    expect(r.ok).toBe(true);
  });
```

Change the import line to `import { parseDialogDocument, parseDialogXml } from './dialogXml';`.

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/utils/dialogXml.test.ts`
Expected: FAIL — `parseDialogDocument` is not exported; `labelElement` undefined.

- [ ] **Step 3: Implement** in `src/utils/dialogXml.ts`:

(a) `DialogField` gains `labelElement: Element;` after `element: Element;`. The group variant of `DialogCell` becomes:

```ts
  | { kind: 'group'; key: string; element: Element; layout: DialogLayout; fields: DialogField[] };
```

(b) The label variant of `DialogNode` gains `element: Element`:

```ts
  | { type: 'label'; text: string; visible: boolean; at: string; element: Element }
```
and in `toNodes` the label push becomes:
```ts
      nodes.push({ type: 'label', text: el.getAttribute('Text') || '', visible: el.getAttribute('Visible') !== 'false', at, element: el });
```

(c) Replace `toField` with:

```ts
const toField = (label: Extract<DialogNode, { type: 'label' }>, c: ControlNode): DialogField => ({
  key: c.key,
  label: label.text,
  element: c.element,
  labelElement: label.element,
  layout: c.layout,
});
```

and in `groupNodes` replace the range/field pushes with:

```ts
    if (pairRanges && isPaired && isControl(to) && after?.type === 'label') {
      cells.push({
        kind: 'range',
        key: next.key,
        label: node.text,
        from: toField(node, next),
        to: toField(after, to),
        layout: next.layout,
      });
      i += 4;
    } else {
      cells.push({ kind: 'field', ...toField(node, next) });
      i += 2;
    }
```
(`isPaired` already implies `after` is a label in both branches; the extra check narrows the type.)

(d) Split `parseDialogXml`: everything from `const root = doc.documentElement;` to the final `return` moves into

```ts
export function parseDialogDocument(doc: Document): DialogParseResult {
  const root = doc.documentElement;
  if (!root || root.tagName !== 'Dialog') return failure('noDialogRoot');
  // …existing body unchanged, except the two edits below…
}
```
and `parseDialogXml` ends with `return parseDialogDocument(doc);` after its `parsererror` check.

Inside the moved body, the group field mapping becomes
```ts
      (c) => (c.kind === 'field' ? [{ key: c.key, label: c.label, element: c.element, labelElement: c.labelElement, layout: c.layout }] : []),
```
and the group push gains `element: el,` after `key: \`g${index}\`,`.

- [ ] **Step 4: Run all parser tests**

Run: `bunx vitest run src/utils/dialogXml`
Expected: PASS — 39 fixtures + 12 unit tests (fixture behaviour unchanged).

- [ ] **Step 5: Static checks + commit**

```bash
bun run typecheck && bun run lint
git add src/utils/dialogXml.ts src/utils/dialogXml.test.ts
git commit -m "refactor(report-templates): expose Dialog label/group nodes and parse a given document"
```

`DialogPreview.tsx` type-checks unchanged (it only reads `label`, `element`, `layout`, `fields`).

---

### Task 2: `dialogXmlEdit.ts` — edit operations

**Files:**
- Create: `src/utils/dialogXmlEdit.ts`
- Create: `src/utils/dialogXmlEdit.test.ts`

**Interfaces:**
- Consumes: `parseDialogDocument`, `MAX_COLS`, `DialogCell`, `DialogField` (Task 1).
- Produces (used by Tasks 5–7):

```ts
export type MoveTarget = { before: string } | { end: string }; // end: 'dialog' or a group key
export interface ContainerMap { dialog: string[]; groups: Record<string, string[]> }
export function setCols(xml: string, n: number): string;
export function setColSpan(xml: string, key: string, n: number): string;
export function moveCell(xml: string, key: string, target: MoveTarget): string;
export function groupCells(xml: string, keys: string[]): string;
export function ungroup(xml: string, groupKey: string): string;
export function hasHiddenToLabel(cell: DialogCell): boolean;
export function containerMap(cells: DialogCell[]): ContainerMap;
export function dropTarget(map: ContainerMap, activeKey: string, overId: string): MoveTarget | null;
```

- [ ] **Step 1: Write the failing tests** — `src/utils/dialogXmlEdit.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogXml, type DialogCell } from './dialogXml';
import {
  containerMap,
  dropTarget,
  groupCells,
  moveCell,
  setColSpan,
  setCols,
  ungroup,
} from './dialogXmlEdit';

// jsdom ทำให้ import.meta.url เป็น http:// — ใช้ dirname ของไฟล์แทน
const FX = join(import.meta.dirname, '../../docs/dialog-xml/fixtures/');
const read = (name: string) => readFileSync(`${FX}${name}.xml`, 'utf8');
const cellsOf = (xml: string) => parseDialogXml(xml).cells;
const keysOf = (xml: string) => cellsOf(xml).map((c) => c.key);
const nameOf = (c: DialogCell): string => {
  if (c.kind === 'range') return `range:${c.from.element.getAttribute('Name')},${c.to.element.getAttribute('Name')}`;
  if (c.kind === 'group') return `group:${c.fields.map((f) => f.element.getAttribute('Name')).join(',')}`;
  return c.element.getAttribute('Name') ?? '';
};
const shape = (xml: string) => cellsOf(xml).map(nameOf);

const SIMPLE = `<Dialog Cols="2">
  <Label Text="Date From"/><Date Name="DateFrom"/>
  <Label Text="Date To"/><Date Name="DateTo"/>
  <Label Text="Status"/><Lookup Name="Status" Items="A" Values="A"/>
</Dialog>`;

describe('setCols', () => {
  it('adds Cols and removes it again at 1, leaving everything else byte-identical', () => {
    const x = read('real-Inventory_Balance_Report');
    const two = setCols(x, 2);
    expect(two).toBe(x.replace('<Dialog>', '<Dialog Cols="2">'));
    expect(setCols(two, 1)).toBe(x);
  });

  it('clamps to 1..4', () => {
    expect(setCols(SIMPLE, 9)).toContain('<Dialog Cols="4">');
    expect(setCols(SIMPLE, 0)).not.toContain('Cols=');
  });
});

describe('setColSpan', () => {
  it('writes ColSpan on a range’s From control and removes it at 1', () => {
    const [rangeKey] = keysOf(SIMPLE);
    const out = setColSpan(SIMPLE, rangeKey, 2);
    expect(out).toContain('<Date Name="DateFrom" ColSpan="2"/>');
    expect(setColSpan(out, rangeKey, 1)).toBe(SIMPLE);
  });

  it('clamps to the dialog’s Cols', () => {
    const [, statusKey] = keysOf(SIMPLE);
    expect(setColSpan(SIMPLE, statusKey, 7)).toContain('<Lookup Name="Status" Items="A" Values="A" ColSpan="2"/>');
  });
});

describe('moveCell', () => {
  const reals = readdirSync(FX)
    .filter((f) => f.startsWith('real-') && f.endsWith('.xml'))
    .map((f) => f.replace(/\.xml$/, ''));

  it.each(reals)('%s: moving the first cell to the end and back restores the original bytes', (name) => {
    const x = read(name);
    const keys = keysOf(x);
    if (keys.length < 2) return;
    const moved = moveCell(x, keys[0], { end: 'dialog' });
    expect(shape(moved)).toEqual([...shape(x).slice(1), shape(x)[0]]);
    const mk = keysOf(moved);
    expect(moveCell(moved, mk[mk.length - 1], { before: mk[0] })).toBe(x);
  });

  it('move before itself is a no-op', () => {
    const [k] = keysOf(SIMPLE);
    expect(moveCell(SIMPLE, k, { before: k })).toBe(SIMPLE);
  });

  it('comments and unknown elements stay in place', () => {
    const x = `<Dialog>
  <!-- c -->
  <Label Text="A"/><Date Name="A"/>
  <Spacer/>
  <Label Text="B"/><Date Name="B"/>
</Dialog>`;
    const [a, b] = keysOf(x);
    expect(moveCell(x, b, { before: a })).toBe(`<Dialog>
  <!-- c -->
  <Label Text="B"/><Date Name="B"/>
  <Label Text="A"/><Date Name="A"/>
  <Spacer/>
</Dialog>`);
  });

  it('a group cannot move into a group', () => {
    const x = `<Dialog Cols="2">
  <Group>
    <Label Text="A"/><Date Name="A"/>
  </Group>
  <Group>
    <Label Text="B"/><Date Name="B"/>
  </Group>
</Dialog>`;
    const [g1, g2] = keysOf(x);
    expect(moveCell(x, g1, { end: g2 })).toBe(x);
  });

  it('removes a group once its last field moves out', () => {
    let x = read('group-basic');
    for (let i = 0; i < 2; i++) {
      const g = cellsOf(x)[0];
      if (g.kind !== 'group') throw new Error('expected group first');
      x = moveCell(x, g.fields[0].key, { end: 'dialog' });
    }
    expect(x).not.toContain('<Group');
    expect(shape(x)).toEqual(['GroupBy', 'range:DateFrom,DateTo']);
  });

  it('a range moved into a group splits into two fields', () => {
    const x = `<Dialog Cols="2">
  <Group>
    <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
  </Group>
  <Label Text="Date From"/><Date Name="DateFrom"/>
  <Label Text="Date To"/><Date Name="DateTo"/>
</Dialog>`;
    const [g, range] = keysOf(x);
    expect(shape(moveCell(x, range, { end: g }))).toEqual(['group:S,DateFrom,DateTo']);
  });

  it('returns the input for an unknown key or broken XML', () => {
    expect(moveCell(SIMPLE, 'nope', { end: 'dialog' })).toBe(SIMPLE);
    expect(moveCell('<Dialog><Label', 'x', { end: 'dialog' })).toBe('<Dialog><Label');
  });
});

describe('groupCells / ungroup', () => {
  it('groups in document order, then ungroups back to the original bytes', () => {
    const [range, status] = keysOf(SIMPLE);
    const grouped = groupCells(SIMPLE, [status, range]);
    expect(grouped).toBe(`<Dialog Cols="2">
  <Group>
    <Label Text="Date From"/><Date Name="DateFrom"/>
    <Label Text="Date To"/><Date Name="DateTo"/>
    <Label Text="Status"/><Lookup Name="Status" Items="A" Values="A"/>
  </Group>
</Dialog>`);
    const [g] = keysOf(grouped);
    expect(ungroup(grouped, g)).toBe(SIMPLE);
  });

  it('refuses fewer than two cells, groups, and ranges with a hidden To label', () => {
    const [range] = keysOf(SIMPLE);
    expect(groupCells(SIMPLE, [range])).toBe(SIMPLE);
    const legacy = `<Dialog>
  <Label Text="Vendor"/><Lookup Name="VendorFrom"/>
  <Label Text="to" Visible="false"/><Lookup Name="VendorTo"/>
  <Label Text="S"/><Lookup Name="S"/>
</Dialog>`;
    expect(groupCells(legacy, keysOf(legacy))).toBe(legacy);
  });
});

describe('text outside the root', () => {
  it('keeps a declaration, a missing trailing newline, and CRLF line endings', () => {
    const x = '<?xml version="1.0"?>\r\n<Dialog>\r\n  <Label Text="A"/><Date Name="A"/>\r\n  <Label Text="B"/><Date Name="B"/>\r\n</Dialog>';
    const [a, b] = keysOf(x);
    expect(moveCell(x, b, { before: a })).toBe(
      '<?xml version="1.0"?>\r\n<Dialog>\r\n  <Label Text="B"/><Date Name="B"/>\r\n  <Label Text="A"/><Date Name="A"/>\r\n</Dialog>',
    );
  });
});

describe('dropTarget', () => {
  const map = { dialog: ['a', 'b', 'c', 'g'], groups: { g: ['g1', 'g2'] } };
  it('dragging down within a container lands after the item it is over', () => {
    expect(dropTarget(map, 'a', 'b')).toEqual({ before: 'c' });
    expect(dropTarget(map, 'a', 'g')).toEqual({ end: 'dialog' });
  });
  it('dragging up, or across containers, lands before the item it is over', () => {
    expect(dropTarget(map, 'c', 'a')).toEqual({ before: 'a' });
    expect(dropTarget(map, 'a', 'g2')).toEqual({ before: 'g2' });
  });
  it('end zones and self-drops', () => {
    expect(dropTarget(map, 'a', 'end:g')).toEqual({ end: 'g' });
    expect(dropTarget(map, 'a', 'a')).toBeNull();
  });
  it('containerMap lists group fields under their group', () => {
    const x = read('group-basic');
    const m = containerMap(cellsOf(x));
    expect(m.dialog).toHaveLength(2);
    expect(Object.values(m.groups)[0]).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/utils/dialogXmlEdit.test.ts`
Expected: FAIL — `Failed to resolve import "./dialogXmlEdit"`.

- [ ] **Step 3: Implement `src/utils/dialogXmlEdit.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/utils/dialogXmlEdit.test.ts src/utils/dialogXml`
Expected: PASS. If a `real-*` round trip fails, print the diff and fix `relayout`/`load` — do not loosen the test.

- [ ] **Step 5: Static checks + commit**

```bash
bun run typecheck && bun run lint
git add src/utils/dialogXmlEdit.ts src/utils/dialogXmlEdit.test.ts
git commit -m "feat(report-templates): pure Dialog XML edit operations for the layout editor"
```

---

### Task 3: Split `DialogPreview` into `dialogPreview/` (no behaviour change)

**Files:**
- Create: `src/components/dialogPreview/CellView.tsx`
- Create: `src/components/dialogPreview/warningText.ts`
- Modify: `src/components/DialogPreview.tsx`

**Interfaces:**
- Produces: `CellView.tsx` exports `GRID_COLS`, `COL_SPAN`, `CANVAS_W`, `renderControl`, `FieldBlock`, `CellBlock` (same signatures as today). `warningText.ts` exports `warningText(w: DialogWarning, t: TFunction): string`.

- [ ] **Step 1: Move code verbatim**

From `src/components/DialogPreview.tsx`, cut these declarations and paste them unchanged into `src/components/dialogPreview/CellView.tsx`, adding `export` to each: the `GRID_COLS`, `COL_SPAN`, `CANVAS_W` tables (with their comments), `cleanDataSource` (not exported), `renderControl`, `FieldBlock`, `CellBlock`. Give the new file the imports those need:

```tsx
import React from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import type { TFunction } from '../../i18n/types';
import { MAX_COLS, type DialogCell, type DialogField } from '../../utils/dialogXml';
```

Cut `warningText` into `src/components/dialogPreview/warningText.ts` with:

```ts
import type { TFunction } from '../../i18n/types';
import type { DialogWarning } from '../../utils/dialogXml';
```

In `DialogPreview.tsx` import them back:

```tsx
import { CANVAS_W, CellBlock, GRID_COLS } from './dialogPreview/CellView';
import { warningText } from './dialogPreview/warningText';
```
and drop imports that are now unused (`Label`, `Input`, `MAX_COLS`, `DialogField`, `DialogCell`, `DialogWarning` — let lint tell you).

- [ ] **Step 2: Verify no behaviour change**

```bash
bun run typecheck && bun run lint
bunx vitest run src/pages/ReportTemplateEdit src/utils/dialogXml
git diff --stat
```
Expected: clean; PASS; `DialogPreview.tsx` shrinks by roughly the moved lines.

- [ ] **Step 3: Commit**

```bash
git add src/components/DialogPreview.tsx src/components/dialogPreview
git commit -m "refactor(report-templates): split DialogPreview cell rendering into dialogPreview/"
```

---

### Task 4: Add dnd-kit

**Files:**
- Modify: `package.json`, `bun.lock`, `package-lock.json`

- [ ] **Step 1: Install with bun, then sync the npm lockfile**

```bash
bun add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
npm install --package-lock-only --ignore-scripts
git diff --stat
```
Expected: `package.json`, `bun.lock`, `package-lock.json` changed; nothing else. Do **not** run `npm ci` in the repo.

- [ ] **Step 2: Prove both lockfiles resolve** (in a throwaway copy so the bun tree is untouched)

```bash
P=/private/tmp/claude-501/-Users-samutpra-GitHub-carmensoftware-organize-carmen-platform/f56a260a-6a04-4c31-aec8-070a191d84b9/scratchpad/npm-probe
rm -rf "$P" && mkdir -p "$P" && cp package.json package-lock.json .npmrc "$P"/ 2>/dev/null; (cd "$P" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && echo npm-ci-ok)
bun run typecheck
```
Expected: `npm-ci-ok`; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock package-lock.json
git commit -m "chore(deps): add @dnd-kit core, sortable, utilities for the dialog layout editor"
```

---

### Task 5: Editor shell — `Cols` picker and ColSpan stepper (no drag yet)

**Files:**
- Create: `src/components/dialogPreview/DialogLayoutEditor.tsx`
- Create: `src/components/dialogPreview/CellToolbar.tsx`
- Modify: `src/components/DialogPreview.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (new `components.dialogPreview.editor` block)

**Interfaces:**
- Consumes: `setCols`, `setColSpan` (Task 2); `CellBlock`, `FieldBlock`, `GRID_COLS`, `COL_SPAN`, `CANVAS_W` (Task 3).
- Produces:

```tsx
export interface DialogLayoutEditorProps {
  xml: string;
  parsed: DialogParseResult; // ok === true
  onChange: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}
export function DialogLayoutEditor(props: DialogLayoutEditorProps): JSX.Element;
export function CellToolbar(props: { label: string; span: number; cols: number; onSpan: (n: number) => void; handle?: React.ReactNode; select?: React.ReactNode }): JSX.Element;
```
- `DialogPreview` props become `{ xml: string; onChange?: (xml: string) => void; onDragActiveChange?: (active: boolean) => void }`.

- [ ] **Step 1: i18n** — inside `components.dialogPreview` in `en.ts` add:

```ts
      editor: {
        colsLabel: 'Columns',
        // {{label}} is the field's label text from the XML
        spanDecrease: 'Make {{label}} narrower',
        spanIncrease: 'Make {{label}} wider',
        spanValue: 'Spans {{count}} of {{cols}} columns',
        dragHandle: 'Move {{label}}',
        selectCell: 'Select {{label}} for grouping',
        groupSelected: 'Group {{count}} cells',
        clearSelection: 'Clear',
        rangeSplits: 'From/To ranges become separate fields inside a group.',
        groupLabel: 'Group',
        ungroup: 'Ungroup',
        dropAtEnd: 'Drop here to move to the end',
        hiddenToLabel: 'This range uses a hidden "to" label and cannot go into a group.',
        narrowScreen: 'Open this tab on a wider screen to arrange the layout.',
      },
```
and in `th.ts`:

```ts
      editor: {
        colsLabel: 'คอลัมน์',
        spanDecrease: 'ทำให้ {{label}} แคบลง',
        spanIncrease: 'ทำให้ {{label}} กว้างขึ้น',
        spanValue: 'กว้าง {{count}} จาก {{cols}} คอลัมน์',
        dragHandle: 'ย้าย {{label}}',
        selectCell: 'เลือก {{label}} เพื่อรวมกลุ่ม',
        groupSelected: 'รวม {{count}} รายการเป็นกลุ่ม',
        clearSelection: 'ล้าง',
        rangeSplits: 'ช่วง From/To จะแยกเป็น field เดี่ยวเมื่ออยู่ในกลุ่ม',
        groupLabel: 'กลุ่ม',
        ungroup: 'แยกกลุ่ม',
        dropAtEnd: 'วางที่นี่เพื่อย้ายไปท้ายสุด',
        hiddenToLabel: 'ช่วงนี้ใช้ป้าย "to" ที่ซ่อนไว้ จึงรวมเข้ากลุ่มไม่ได้',
        narrowScreen: 'เปิดแท็บนี้บนจอที่กว้างขึ้นเพื่อจัด layout',
      },
```

- [ ] **Step 2: `CellToolbar.tsx`**

```tsx
import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { useI18n } from '../../hooks/useI18n';

interface CellToolbarProps {
  label: string;
  span: number;
  cols: number;
  onSpan: (n: number) => void;
  handle?: React.ReactNode;
  select?: React.ReactNode;
}

/** แถบเครื่องมือมุมขวาบนของ cell — แสดงตอน hover หรือโฟกัสด้วยคีย์บอร์ด */
export function CellToolbar({ label, span, cols, onSpan, handle, select }: CellToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100">
      {select}
      {cols > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={span <= 1}
            aria-label={t('components.dialogPreview.editor.spanDecrease', { label })}
            onClick={() => onSpan(span - 1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-4 text-center text-[11px] tabular-nums" title={t('components.dialogPreview.editor.spanValue', { count: span, cols })}>
            {span}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={span >= cols}
            aria-label={t('components.dialogPreview.editor.spanIncrease', { label })}
            onClick={() => onSpan(span + 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {handle}
    </div>
  );
}
```

- [ ] **Step 3: `DialogLayoutEditor.tsx` (static grid + toolbars)**

```tsx
import React from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { MAX_COLS, type DialogCell, type DialogParseResult } from '../../utils/dialogXml';
import { setColSpan, setCols } from '../../utils/dialogXmlEdit';
import { CANVAS_W, COL_SPAN, CellBlock, GRID_COLS } from './CellView';
import { CellToolbar } from './CellToolbar';

export interface DialogLayoutEditorProps {
  xml: string;
  parsed: DialogParseResult;
  onChange: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

const cellLabel = (c: DialogCell, groupWord: string): string =>
  c.kind === 'group' ? groupWord : c.kind === 'range' ? c.label.replace(/ From$/, '') : c.label;

export function DialogLayoutEditor({ xml, parsed, onChange }: DialogLayoutEditorProps) {
  const { t } = useI18n();
  // คำสั่งที่ไม่เปลี่ยนอะไร (ค่าเดิม, key หาย) คืน string เดิม — ไม่ต้องทำให้หน้า dirty
  const apply = (next: string) => {
    if (next !== xml) onChange(next);
  };
  const groupWord = t('components.dialogPreview.editor.groupLabel');

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
              onClick={() => apply(setCols(xml, n))}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>
      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
        {parsed.cells.map((cell) => (
          <div key={cell.key} className={cn('group/cell relative', COL_SPAN[cell.layout.colSpan])}>
            <CellToolbar
              label={cellLabel(cell, groupWord)}
              span={cell.layout.colSpan}
              cols={parsed.cols}
              onSpan={(n) => apply(setColSpan(xml, cell.key, n))}
            />
            <CellBlock cell={{ ...cell, layout: { colSpan: 1 } }} t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

(`CellBlock` applies `COL_SPAN` to its own root; the wrapper owns the span here, so the cell is passed with `colSpan: 1` to avoid a double class.)

- [ ] **Step 4: `DialogPreview.tsx` — props + mode switch**

Change the props interface and component signature:

```tsx
export interface DialogPreviewProps {
  xml: string;
  /** มีเมื่อหน้าอยู่ในโหมดแก้ไข — เปิด editor แบบลากวาง */
  onChange?: (xml: string) => void;
  onDragActiveChange?: (active: boolean) => void;
}

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml, onChange, onDragActiveChange }) => {
  const { t } = useI18n();
  const wide = useMediaQuery('(min-width: 768px)');
```
(add `import { useMediaQuery } from '../hooks/useMediaQuery';` and `import { DialogLayoutEditor } from './dialogPreview/DialogLayoutEditor';`).

Replace the grid block inside the bordered `rounded-md border bg-muted/20` box with:

```tsx
        {onChange && wide ? (
          <DialogLayoutEditor xml={xml} parsed={parsed} onChange={onChange} onDragActiveChange={onDragActiveChange} />
        ) : (
          <>
            {onChange && <p className="mb-3 text-xs text-muted-foreground">{t('components.dialogPreview.editor.narrowScreen')}</p>}
            <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
              {parsed.cells.map((cell) => (
                <CellBlock key={cell.key} cell={cell} t={t} />
              ))}
            </div>
          </>
        )}
```
In editor mode, hide the `{n} cols` header badge (the picker replaces it): wrap that `<Badge>` in `{!(onChange && wide) && (…)}`.

- [ ] **Step 5: Static checks + commit**

```bash
bun run typecheck && bun run lint
bunx vitest run src/pages/ReportTemplateEdit src/utils
git add src/components/DialogPreview.tsx src/components/dialogPreview src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): layout editor shell with Cols picker and ColSpan stepper"
```

---

### Task 6: Drag and drop (reorder, in/out of groups, keyboard)

**Files:**
- Create: `src/components/dialogPreview/SortableCell.tsx`
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx`

**Interfaces:**
- Consumes: `moveCell`, `containerMap`, `dropTarget` (Task 2); `CellToolbar` (Task 5).
- Produces: `SortableCell` and `SortableGroup` components; `DialogLayoutEditor` calls `onDragActiveChange(true)` on drag start and `(false)` on end/cancel.

- [ ] **Step 1: `SortableCell.tsx`**

```tsx
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
  toolbar: (handle: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}

/** ห่อ cell ด้วย useSortable — ลากได้จากปุ่มจับเท่านั้น (setActivatorNodeRef) */
export function SortableCell({ id, label, className, toolbar, children }: SortableShellProps) {
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
      className={cn('group/cell relative', isDragging && 'z-20 opacity-60', className)}
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
```

- [ ] **Step 2: Wire dnd-kit into `DialogLayoutEditor.tsx`**

Add imports:

```tsx
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FieldBlock } from './CellView';
import { EndZone, GroupItems, SortableCell } from './SortableCell';
import { containerMap, dropTarget, moveCell, setColSpan, setCols } from '../../utils/dialogXmlEdit';
```

Inside the component, before `return`:

```tsx
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const map = containerMap(parsed.cells);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    onDragActiveChange?.(false);
    if (!over) return;
    const target = dropTarget(map, String(active.id), String(over.id));
    if (target) apply(moveCell(xml, String(active.id), target));
  };
```
(destructure `onDragActiveChange` from props.)

Replace the grid `<div className={cn('grid …')}>…</div>` with:

```tsx
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onDragActiveChange?.(true)}
        onDragCancel={() => onDragActiveChange?.(false)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={map.dialog} strategy={rectSortingStrategy}>
          <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
            {parsed.cells.map((cell) => {
              const label = cellLabel(cell, groupWord);
              const toolbar = (handle: React.ReactNode) => (
                <CellToolbar
                  label={label}
                  span={cell.layout.colSpan}
                  cols={parsed.cols}
                  onSpan={(n) => apply(setColSpan(xml, cell.key, n))}
                  handle={handle}
                />
              );
              if (cell.kind !== 'group') {
                return (
                  <SortableCell key={cell.key} id={cell.key} label={label} className={COL_SPAN[cell.layout.colSpan]} toolbar={toolbar}>
                    <CellBlock cell={{ ...cell, layout: { colSpan: 1 } }} t={t} />
                  </SortableCell>
                );
              }
              return (
                <SortableCell key={cell.key} id={cell.key} label={label} className={COL_SPAN[cell.layout.colSpan]} toolbar={toolbar}>
                  <div className="rounded-md border border-dashed p-3 pt-8">
                    <span className="absolute left-3 top-2 text-[11px] font-medium text-muted-foreground">{groupWord}</span>
                    <GroupItems items={map.groups[cell.key]}>
                      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[Math.min(cell.fields.length, MAX_COLS)])}>
                        {cell.fields.map((f) => (
                          <SortableCell
                            key={f.key}
                            id={f.key}
                            label={f.label}
                            toolbar={(handle) => (
                              <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100">
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
```

- [ ] **Step 3: Static checks + commit**

```bash
bun run typecheck && bun run lint
bunx vitest run src/utils
git add src/components/dialogPreview
git commit -m "feat(report-templates): drag to reorder Dialog cells and move them in and out of groups"
```

---

### Task 7: Select cells, group, ungroup

**Files:**
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx`
- Modify: `src/components/dialogPreview/CellToolbar.tsx` (no change needed if `select` slot suffices)

**Interfaces:**
- Consumes: `groupCells`, `ungroup`, `hasHiddenToLabel` (Task 2).

- [ ] **Step 1: Selection derived from the current XML** — in `DialogLayoutEditor`:

```tsx
  // ผูกการเลือกไว้กับ string ที่เลือก — XML เปลี่ยนจากที่ไหนก็ตาม key อาจเลื่อน จึงถือว่าไม่ได้เลือกอะไร
  const [selection, setSelection] = React.useState<{ xml: string; keys: string[] }>({ xml, keys: [] });
  const selected = selection.xml === xml ? selection.keys : [];
  const toggle = (key: string) =>
    setSelection({ xml, keys: selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key] });
  const selectedHasRange = parsed.cells.some((c) => c.kind === 'range' && selected.includes(c.key));
```

Add `import { Checkbox } from '../ui/checkbox';` (confirm the primitive exists: `ls src/components/ui/checkbox.tsx`; if absent, use a native `<input type="checkbox" className="h-3.5 w-3.5 accent-primary">`). Add `groupCells, ungroup, hasHiddenToLabel` to the `dialogXmlEdit` import.

- [ ] **Step 2: Checkbox in the toolbar of top-level field/range cells** — pass `select` to `CellToolbar` for `cell.kind !== 'group'`:

```tsx
                  select={
                    <Checkbox
                      className="mx-1"
                      checked={selected.includes(cell.key)}
                      disabled={hasHiddenToLabel(cell)}
                      title={hasHiddenToLabel(cell) ? t('components.dialogPreview.editor.hiddenToLabel') : undefined}
                      aria-label={t('components.dialogPreview.editor.selectCell', { label })}
                      onCheckedChange={() => toggle(cell.key)}
                    />
                  }
```
(the `toolbar` closure in Task 6 builds `CellToolbar`; add this prop there for non-group cells, and add an `Ungroup` button to the group header instead.)

Group header — next to the `{groupWord}` span:

```tsx
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute left-14 top-1 h-6 px-2 text-[11px]"
                      onClick={() => apply(ungroup(xml, cell.key))}
                    >
                      {t('components.dialogPreview.editor.ungroup')}
                    </Button>
```

- [ ] **Step 3: Selection bar** — above the `DndContext`, rendered when `selected.length >= 2`:

```tsx
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
```

- [ ] **Step 4: Static checks + commit**

```bash
bun run typecheck && bun run lint
git add src/components/dialogPreview
git commit -m "feat(report-templates): select Dialog cells to group them, and ungroup"
```

---

### Task 8: Wire into `ReportTemplateEdit` (onChange, Esc guard)

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx` (~L217-224 `useGlobalShortcuts`; ~L1264-1266 preview panel)

- [ ] **Step 1: Drag flag in a ref; the Cancel shortcut ignores Esc while dragging**

Near the other refs:

```tsx
  // dnd-kit ใช้ Esc ยกเลิกการลากด้วยคีย์บอร์ด และ useGlobalShortcuts ก็ฟัง Esc บน window เหมือนกัน
  // ลำดับของ listener ไม่แน่นอน จึงล้าง flag ใน tick ถัดไป ไม่ให้ Esc เดียวกันหลุดไปกด Cancel ของทั้งหน้า
  const dialogDragActiveRef = useRef(false);
  const handleDialogDragActive = useCallback((active: boolean) => {
    if (active) dialogDragActiveRef.current = true;
    else setTimeout(() => {
      dialogDragActiveRef.current = false;
    }, 0);
  }, []);
```

In `useGlobalShortcuts`:

```tsx
    onCancel: () => {
      if (dialogDragActiveRef.current) return;
      if (editing && !isNew) handleCancelEdit();
    },
```

- [ ] **Step 2: Pass the editor props**

```tsx
                        <DialogPreview
                          xml={formData.dialog}
                          onChange={editing ? handleXmlChange('dialog') : undefined}
                          onDragActiveChange={handleDialogDragActive}
                        />
```

- [ ] **Step 3: Checks + full suite + commit**

```bash
bun run typecheck && bun run lint
bun run test
git add src/pages/ReportTemplateEdit.tsx
git commit -m "feat(report-templates): enable the Dialog layout editor in edit mode"
```
Expected: full suite green.

---

### Task 9: Browser verification (local, never saved)

Run against the already-running `bun run dev:localhost` on :3304 (or start it). Use Claude-in-Chrome. Never press Save.

- [ ] **Step 1: Chrome serializer round trip (Review Focus 1)** — on any page of the app (Vite dev server serves repo files), run via `javascript_tool`:

```js
const names = ['Credit_Note_Detail_Report','Deviation_by_Item_Report','EOP_Adjustment_Report','EOP_Checklist','Extra_Cost_Report','Inventory_Balance_Report','Material_Consumption_Report','Menu_Engineering_Report','Purchase_Analysis_by_Item_Report','Purchase_Order_Detail_Report','Purchase_Request_Detail_Report','Receiving_Detail_Report','Receiving_Detail_Summary_by_Product_Report','Recipe_Card_Report','Stock_Card_Detailed_Report','Stock_In_Detail_Report','Stock_Out_Detail_Report','Store_Requisition_Detail_Report'];
const bad = [];
for (const n of names) {
  const x = await (await fetch(`/docs/dialog-xml/fixtures/real-${n}.xml`)).text();
  const back = new XMLSerializer().serializeToString(new DOMParser().parseFromString(x, 'application/xml').documentElement);
  if (back !== x.replace(/\n$/, '')) bad.push(n);
}
({ checked: names.length, bad });
```
Expected: `bad: []`. If not, record the first differing character and stop — `save()` needs a normalisation step.

- [ ] **Step 2: Editor actions** on Purchase Order Detail Report in edit mode, Preview tab:
  - `Cols` 2 → grid becomes 2 columns; Dialog XML tab shows `<Dialog Cols="2">` and nothing else changed (`git diff`-style eyeball of the editor).
  - ColSpan `+` on the Date range → `ColSpan="2"` on `DateFrom`.
  - Drag Status above Date with the mouse → order changes in XML.
  - Tick two cells → "Group 2 cells" → `<Group>` appears with the rollout notice; Ungroup restores.
  - Drag a field out of a group into the dialog end zone; the empty group disappears.
  - Drop a cell where it started → the page does **not** become dirty.

- [ ] **Step 3: Keyboard + Esc (Review Focus 2)** — focus a drag handle, Space, ArrowDown, Esc. Expected: the drag cancels, the page stays in edit mode with unsaved changes intact.

- [ ] **Step 4: Undo** — after an editor change, open the Dialog XML tab, focus the editor, Ctrl/⌘+Z. Record whether it undoes the change (either result acceptable).

- [ ] **Step 5: Narrow screen** — iframe probe at 700px: the static preview shows with the "wider screen" note and no drag handles.

- [ ] **Step 6: Cancel** — press Cancel; the template returns to its saved XML.
