# Dialog XML `Label` attribute (controls + groups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `<Date>`/`<Lookup>` carry their own `Label="…"` (a standalone cell, never part of a range) and let `<Group>` carry a `Label` heading, consistently across all four Dialog XML readers.

**Architecture:** Each reader gets a `selfLabel` flag on control nodes, handled as its own branch in the pairing step (no virtual `<Label>`). The platform preview parser is a line-for-line port of the inventory run-dialog parser, so both change identically and are held together by shared fixtures. The editor's DOM ops only need to drop `null` label nodes and stop `relayout` gluing an orphan `<Label>` onto a self-labelled control.

**Tech Stack:** React 19 + TypeScript + Vitest/jsdom (platform, inventory), Go `encoding/xml` (micro-report).

**Spec:** `docs/superpowers/specs/2026-10-08-dialog-control-label-attr-design.md`

## Global Constraints

- Presence decides: `el.getAttribute('Label') !== null` → self-labelled. The value is **trimmed** everywhere; empty after trimming → show the control's `Name`.
- A self-labelled control never consumes the `<Label>` before it and is never part of a range (neither From nor To).
- `<Group Label>`: trimmed; empty → no heading, no warning. It never pairs with anything.
- Existing fixtures (39) must keep passing unchanged — no behaviour change for templates without `Label=`.
- Tests: the user approved the spec's Testing section, so this plan writes the tests it lists (overrides the default "skip tests during plan execution"). Static checks still required: platform `bun run typecheck && bun run lint`; inventory `bun run typecheck && bun run lint`; micro-report `go vet ./service/`.
- Branch `feature/dialog-control-label-attr` in every repo. Never commit to `main`.
- **inventory:** never `git add package.json` (unrelated local change). **micro-report:** never `git add .claude/` (unrelated local changes). Stage files by explicit path only.
- Never modify `src/components/ui/`. No new libraries. No `alert`/`confirm`.
- Tailwind classes must be literal strings (existing `GRID_COLS` / `COL_SPAN` tables).
- micro-report `TestBuildFilterSubtitle` already fails on `main` — not ours; run our tests with `-run`.

## Review Focus

1. **Orphan `<Label>` glued to a self-labelled control by `relayout`** — after any move, a dangling `<Label>` must stay on its own line, not join the next control's line (it would *look* paired in the XML tab). Test in Task 3.
2. **Whitespace-only labels** (`Label="  "`) — every reader must treat them as empty (Name fallback / no heading), not render a blank label. Fixture `label-attr-empty`, `group-label`, Go test, schedule test.
3. **Rollout notice fires for control `Label` only** — a `<Group Label>` alone must not show `labelAttrNeedsInventory` (older inventory just loses the heading). Test in Task 2.
4. **Long group heading in the editor** overlapping the Ungroup button or the top-right toolbar — must truncate. Browser check in Task 8.
5. **Hidden To label before a self-labelled To control** (`<Label Visible="false"/><Date Name="XTo" Label="…"/>`) — must yield From as a single field and To as its own cell, no range. Fixture `label-attr-no-range` covers the visible-`to` variant; Task 2 adds the hidden variant as a unit test.

---

### Task 1: Shared fixtures, label-aware fixture runner, README (platform)

**Files:**
- Create: `docs/dialog-xml/fixtures/label-attr-basic.xml` + `.expected.json`
- Create: `docs/dialog-xml/fixtures/label-attr-preceded.xml` + `.expected.json`
- Create: `docs/dialog-xml/fixtures/label-attr-no-range.xml` + `.expected.json`
- Create: `docs/dialog-xml/fixtures/label-attr-group.xml` + `.expected.json`
- Create: `docs/dialog-xml/fixtures/label-attr-empty.xml` + `.expected.json`
- Create: `docs/dialog-xml/fixtures/group-label.xml` + `.expected.json`
- Modify: `src/utils/dialogXml.fixtures.test.ts`
- Modify: `docs/dialog-xml/README.md`

**Interfaces:**
- Produces: expected-cell JSON may carry optional `labels: string[]` (single/range → `[cell label]`, group → field labels) and `heading: string` (group only). The runner compares them **only when the expected cell has the key**, so the 39 existing files stay valid. Task 5 mirrors this in inventory.

- [ ] **Step 1: Write the fixtures** (each file ends with a single trailing newline, 2-space indent, one cell per line)

`label-attr-basic.xml`
```xml
<Dialog Cols="2">
  <Date Name="AsAt" Label="As at" Value="@today"/>
  <Label Text="Location"/><Lookup Name="Location" DataSource="Location"/>
  <Lookup Name="Status" Label="Status" Items="ALL~Open" Values="ALL~O" ColSpan="2"/>
</Dialog>
```
`label-attr-basic.expected.json`
```json
{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["AsAt"],"labels":["As at"]},{"kind":"single","colSpan":1,"names":["Location"],"labels":["Location"]},{"kind":"single","colSpan":2,"names":["Status"],"labels":["Status"]}],"warnings":[]}
```

`label-attr-preceded.xml`
```xml
<Dialog>
  <Label Text="Vendor"/><Lookup Name="Vendor" Label="Supplier" DataSource="Vendor"/>
</Dialog>
```
`label-attr-preceded.expected.json`
```json
{"cols":1,"cells":[{"kind":"single","colSpan":1,"names":["Vendor"],"labels":["Supplier"]}],"warnings":["labelWithoutControl"]}
```

`label-attr-no-range.xml`
```xml
<Dialog Cols="2">
  <Date Name="DateFrom" Label="Date from"/>
  <Date Name="DateTo" Label="to"/>
  <Label Text="Period"/><Date Name="PeriodFrom"/>
  <Label Text="to"/><Date Name="PeriodTo" Label="Period end"/>
</Dialog>
```
`label-attr-no-range.expected.json`
```json
{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["DateFrom"],"labels":["Date from"]},{"kind":"single","colSpan":1,"names":["DateTo"],"labels":["to"]},{"kind":"single","colSpan":1,"names":["PeriodFrom"],"labels":["Period"]},{"kind":"single","colSpan":1,"names":["PeriodTo"],"labels":["Period end"]}],"warnings":["labelWithoutControl"]}
```

`label-attr-group.xml`
```xml
<Dialog Cols="3">
  <Group ColSpan="2">
    <Date Name="DateFrom" Label="Date from"/>
    <Date Name="DateTo" Label="to"/>
  </Group>
  <Lookup Name="Status" Label="Status" Items="ALL~Open" Values="ALL~O"/>
</Dialog>
```
`label-attr-group.expected.json`
```json
{"cols":3,"cells":[{"kind":"group","colSpan":2,"names":["DateFrom","DateTo"],"labels":["Date from","to"],"heading":""},{"kind":"single","colSpan":1,"names":["Status"],"labels":["Status"]}],"warnings":[]}
```

`label-attr-empty.xml`
```xml
<Dialog>
  <Date Name="AsAt" Label=""/>
  <Lookup Name="Status" Label="   " Items="ALL" Values="ALL"/>
</Dialog>
```
`label-attr-empty.expected.json`
```json
{"cols":1,"cells":[{"kind":"single","colSpan":1,"names":["AsAt"],"labels":["AsAt"]},{"kind":"single","colSpan":1,"names":["Status"],"labels":["Status"]}],"warnings":["emptyLabel","emptyLabel"]}
```

`group-label.xml`
```xml
<Dialog Cols="2">
  <Group Label="Period">
    <Label Text="Date From"/><Date Name="DateFrom"/>
    <Label Text="Date To"/><Date Name="DateTo"/>
  </Group>
  <Group Label="  ">
    <Label Text="Status"/><Lookup Name="Status" Items="ALL" Values="ALL"/>
  </Group>
  <Group>
    <Label Text="Location"/><Lookup Name="Location" DataSource="Location"/>
  </Group>
</Dialog>
```
`group-label.expected.json`
```json
{"cols":2,"cells":[{"kind":"group","colSpan":1,"names":["DateFrom","DateTo"],"labels":["Date From","Date To"],"heading":"Period"},{"kind":"group","colSpan":1,"names":["Status"],"labels":["Status"],"heading":""},{"kind":"group","colSpan":1,"names":["Location"],"labels":["Location"],"heading":""}],"warnings":[]}
```

- [ ] **Step 2: Make the runner label-aware** — replace `summarize` and the `it.each` body in `src/utils/dialogXml.fixtures.test.ts`:

```ts
interface Cell {
  kind: string;
  colSpan: number;
  names: string[];
  labels?: string[];
  heading?: string;
}

function summarize(r: DialogParseResult) {
  return {
    cols: r.cols,
    // ทุก cell ที่ preview วาด — ไม่กรองอะไรทิ้ง ไม่อย่างนั้น fixture จะมองไม่เห็นจุดที่สอง parser วาดต่างกัน
    cells: r.cells.map((c): Cell => {
      if (c.kind === 'range')
        return { kind: 'range', colSpan: c.layout.colSpan, names: [nameOf(c.from), nameOf(c.to)], labels: [c.label] };
      if (c.kind === 'group')
        return { kind: 'group', colSpan: c.layout.colSpan, names: c.fields.map(nameOf), labels: c.fields.map((f) => f.label), heading: c.label };
      return { kind: 'single', colSpan: c.layout.colSpan, names: [nameOf(c)], labels: [c.label] };
    }),
    warnings: r.warnings.map((w) => w.code),
  };
}

// labels / heading เทียบเฉพาะ fixture ที่ระบุไว้ — fixture ชุดเดิมไม่มีสองคีย์นี้
const fit = (actual: Cell[], expected: Cell[]): Cell[] =>
  actual.map((c, i) => {
    const e = expected[i] ?? {};
    const out: Cell = { kind: c.kind, colSpan: c.colSpan, names: c.names };
    if ('labels' in e) out.labels = c.labels;
    if ('heading' in e) out.heading = c.heading;
    return out;
  });
```
and in the test body:
```ts
    const result = parseDialogXml(xml);
    expect(result.ok).toBe(true);
    const s = summarize(result);
    expect({ ...s, cells: fit(s.cells, expected.cells) }).toEqual(expected);
```

- [ ] **Step 3: Run — expect the new fixtures to fail, old ones to pass**

Run: `bun run test -- src/utils/dialogXml.fixtures.test.ts`
Expected: FAIL on the 6 new fixtures (no self-label support; also a TS-level `c.label` on group is `undefined` at runtime), all 39 existing PASS. (Typecheck will flag `c.label` on the group cell until Task 2 — fine, Task 2 adds it.)

- [ ] **Step 4: README** — in `docs/dialog-xml/README.md` **Elements** list:
  - change the first bullet about labels to:
    ```
    - A visible `<Label Text="…"/>` followed by a control = one field. A control
      may instead carry its own `Label="…"` (see below). A control without either,
      or a label without a control after it, is not shown by inventory — the
      preview warns instead of drawing it.
    - `Label="…"` on `<Date>`/`<Lookup>`: the control is a field on its own. It
      never takes the `<Label>` before it (that label is dropped with a warning) and
      is never part of a From/To range — wrap From and To in `<Group>` instead.
      The value is trimmed; empty → the control's `Name` is shown.
    ```
  - in the `<Group>` bullet replace ``Empty groups are skipped. `Cols`/`Label` on `<Group>` are reserved.`` with ``Empty groups are skipped. `Label="…"` on `<Group>` is a heading above its fields (trimmed; empty → none). `Cols` on `<Group>` is reserved.``
  - after the `<Group>` rollout-rule blockquote add:
    ```
    > **`Label` attribute rollout rule:** do not put `Label=` on a `<Date>`/`<Lookup>`
    > in a live template until the inventory release that supports it is on
    > inventory **production**. Older builds silently drop that field. `Label` on
    > `<Group>` is safe on older builds (the heading is just missing).
    ```
  - in **Fixtures** append: ``Expected cells may carry `labels` (field labels) and `heading` (group label); runners compare them only where present.``

- [ ] **Step 5: Commit** (after Task 2 makes them green — Tasks 1 and 2 share one commit)

---

### Task 2: Preview parser — self-label, group heading, `emptyLabel`, `hasLabelAttr` (platform)

**Files:**
- Modify: `src/utils/dialogXml.ts`
- Modify: `src/utils/dialogXml.test.ts`

**Interfaces:**
- Consumes: Task 1 fixtures.
- Produces:
  - `DialogField.labelElement: Element | null` (`null` = label from attribute)
  - group cell: `{ kind: 'group'; key; label: string; element; layout; fields }`
  - `DialogWarning` gains `{ code: 'emptyLabel'; at: string }` (in the `'nestedGroupFlattened' | 'emptyGroup' | 'colSpanOnLabel'` member)
  - `DialogParseResult.hasLabelAttr: boolean` (true iff some `<Date>`/`<Lookup>` has a `Label` attribute)

- [ ] **Step 1: Write failing unit tests** — append inside `describe('parseDialogXml', …)` in `src/utils/dialogXml.test.ts`:

```ts
  it('a self-labelled control has no label node and is flagged for the rollout notice', () => {
    const r = parseDialogXml('<Dialog><Date Name="A" Label="As at"/></Dialog>');
    const c = r.cells[0];
    if (c.kind !== 'field') throw new Error('expected field');
    expect(c.label).toBe('As at');
    expect(c.labelElement).toBeNull();
    expect(r.hasLabelAttr).toBe(true);
  });

  it('a Label on <Group> alone does not raise the rollout notice', () => {
    const r = parseDialogXml('<Dialog><Group Label="P"><Label Text="A"/><Date Name="A"/></Group></Dialog>');
    const g = r.cells[0];
    if (g.kind !== 'group') throw new Error('expected group');
    expect(g.label).toBe('P');
    expect(r.hasLabelAttr).toBe(false);
  });

  it('a hidden To label before a self-labelled To control makes no range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="P"/><Date Name="PFrom"/><Label Text="to" Visible="false"/><Date Name="PTo" Label="End"/></Dialog>',
    );
    expect(r.cells.map((c) => (c.kind === 'field' ? c.label : c.kind))).toEqual(['P', 'End']);
  });
```
And change the three existing `.labelElement.getAttribute(` calls in this file to `.labelElement?.getAttribute(` (they become nullable).

- [ ] **Step 2: Run to see them fail**

Run: `bun run test -- src/utils/dialogXml`
Expected: FAIL — `hasLabelAttr` undefined, `labelElement` not null / no field cell, the hidden-To case yields `['P']` or a range.

- [ ] **Step 3: Implement** in `src/utils/dialogXml.ts`:

Types:
```ts
export interface DialogField {
  key: string;
  label: string;
  element: Element;
  /** null = ป้ายมาจาก attribute Label บน control เอง ไม่มี <Label> element */
  labelElement: Element | null;
  layout: DialogLayout;
}

export type DialogCell =
  | ({ kind: 'field' } & DialogField)
  | { kind: 'range'; key: string; label: string; from: DialogField; to: DialogField; layout: DialogLayout }
  | { kind: 'group'; key: string; label: string; element: Element; layout: DialogLayout; fields: DialogField[] };

export type DialogWarning =
  | { code: 'colsClamped' | 'colsInvalid'; raw: string; used: number }
  | { code: 'colSpanClamped' | 'colSpanInvalid'; raw: string; used: number; at: string }
  | { code: 'nestedGroupFlattened' | 'emptyGroup' | 'colSpanOnLabel' | 'emptyLabel'; at: string }
  | { code: 'unknownElement'; at: string; tag: string }
  | { code: 'labelWithoutControl' | 'controlWithoutLabel'; at: string };
```
`DialogParseResult` gains `hasLabelAttr: boolean;` and `failure()` returns `hasLabelAttr: false`.

Control node gets `selfLabel`:
```ts
  | { type: 'control'; key: string; tag: string; name: string; selfLabel: string | null; element: Element; layout: DialogLayout; at: string };
```
In `toNodes`, the control push adds `selfLabel: el.getAttribute('Label'),`.

New helper below `toField`:
```ts
/** control ที่มี Label ในตัว — ค่าว่าง (หลัง trim) แสดง Name แทนและเตือน */
const selfField = (c: ControlNode, warnings: DialogWarning[]): DialogField => {
  const text = (c.selfLabel ?? '').trim();
  if (!text) warnings.push({ code: 'emptyLabel', at: c.at });
  return { key: c.key, label: text || c.name, element: c.element, labelElement: null, layout: c.layout };
};
```

`groupNodes` loop body becomes (keep the doc comment, add one line: "control ที่มี Label ในตัวเป็น cell เดี่ยวเสมอ ไม่หยิบ <Label> ข้างหน้าและไม่จับคู่ช่วง"):
```ts
  while (i < nodes.length) {
    const node = nodes[i];
    if (isControl(node) && node.selfLabel !== null) {
      cells.push({ kind: 'field', ...selfField(node, warnings) });
      i++;
      continue;
    }
    if (node.type !== 'label' || !node.visible) {
      if (node.type === 'control') warnings.push({ code: 'controlWithoutLabel', at: node.at });
      i++;
      continue;
    }
    const next = nodes[i + 1];
    if (!isControl(next) || next.selfLabel !== null) {
      warnings.push({ code: 'labelWithoutControl', at: node.text || node.at });
      i++;
      continue;
    }
    const after = nodes[i + 2];
    const to = nodes[i + 3];
    const isPaired = (isToLabel(after) && isControl(to)) || (after?.type === 'label' && isNamedPair(next, to));
    if (pairRanges && isPaired && isControl(to) && to.selfLabel === null && after?.type === 'label') {
```
(the rest of the loop is unchanged).

In `parseDialogDocument`: the group `fields` map already copies `labelElement`; the group push adds `label: (el.getAttribute('Label') ?? '').trim(),`. The return becomes:
```ts
  const hasLabelAttr = Array.from(root.getElementsByTagName('*')).some((e) => CONTROL_TAGS.has(e.tagName) && e.hasAttribute('Label'));
  return { ok: true, cols, cells, counts: tally(cells), warnings, hasLabelAttr };
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/utils/dialogXml`
Expected: PASS — all unit tests and all 45 fixtures.

- [ ] **Step 5: Typecheck** — `bun run typecheck`. Expected errors only in `src/utils/dialogXmlEdit.ts` (`labelElement` nullable) — fixed in Task 3. If anything else errors, fix it here.

- [ ] **Step 6: Commit (Tasks 1+2)**
```bash
git add docs/dialog-xml/fixtures/label-attr-*.xml docs/dialog-xml/fixtures/label-attr-*.expected.json docs/dialog-xml/fixtures/group-label.xml docs/dialog-xml/fixtures/group-label.expected.json docs/dialog-xml/README.md src/utils/dialogXml.ts src/utils/dialogXml.test.ts src/utils/dialogXml.fixtures.test.ts
git commit -m "feat(report-templates): Dialog XML Label attribute on controls and groups (preview parser + fixtures)"
```

---

### Task 3: Editor ops — self-labelled cells move alone; `relayout` keeps orphans apart (platform)

**Files:**
- Modify: `src/utils/dialogXmlEdit.ts`
- Modify: `src/utils/dialogXmlEdit.test.ts`

**Interfaces:**
- Consumes: `DialogField.labelElement: Element | null` (Task 2).
- Produces: no signature changes.

- [ ] **Step 1: Write failing tests** — append to `src/utils/dialogXmlEdit.test.ts`:

```ts
describe('Label attribute', () => {
  it('moves a self-labelled field as its control alone, and back to the original bytes', () => {
    const xml = read('label-attr-basic');
    const moved = moveCell(xml, keysOf(xml)[0], { end: 'dialog' });
    expect(shape(moved)).toEqual(['Location', 'Status', 'AsAt']);
    const keys = keysOf(moved);
    expect(moveCell(moved, keys[2], { before: keys[0] })).toBe(xml);
  });

  it('groups and ungroups self-labelled fields back to the original bytes', () => {
    const xml = read('label-attr-basic');
    const keys = keysOf(xml);
    const grouped = groupCells(xml, [keys[0], keys[1]]);
    expect(shape(grouped)).toEqual(['group:AsAt,Location', 'Status']);
    expect(ungroup(grouped, keysOf(grouped)[0])).toBe(xml);
  });

  it('does not join an orphan <Label> onto the self-labelled control after it', () => {
    const xml = '<Dialog>\n  <Label Text="B"/><Date Name="B"/>\n  <Label Text="Orphan"/>\n  <Date Name="A" Label="A"/>\n</Dialog>';
    const moved = moveCell(xml, keysOf(xml)[0], { end: 'dialog' });
    expect(moved).toBe('<Dialog>\n  <Label Text="Orphan"/>\n  <Date Name="A" Label="A"/>\n  <Label Text="B"/><Date Name="B"/>\n</Dialog>');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun run test -- src/utils/dialogXmlEdit`
Expected: FAIL — the first two throw/misbehave on a `null` node (`insertBefore(null…)` / `parentElement` of null); the third joins `<Label Text="Orphan"/><Date Name="A" Label="A"/>` on one line.

- [ ] **Step 3: Implement** in `src/utils/dialogXmlEdit.ts`:

```ts
const present = (nodes: (Element | null)[]): Element[] => nodes.filter((n): n is Element => n !== null);
```
(place above `locate`). In `locate`, wrap all three node lists: `nodes: present([c.from.labelElement, c.from.element, c.to.labelElement, c.to.element])`, `nodes: present([c.labelElement, c.element])`, `nodes: present([f.labelElement, f.element])`.

`hasHiddenToLabel`: `cell.to.labelElement?.getAttribute('Visible') === 'false'`.

`relayout` join condition becomes:
```ts
    // control ที่มี Label ในตัวไม่ใช่คู่ของ <Label> ข้างหน้า — ถ้ารวมบรรทัด XML จะดูเหมือนจับคู่ทั้งที่ไม่ได้จับ
    if (isEl(n, 'Label') && isEl(next) && next.tagName !== 'Label' && next.tagName !== 'Group' && !next.hasAttribute('Label')) {
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/utils/dialogXmlEdit`
Expected: PASS (all existing + 3 new). The existing round-trip test covers only `real-*` fixtures, so the new fixtures are exercised only by the 3 tests above.

- [ ] **Step 5: Typecheck** — `bun run typecheck` → Expected: clean.

- [ ] **Step 6: Commit**
```bash
git add src/utils/dialogXmlEdit.ts src/utils/dialogXmlEdit.test.ts
git commit -m "feat(report-templates): layout editor moves self-labelled fields and keeps orphan labels on their own line"
```

---

### Task 4: Preview + editor UI — heading, warning text, rollout notice (platform)

**Files:**
- Modify: `src/components/dialogPreview/warningText.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`
- Modify: `src/components/DialogPreview.tsx:63-65`
- Modify: `src/components/dialogPreview/CellView.tsx` (group branch of `CellBlock`)
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx` (labels map ~L58-68; group header ~L224-234)

**Interfaces:**
- Consumes: `group.label`, `hasLabelAttr`, `emptyLabel` (Task 2).

- [ ] **Step 1: i18n** — in `src/i18n/en.ts` under `components.dialogPreview`, after `warnControlWithoutLabel`:
```ts
      warnEmptyLabel: '{{at}} has an empty Label, so its Name is shown instead',
```
after `groupNeedsInventory`:
```ts
      labelAttrNeedsInventory: 'Label on <Date>/<Lookup> needs the inventory release that supports it. On older inventory builds, those fields disappear.',
```
In `src/i18n/th.ts`, same positions:
```ts
      warnEmptyLabel: '{{at}} มี Label ว่าง จึงแสดง Name แทน',
```
```ts
      labelAttrNeedsInventory: 'Label บน <Date>/<Lookup> ต้องใช้ inventory เวอร์ชันที่รองรับ ถ้าเป็นเวอร์ชันเก่า field นั้นจะหายไป',
```

- [ ] **Step 2: warningText** — add a case:
```ts
    case 'emptyLabel':
      return t('components.dialogPreview.warnEmptyLabel', { at: w.at });
```

- [ ] **Step 3: Rollout notice** — `src/components/DialogPreview.tsx`, after the `groupNeedsInventory` line:
```ts
  // ลบบรรทัดนี้เมื่อ inventory รุ่นที่รองรับ Label บน control ขึ้น production แล้ว (docs/dialog-xml/README.md)
  if (parsed.hasLabelAttr) notices.push(t('components.dialogPreview.labelAttrNeedsInventory'));
```

- [ ] **Step 4: Static preview heading** — `CellView.tsx` `CellBlock`: add `const headingId = React.useId();` as the first line of the component, and replace the group branch with:
```tsx
  if (cell.kind === 'group') {
    return (
      <div
        role={cell.label ? 'group' : undefined}
        aria-labelledby={cell.label ? headingId : undefined}
        className={cn('space-y-3 rounded-md border border-dashed p-3', span)}
      >
        {cell.label && (
          <p id={headingId} className="text-sm font-medium">
            {cell.label}
          </p>
        )}
        <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[Math.min(cell.fields.length, MAX_COLS)])}>
          {cell.fields.map((f) => (
            <FieldBlock key={f.key} field={f} t={t} />
          ))}
        </div>
      </div>
    );
  }
```
(If `CellBlock` is not a component rendered as `<CellBlock …/>` everywhere, use `` `dialog-group-${cell.key}` `` as the id instead of `useId` — record a Ruling.)

- [ ] **Step 5: Editor** — `DialogLayoutEditor.tsx` labels map:
```ts
    if (c.kind === 'group') {
      groupNo++;
      const name = c.label || `${groupWord} ${groupNo}`;
      labels.set(c.key, name);
      labels.set(`end:${c.key}`, `${t('components.dialogPreview.editor.dropAtEnd')} (${name})`);
      c.fields.forEach((f) => labels.set(f.key, f.label));
    } else labels.set(c.key, cellLabel(c));
```
Group header: replace the absolutely positioned `<span>` and `<Button>` (left-3 / left-14) with one row that truncates a long label:
```tsx
                  <div className="rounded-md border border-dashed p-3 pt-8">
                    <div className="absolute left-3 right-28 top-1 flex min-w-0 items-center gap-2">
                      <span className="truncate text-[11px] font-medium text-muted-foreground" title={label}>
                        {label}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[11px]"
                        onClick={() => apply(ungroup(xml, cell.key))}
                      >
                        {t('components.dialogPreview.editor.ungroup')}
                      </Button>
                    </div>
```

- [ ] **Step 6: Static checks + suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all clean / all pass.

- [ ] **Step 7: Commit**
```bash
git add src/components/dialogPreview/warningText.ts src/i18n/en.ts src/i18n/th.ts src/components/DialogPreview.tsx src/components/dialogPreview/CellView.tsx src/components/dialogPreview/DialogLayoutEditor.tsx
git commit -m "feat(report-templates): Dialog preview shows group headings, empty-Label warning, and Label rollout notice"
```

---

### Task 5: Inventory run dialog — parser, fixtures, heading (inventory)

Repo: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react`. First: `git checkout main && git pull --ff-only && git checkout -b feature/dialog-control-label-attr`.

**Files:**
- Copy: platform `docs/dialog-xml/fixtures/{label-attr-*,group-label}.{xml,expected.json}` → `routes/report/list/__fixtures__/dialog-xml/`
- Modify: `routes/report/list/dialog-fixtures.test.ts`
- Modify: `routes/report/list/parse-report-dialog.ts`
- Modify: `routes/report/list/report-param-dialog.tsx` (group branch ~L802-814)
- Possibly modify: `routes/report/list/parse-report-dialog.test.ts` (literal node expectations)

**Interfaces:**
- Produces: `LookupNode.selfLabel: string | null`, `DateNode.selfLabel: string | null`, `GroupCell.label: string`.

- [ ] **Step 1: Copy fixtures**
```bash
cp ../carmen-platform/docs/dialog-xml/fixtures/label-attr-* ../carmen-platform/docs/dialog-xml/fixtures/group-label.* routes/report/list/__fixtures__/dialog-xml/
```

- [ ] **Step 2: Label-aware runner** — in `dialog-fixtures.test.ts`:
```ts
interface ExpectedCell {
  kind: string;
  colSpan: number;
  names: string[];
  labels?: string[];
  heading?: string;
}

function summarize(parsed: ParsedDialog) {
  return {
    cols: parsed.cols,
    cells: parsed.cells.map((c): ExpectedCell => {
      if (c.kind === "range")
        return { kind: "range", colSpan: c.colSpan, names: [c.from.name, c.to.name], labels: [c.label] };
      if (c.kind === "group")
        return {
          kind: "group",
          colSpan: c.colSpan,
          names: c.fields.map((f) => f.control.name),
          labels: c.fields.map((f) => f.label),
          heading: c.label,
        };
      return { kind: "single", colSpan: c.colSpan, names: [c.control.name], labels: [c.label] };
    }),
  };
}

// labels / heading เทียบเฉพาะ fixture ที่ระบุไว้ — fixture ชุดเดิมไม่มีสองคีย์นี้
const fit = (actual: ExpectedCell[], expected: ExpectedCell[]): ExpectedCell[] =>
  actual.map((c, i) => {
    const e = expected[i] ?? {};
    const out: ExpectedCell = { kind: c.kind, colSpan: c.colSpan, names: c.names };
    if ("labels" in e) out.labels = c.labels;
    if ("heading" in e) out.heading = c.heading;
    return out;
  });
```
Test body:
```ts
    const s = summarize(parseReportDialog(xml));
    expect({ cols: s.cols, cells: fit(s.cells, expected.cells) }).toEqual({
      cols: expected.cols,
      cells: expected.cells,
    });
```

- [ ] **Step 3: Run — new fixtures fail**

Run: `bunx vitest run routes/report/list/dialog-fixtures.test.ts`
Expected: FAIL on the 6 new fixtures; existing PASS.

- [ ] **Step 4: Parser** — `parse-report-dialog.ts`:
  - `LookupNode` and `DateNode` add (after `colSpan`):
    ```ts
      /** ค่า attribute Label บน control เอง — null = ไม่มี (ใช้ <Label> ข้างหน้าแบบเดิม) */
      selfLabel: string | null;
    ```
  - `GroupCell` adds `label: string;` with comment `/** หัวข้อจาก <Group Label> (trim แล้ว) — "" = ไม่แสดง */`.
  - `parseNodes`: both control pushes add `selfLabel: child.getAttribute("Label"),`.
  - `parseReportDialog` group push: `cells.push({ kind: "group", colSpan: readSpan(child, cols), label: (child.getAttribute("Label") ?? "").trim(), fields });`
  - `groupFields` loop (mirror of the preview, line for line):
    ```ts
      while (i < nodes.length) {
        const node = nodes[i];

        // control ที่มี Label ในตัวเป็น field เดี่ยวเสมอ — ไม่หยิบ <Label> ข้างหน้า ไม่จับคู่ช่วง
        if (isControl(node) && node.selfLabel !== null) {
          fields.push({
            kind: "single",
            label: node.selfLabel.trim() || node.name,
            control: node,
            colSpan: node.colSpan,
          });
          i++;
          continue;
        }

        if (node.type !== "label" || !node.visible) {
          i++;
          continue;
        }

        const next = nodes[i + 1];
        if (!isControl(next) || next.selfLabel !== null) {
          i++;
          continue;
        }

        const afterControl = nodes[i + 2];
        const toControl = nodes[i + 3];

        const isPaired =
          (isToLabel(afterControl) && isControl(toControl)) ||
          (afterControl?.type === "label" && isNamedPair(next, toControl));
        if (pairRanges && isPaired && isControl(toControl) && toControl.selfLabel === null) {
    ```
    (rest unchanged).

- [ ] **Step 5: Run the list tests**

Run: `bunx vitest run routes/report/list`
Expected: PASS. If an existing assertion in `parse-report-dialog.test.ts` compares a whole node object with `toEqual` and now misses `selfLabel`, add `selfLabel: null` to that literal (record nothing — it is the new field's default).

- [ ] **Step 6: Heading in the run dialog** — `report-param-dialog.tsx` group branch:
```tsx
                    cell.kind === "group" ? (
                      <div
                        key={cellKey(cell)}
                        role={cell.label ? "group" : undefined}
                        aria-labelledby={cell.label ? `${cellKey(cell)}-heading` : undefined}
                        className={cn("space-y-2", COL_SPAN[cell.colSpan])}
                      >
                        {cell.label && (
                          <p id={`${cellKey(cell)}-heading`} className="text-sm font-medium">
                            {cell.label}
                          </p>
                        )}
                        <div
                          className={cn(
                            "grid grid-cols-1 gap-3",
                            GRID_COLS[Math.min(cell.fields.length, MAX_COLS)],
                          )}
                        >
                          {cell.fields.map((f) => (
                            <ReportField key={f.control.name} field={f} periods={periods} />
                          ))}
                        </div>
                      </div>
                    ) : (
```

- [ ] **Step 7: Static checks + suite**

Run: `bun run typecheck && bun run lint && bunx vitest run routes/report`
Expected: clean / PASS.

- [ ] **Step 8: Commit** (explicit paths — never `package.json`)
```bash
git add routes/report/list/__fixtures__/dialog-xml/label-attr-* routes/report/list/__fixtures__/dialog-xml/group-label.* routes/report/list/dialog-fixtures.test.ts routes/report/list/parse-report-dialog.ts routes/report/list/parse-report-dialog.test.ts routes/report/list/report-param-dialog.tsx
git commit -m "feat(report): run dialog reads Label attribute on controls and shows <Group Label> headings"
```
(drop `parse-report-dialog.test.ts` from the list if Step 5 did not touch it.)

---

### Task 6: Inventory schedule form label precedence (inventory)

**Files:**
- Modify: `routes/report/schedules/parse-schedule-dialog.ts:47-78`
- Modify: `routes/report/schedules/parse-schedule-dialog.test.ts`

- [ ] **Step 1: Failing test** — append inside `describe("parseScheduleDialog", …)`:
```ts
  it("uses a control's own Label before the preceding <Label>, and Name when it is blank", () => {
    const fields = parseScheduleDialog(`<Dialog>
      <Label Text="Ignored"/><Lookup Name="Vendor" Label="Supplier" Items="ALL" Values="ALL"/>
      <Label Text="Ignored too"/><Date Name="AsAt" Label=" "/>
      <Label Text="Location"/><Lookup Name="Location" Items="ALL" Values="ALL"/>
    </Dialog>`);

    expect(fields.map((f) => [f.name, f.label])).toEqual([
      ["Vendor", "Supplier"],
      ["AsAt", "AsAt"],
      ["Location", "Location"],
    ]);
  });
```

- [ ] **Step 2: Run** — `bunx vitest run routes/report/schedules` → Expected: FAIL (`["Vendor","Ignored"]`, `["AsAt","Ignored too"]`).

- [ ] **Step 3: Implement** — after the `if (!name) { … }` block:
```ts
      // Label บน control ชนะ <Label> ข้างหน้าเสมอ — ค่าว่างแสดง Name (ตรงกับหน้ารัน report)
      const own = child.getAttribute("Label");
      const label = own !== null ? own.trim() || name : currentLabel || name;
```
and replace the three `label: currentLabel || name` with `label`.

- [ ] **Step 4: Run** — `bunx vitest run routes/report/schedules && bun run typecheck && bun run lint` → Expected: PASS / clean.

- [ ] **Step 5: Commit**
```bash
git add routes/report/schedules/parse-schedule-dialog.ts routes/report/schedules/parse-schedule-dialog.test.ts
git commit -m "feat(report): schedule form takes the Label attribute on Dialog controls"
```

---

### Task 7: micro-report filter header (micro-report)

Repo: `/Users/samutpra/GitHub/carmensoftware-organize/micro-report`. First: `git checkout main && git pull --ff-only && git checkout -b feature/dialog-control-label-attr`.

**Files:**
- Modify: `service/template_filter_inject.go` (`parseDialogDefs`, ~L43-83)
- Modify: `service/template_filter_inject_test.go`

- [ ] **Step 1: Failing test** — append after `TestParseDialogDefs_DescendsIntoGroups`:
```go
func TestParseDialogDefs_LabelAttr(t *testing.T) {
	dialog := `<Dialog>
  <Label Text="Ignored"/><Lookup Name="Vendor" Label="Supplier"/>
  <Label Text="Ignored too"/><Date Name="AsAt" Label="  "/>
  <Label Text="Location"/><Lookup Name="Location"/>
  <Group Label="Period"><Date Name="DateFrom" Label="Date from"/></Group>
</Dialog>`

	got := parseDialogDefs(dialog)
	want := []dialogDef{
		{Label: "Supplier", Name: "Vendor"},
		{Label: "AsAt", Name: "AsAt"},
		{Label: "Location", Name: "Location"},
		{Label: "Date from", Name: "DateFrom"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseDialogDefs with Label attributes:\n got %+v\nwant %+v", got, want)
	}
}
```

- [ ] **Step 2: Run** — `go test ./service/ -run TestParseDialogDefs -v` → Expected: FAIL on `TestParseDialogDefs_LabelAttr` (`Ignored`, `Ignored too`, `DateFrom`).

- [ ] **Step 3: Implement**
```go
	type xmlControl struct {
		Name   string  `xml:"Name,attr"`
		Label  *string `xml:"Label,attr"` // pointer: absent vs empty must differ
		Items  string  `xml:"Items,attr"`
		Values string  `xml:"Values,attr"`
	}
```
and in the `"Date", "Lookup"` case:
```go
				// Label on the control always wins over a preceding <Label>; blank → Name
				label := pendingLabel
				if ctrl.Label != nil {
					label = strings.TrimSpace(*ctrl.Label)
				}
				if label == "" {
					label = ctrl.Name
				}
```

- [ ] **Step 4: Run** — `go test ./service/ -run 'TestParseDialogDefs|TestInject' -v && go vet ./service/` → Expected: PASS / clean. Then `go test ./service/` → Expected: only the pre-existing `TestBuildFilterSubtitle` failure (compare with `git stash; go test ./service/; git stash pop` if unsure).

- [ ] **Step 5: Commit** (explicit paths — never `.claude/`)
```bash
git add service/template_filter_inject.go service/template_filter_inject_test.go
git commit -m "feat(report): filter header uses the Label attribute on Dialog controls"
```

---

### Task 8: Browser verification (platform local, never saved)

No code. Platform dev server (`bun run dev:dev`, port 3304), Report Template Edit → Dialog XML tab, edit mode. Do not press Save.

- [ ] Paste `label-attr-basic.xml`: Preview shows "As at", "Location", "Status" (Status spans 2); the `labelAttrNeedsInventory` notice shows.
- [ ] Paste `label-attr-empty.xml`: fields show "AsAt"/"Status"; two empty-Label warnings.
- [ ] Paste `group-label.xml`: static preview (read mode) shows heading "Period" on the first group only; editor header shows "Period", then "กลุ่ม 2", "กลุ่ม 3"; no `labelAttrNeedsInventory` notice.
- [ ] Set the first group's Label to a 60-character string in the XML tab: editor header truncates; Ungroup button and the top-right toolbar stay clickable and do not overlap.
- [ ] With `label-attr-basic.xml`: drag "As at" to the end, group two cells, change ColSpan — the Dialog XML tab shows self-labelled controls on their own lines. Then Cancel.
- [ ] Inventory localhost run dialog with a pasted test XML — only if a local inventory + a report with editable dialog is reachable; the user signs in. Otherwise record "not verified in inventory browser" in the final report.

---

## Finish

Per repo: push the branch and open a PR to `main` (the user decides on merge). Report the rollout rule again: no live template may use `Label=` on a control until inventory production has the release; `<Group Label>` is safe.
