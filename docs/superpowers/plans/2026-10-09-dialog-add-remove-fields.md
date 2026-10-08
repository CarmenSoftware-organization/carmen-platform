# Dialog Layout Editor: add and remove fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors add Date / Lookup / Date-range / Lookup-range fields and delete cells (with Undo) from the Dialog layout editor, without typing XML.

**Architecture:** Two new pure `xml → xml` ops (`insertField`, `deleteCell`) plus a lookup helper (`keyOfName`) in `src/utils/dialogXmlEdit.ts`, built on the module's existing `load` / `locate` / `relayout` / `save`. The editor (`DialogLayoutEditor.tsx`) gains an "Add field" dropdown and a delete path (cell toolbar, group-field toolbar, property-panel header) with a sonner Undo toast.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom), Radix `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`), sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-09-dialog-add-remove-fields-design.md`

## Global Constraints

- `carmen-platform` only; the Dialog XML format does not change. No inventory / micro-report / backend change.
- Branch `feature/dialog-add-remove-fields` (already checked out). Never commit to `main`.
- Generated labels are classic `<Label Text="New field"/>` — never a `Label=` attribute on a control.
- New Lookups get `DataSource="@product_list"`.
- Ops never throw; broken XML or an unknown key returns the input unchanged (`insertField` → `{ xml, name: null }`).
- Only the container that changed is re-laid-out; the rest of the string is byte-identical.
- Never modify `src/components/ui/`. Never use `alert`/`confirm`. No new libraries.
- Every user-visible string goes through i18n, in both `src/i18n/en.ts` and `src/i18n/th.ts`.
- Static checks before every commit: `bun run typecheck && bun run lint`. Existing suites must stay green (`bun run test`).
- Do not write component tests; the UI is verified in the browser by the controller.

## Review Focus

1. **Undo after the editor closed** — Save/Cancel unmounts the editor while the Undo toast is still visible; clicking Undo must not write into the form (the same class of bug as the RowsEditor resurrection fixed in #341). Expect: nothing written, "can't undo" info toast.
2. **Esc while the Add menu is open** — Radix closes the menu on a capture-phase document listener and the page's Cancel shortcut listens on `window`; one Esc must close only the menu. Expect: page stays in edit mode.
3. **Focus after delete** — the deleted cell's DOM node (and its toolbar button holding focus) disappears; focus must land on a neighbouring cell or the Add button, never `body` (an Esc on `body` cancels the page).
4. **Keyboard focus into the panel after add** — the panel's Delete button sits before the inputs; `focusCell`'s selector `input,select,button:not([aria-label])` and the add path's selector must not land on it. Expect: Label input (Date) or DataSource input (Lookup).
5. **Delete while the panel shows an error on another cell** — keys shift and the panel clears, which would drop the invalid draft silently. Expect: refused with the `fixErrorFirst` toast (deleting the focused cell itself is allowed).

---

### Task 1: `insertField`, `deleteCell`, `keyOfName` ops

**Files:**
- Modify: `src/utils/dialogXmlEdit.ts` (append after `setGroupLabel`, before `containerMap`)
- Test: `src/utils/dialogXmlEdit.test.ts` (extend the import list; append a `describe('add and remove', …)` block)
- Modify: `docs/dialog-xml/README.md` (one short section)

**Interfaces:**
- Consumes (existing, module-private): `load(xml): Loaded | null`, `locate(l, key): Located | null` (`Located.nodes`, `Located.inGroup`), `relayout(container, eol)`, `save(l)`; `CONTROL_TAGS` from `./dialogXml`.
- Produces:
  - `export type NewFieldKind = 'date' | 'lookup' | 'dateRange' | 'lookupRange';`
  - `export const NEW_FIELD_LABEL = 'New field';`
  - `export const NEW_LOOKUP_SOURCE = '@product_list';`
  - `export function insertField(xml: string, afterKey: string | null, kind: NewFieldKind): { xml: string; name: string | null }`
  - `export function deleteCell(xml: string, key: string): string`
  - `export function keyOfName(cells: DialogCell[], name: string): string | null`

- [ ] **Step 1: Write the failing tests**

Add `deleteCell, insertField, keyOfName` to the existing import from `./dialogXmlEdit` (keep alphabetical order), and append:

```ts
describe('add and remove', () => {
  const GROUPED = `<Dialog Cols="2">
  <Label Text="Vendor"/><Lookup Name="Vendor" DataSource="@vendor_list"/>
  <Group ColSpan="2">
    <Label Text="A"/><Date Name="A"/>
    <Label Text="B"/><Date Name="B"/>
  </Group>
</Dialog>`;

  it('inserts each kind at the end and it parses back as that kind', () => {
    const d = insertField(SIMPLE, null, 'date');
    expect(d.name).toBe('Date1');
    expect(d.xml).toContain('<Label Text="New field"/><Date Name="Date1"/>');
    expect(shape(d.xml).at(-1)).toBe('Date1');
    const l = insertField(SIMPLE, null, 'lookup');
    expect(l.xml).toContain('<Lookup Name="Lookup1" DataSource="@product_list"/>');
    const dr = insertField(SIMPLE, null, 'dateRange');
    expect(dr.name).toBe('Date1From');
    expect(shape(dr.xml).at(-1)).toBe('range:Date1From,Date1To');
    const lr = insertField(SIMPLE, null, 'lookupRange');
    expect(shape(lr.xml).at(-1)).toBe('range:Lookup1From,Lookup1To');
    expect(lr.xml.match(/DataSource="@product_list"/g)).toHaveLength(2);
  });

  it('places after a field, after a range, after a group, and into a group', () => {
    // SIMPLE cells: range DateFrom/DateTo, Status
    const afterRange = insertField(SIMPLE, keysOf(SIMPLE)[0], 'date');
    expect(shape(afterRange.xml)).toEqual(['range:DateFrom,DateTo', 'Date1', 'Status']);
    const afterField = insertField(SIMPLE, keysOf(SIMPLE)[1], 'date');
    expect(shape(afterField.xml)).toEqual(['range:DateFrom,DateTo', 'Status', 'Date1']);
    const [vendor, group] = keysOf(GROUPED);
    expect(shape(insertField(GROUPED, vendor, 'date').xml)).toEqual(['Vendor', 'Date1', 'group:A,B']);
    expect(shape(insertField(GROUPED, group, 'date').xml)).toEqual(['Vendor', 'group:A,B', 'Date1']);
    const a = (cellsOf(GROUPED)[1] as Extract<DialogCell, { kind: 'group' }>).fields[0].key;
    expect(shape(insertField(GROUPED, a, 'date').xml)).toEqual(['Vendor', 'group:A,Date1,B']);
    // a range never goes into a group
    expect(shape(insertField(GROUPED, a, 'dateRange').xml)).toEqual(['Vendor', 'group:A,B', 'range:Date1From,Date1To']);
  });

  it('generates names unused anywhere in the document, groups included', () => {
    const x = `<Dialog>
  <Label Text="x"/><Date Name="Date1"/>
  <Group>
    <Label Text="y"/><Date Name="Date2From"/>
  </Group>
</Dialog>`;
    expect(insertField(x, null, 'date').name).toBe('Date2');
    expect(insertField(x, null, 'dateRange').name).toBe('Date3From');
  });

  it('leaves the string outside the changed container byte-identical', () => {
    const [, group] = keysOf(GROUPED);
    const a = (cellsOf(GROUPED)[1] as Extract<DialogCell, { kind: 'group' }>).fields[0].key;
    const out = insertField(GROUPED, a, 'date').xml;
    expect(out).toBe(GROUPED.replace('<Label Text="A"/><Date Name="A"/>\n', '<Label Text="A"/><Date Name="A"/>\n    <Label Text="New field"/><Date Name="Date1"/>\n'));
    expect(group).toBe('g1');
  });

  it('insertField: bad key or broken XML returns the input and name null', () => {
    expect(insertField(SIMPLE, 'nope', 'date')).toEqual({ xml: SIMPLE, name: null });
    expect(insertField('<Dialog>', null, 'date')).toEqual({ xml: '<Dialog>', name: null });
  });

  it('deleteCell removes a classic field, a self-labelled field, a range, and a group', () => {
    expect(shape(deleteCell(SIMPLE, keysOf(SIMPLE)[1]))).toEqual(['range:DateFrom,DateTo']);
    const r = deleteCell(SIMPLE, keysOf(SIMPLE)[0]);
    expect(shape(r)).toEqual(['Status']);
    expect(r).not.toContain('<Label Text="Date');
    const self = `<Dialog>
  <Date Name="D" Label="Day"/>
  <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
</Dialog>`;
    expect(deleteCell(self, keysOf(self)[0])).toBe(`<Dialog>
  <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
</Dialog>`);
    expect(shape(deleteCell(GROUPED, keysOf(GROUPED)[1]))).toEqual(['Vendor']);
  });

  it('deleteCell removes a range whose To label is hidden', () => {
    const x = `<Dialog>
  <Label Text="Period"/><Date Name="P1"/>
  <Label Text="x" Visible="false"/><Date Name="P2"/>
</Dialog>`;
    expect(deleteCell(x, keysOf(x)[0])).toBe('<Dialog/>');
  });

  it('deleting the last field of a group removes the group too', () => {
    const x = `<Dialog>
  <Group>
    <Label Text="A"/><Date Name="A"/>
  </Group>
  <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
</Dialog>`;
    const a = (cellsOf(x)[0] as Extract<DialogCell, { kind: 'group' }>).fields[0].key;
    expect(deleteCell(x, a)).toBe(`<Dialog>
  <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
</Dialog>`);
  });

  it('deleting everything leaves an empty Dialog that still parses, and fields can be added back', () => {
    let x = SIMPLE;
    while (keysOf(x).length) x = deleteCell(x, keysOf(x)[0]);
    expect(x).toBe('<Dialog Cols="2"/>');
    expect(parseDialogXml(x).ok).toBe(true);
    expect(shape(insertField(x, null, 'date').xml)).toEqual(['Date1']);
  });

  it('insert then delete the new cell returns the original bytes', () => {
    const { xml: added, name } = insertField(SIMPLE, keysOf(SIMPLE)[0], 'lookupRange');
    const key = keyOfName(cellsOf(added), name as string) as string;
    expect(deleteCell(added, key)).toBe(SIMPLE);
  });

  it('keyOfName finds top-level fields, range From names, and fields inside groups', () => {
    const cells = cellsOf(GROUPED);
    expect(keyOfName(cells, 'Vendor')).toBe(cells[0].key);
    expect(keyOfName(cells, 'B')).toBe((cells[1] as Extract<DialogCell, { kind: 'group' }>).fields[1].key);
    expect(keyOfName(cellsOf(SIMPLE), 'DateFrom')).toBe(keysOf(SIMPLE)[0]);
    expect(keyOfName(cells, 'Nope')).toBeNull();
  });

  it('deleteCell: bad key or broken XML returns the input', () => {
    expect(deleteCell(SIMPLE, 'nope')).toBe(SIMPLE);
    expect(deleteCell('<Dialog>', '0-0')).toBe('<Dialog>');
  });
});
```

Notes for the implementer:
- `shape`, `keysOf`, `cellsOf`, `SIMPLE` already exist at the top of the test file; `DialogCell` and `parseDialogXml` are already imported.
- If an expected byte string differs **only** because `relayout` normalises whitespace differently from what is written above (e.g. the empty root serialises as `<Dialog Cols="2"></Dialog>` instead of `<Dialog Cols="2"/>`), fix the **test literal** to the real output and say so in your report — do not bend the op to match. A difference in anything other than whitespace or self-closing form is a real failure.
- If `g1` is not the group key in `GROUPED`, drop that one `expect(group)` line — it only documents the key scheme.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/utils/dialogXmlEdit.test.ts`
Expected: FAIL — `insertField` / `deleteCell` / `keyOfName` are not exported.

- [ ] **Step 3: Implement**

Append to `src/utils/dialogXmlEdit.ts` after `setGroupLabel`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/utils/dialogXmlEdit.test.ts`
Expected: PASS (all old tests plus the new `add and remove` block).

- [ ] **Step 5: Document what the editor generates**

In `docs/dialog-xml/README.md`, after the section that describes the layout editor / `Cols` (find the heading that mentions the editor; if there is none, append at the end), add:

```markdown
### Fields added by the layout editor

The editor's **Add field** menu writes classic pairs only — never `Label=` (see the
rollout rule above):

| Kind | XML |
|---|---|
| Date | `<Label Text="New field"/><Date Name="Date1"/>` |
| Lookup | `<Label Text="New field"/><Lookup Name="Lookup1" DataSource="@product_list"/>` |
| Date range | `<Label Text="New field"/><Date Name="Date1From"/>` + `<Label Text="to"/><Date Name="Date1To"/>` |
| Lookup range | as Date range, with `<Lookup … DataSource="@product_list"/>` on both sides |

The number is the smallest one that keeps every `Name` in the dialog unique.
Deleting the last field of a `<Group>` removes the group as well.
```

- [ ] **Step 6: Static checks and full suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all clean; test count = previous 1393 + the new block.

- [ ] **Step 7: Commit**

```bash
git add src/utils/dialogXmlEdit.ts src/utils/dialogXmlEdit.test.ts docs/dialog-xml/README.md
git commit -m "feat(report-templates): Dialog XML ops to insert and delete fields"
```

---

### Task 2: Delete from the editor (cell toolbar, group field, panel header) with Undo

**Files:**
- Modify: `src/components/dialogPreview/CellToolbar.tsx`
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx`
- Modify: `src/components/dialogPreview/PropertyPanel.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `deleteCell(xml, key): string` from Task 1.
- Produces (used by Task 3): in `DialogLayoutEditor`, `addRef: React.RefObject<HTMLButtonElement | null>` (declared here, attached to the Add button in Task 3; until then the delete focus fallback simply finds nothing), and `xmlRef` / `onChangeRef` (latest-value refs).

- [ ] **Step 1: i18n keys**

`src/i18n/en.ts`, inside `components.dialogPreview.editor` (after `ungroup`):

```ts
        // {{label}} is the field's label text from the XML (or a group's name)
        deleteCell: 'Delete {{label}}',
        deleted: 'Deleted {{label}}',
        undo: 'Undo',
        undoStale: "Can't undo — the dialog changed since",
```

and inside `components.dialogPreview.panel` (after `close`):

```ts
        delete: 'Delete',
        // {{label}} is the panel title, e.g. "Lookup · Vendor"
        deleteAria: 'Delete {{label}}',
```

`src/i18n/th.ts`, same positions:

```ts
        deleteCell: 'ลบ {{label}}',
        deleted: 'ลบ {{label}} แล้ว',
        undo: 'เลิกทำ',
        undoStale: 'เลิกทำไม่ได้ — dialog ถูกแก้ไปแล้วหลังจากลบ',
```

```ts
        delete: 'ลบ',
        deleteAria: 'ลบ {{label}}',
```

- [ ] **Step 2: `CellToolbar` gets an optional delete button**

In `src/components/dialogPreview/CellToolbar.tsx`: import `Trash2` alongside `Minus, Plus`; add `onDelete?: () => void;` to `CellToolbarProps` and destructure it; render, right before `{handle}`:

```tsx
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          aria-label={t('components.dialogPreview.editor.deleteCell', { label })}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
```

- [ ] **Step 3: `deleteAt` in `DialogLayoutEditor`**

Add imports: `deleteCell` from `../../utils/dialogXmlEdit` (into the existing import list), `Trash2` from `lucide-react`.

Below `applyKeepingSelection`, add:

```tsx
  // Undo จาก toast อาจถูกกดหลัง render อื่น ๆ หรือหลัง editor ปิดไปแล้ว — อ่านค่าล่าสุดผ่าน ref เสมอ
  const xmlRef = React.useRef(xml);
  xmlRef.current = xml;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const addRef = React.useRef<HTMLButtonElement | null>(null);
  const undoDelete = (before: string, after: string) => {
    // editor ปิดแล้ว (Save/Cancel) หรือมีการแก้หลังลบ — เขียน XML ก่อนลบทับไม่ได้ ไม่งั้นฟอร์มต่างจากที่ผู้ใช้เห็น/บันทึก
    if (!mountedRef.current || xmlRef.current !== after) {
      toast.info(t('components.dialogPreview.editor.undoStale'));
      return;
    }
    onChangeRef.current(before);
  };
  // ลบ cell — ห้ามลบตอนแผงมี error ของ cell อื่น (key เลื่อนแล้วแผงล้าง ร่างที่ผิดจะหายเงียบ); ลบ cell ที่แก้อยู่เองได้
  const deleteAt = (key: string) => {
    if (key !== focusKey && blockedSwitch()) return;
    const next = deleteCell(xml, key);
    if (next === xml) return;
    const label = nameOf(key);
    // field สุดท้ายในกลุ่มพากลุ่มออกไปด้วย — ตำแหน่งที่หายไปคือตำแหน่งของกล่องกลุ่ม
    const owner = parsed.cells.find((c) => c.kind === 'group' && c.fields.some((f) => f.key === key));
    const anchor = owner && owner.kind === 'group' && owner.fields.length === 1 ? owner.key : key;
    const flat = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-cell-key]') ?? []);
    const index = flat.findIndex((el) => el.dataset.cellKey === anchor);
    setFocus({ xml: next, key: null });
    onChange(next);
    // ปุ่มที่กดหายไปพร้อม cell — focus ตกที่ body แล้ว Esc ถัดไปจะยกเลิกทั้งหน้า จึงพาไปที่ cell ข้างเคียงหรือปุ่ม Add field
    requestAnimationFrame(() => {
      const after = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-cell-key]') ?? []);
      (after[index] ?? after[index - 1] ?? addRef.current)?.focus();
    });
    toast(t('components.dialogPreview.editor.deleted', { label }), {
      duration: 10000,
      action: { label: t('components.dialogPreview.editor.undo'), onClick: () => undoDelete(xml, next) },
    });
  };
```

Note: `mountedRef` is declared further down in the component today. Move the `mountedRef` declaration (the `const mountedRef = React.useRef(true);` line only — leave its `useEffect` where it is) up above `undoDelete`, or move these new declarations below it; either is fine as long as `mountedRef` is declared before use in source order.

Wire it:
- top-level `toolbar` (the `CellToolbar` call): add `onDelete={() => deleteAt(cell.key)}`.
- group-field toolbar (the inline `<div className="absolute right-1 top-1 z-10 …">{handle}</div>`): make it a flex row and add a delete button before `{handle}`:

```tsx
                            toolbar={(handle) => (
                              <div className="absolute right-1 top-1 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  aria-label={t('components.dialogPreview.editor.deleteCell', { label: f.label })}
                                  onClick={() => deleteAt(f.key)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                {handle}
                              </div>
                            )}
```

- `<PropertyPanel … onDelete={deleteAt} />`.

- [ ] **Step 4: Delete button in the panel header**

In `src/components/dialogPreview/PropertyPanel.tsx`: add `onDelete: (key: string) => void;` to `PropertyPanelProps` (after `onClose`) and destructure it; import `Trash2` next to `X`. In the header row (the `{f && (…)}` block), wrap the existing × button with the new button in a `div`:

```tsx
          <div className="flex shrink-0 items-center gap-1">
            {/* aria-label กันตัวเลือก focusCell ('button:not([aria-label])') ไม่ให้เลือกปุ่มนี้แทนช่องแรกของแผง */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              aria-label={t('components.dialogPreview.panel.deleteAria', { label: title })}
              onClick={() => focusKey && onDelete(focusKey)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('components.dialogPreview.panel.delete')}
            </Button>
            {/* existing × button unchanged */}
          </div>
```

- [ ] **Step 5: Static checks and suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/dialogPreview/CellToolbar.tsx src/components/dialogPreview/DialogLayoutEditor.tsx src/components/dialogPreview/PropertyPanel.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): delete Dialog cells from the layout editor with Undo"
```

---

### Task 3: "Add field" menu

**Files:**
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `insertField`, `keyOfName`, `type NewFieldKind` (Task 1); `addRef` (Task 2); `parseDialogXml` from `../../utils/dialogXml`; `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel` from `../ui/dropdown-menu`; existing `blockedSwitch`, `setFocus`, `canvasRef`, `panelRef`, `nameOf`, `onDragActiveChange`.

- [ ] **Step 1: i18n keys**

`src/i18n/en.ts`, `components.dialogPreview.editor` (after the Task 2 keys):

```ts
        addField: 'Add field',
        addDate: 'Date',
        addLookup: 'Lookup',
        addDateRange: 'Date range (From / To)',
        addLookupRange: 'Lookup range (From / To)',
        addAtEnd: 'Adds at the end',
        // {{label}} is a field label, {{group}} a group's name
        addAfter: 'Adds after {{label}}',
        addInGroup: 'Adds to {{group}}, after {{label}}',
        addRangeAfterGroup: 'after {{group}}',
```

`src/i18n/th.ts`:

```ts
        addField: 'เพิ่ม field',
        addDate: 'วันที่ (Date)',
        addLookup: 'รายการเลือก (Lookup)',
        addDateRange: 'ช่วงวันที่ (From / To)',
        addLookupRange: 'ช่วงรายการเลือก (From / To)',
        addAtEnd: 'เพิ่มท้ายสุด',
        addAfter: 'เพิ่มต่อจาก {{label}}',
        addInGroup: 'เพิ่มใน {{group}} ต่อจาก {{label}}',
        addRangeAfterGroup: 'ต่อจาก {{group}}',
```

- [ ] **Step 2: Add logic in `DialogLayoutEditor`**

Imports: add `insertField, keyOfName, type NewFieldKind` to the `../../utils/dialogXmlEdit` import; add `parseDialogXml` to the `../../utils/dialogXml` import; add `Plus` to the `lucide-react` import; import the five dropdown parts from `../ui/dropdown-menu`.

Module scope (next to `cellLabel`):

```tsx
const ADD_KINDS: { kind: NewFieldKind; key: 'addDate' | 'addLookup' | 'addDateRange' | 'addLookupRange'; range: boolean }[] = [
  { kind: 'date', key: 'addDate', range: false },
  { kind: 'lookup', key: 'addLookup', range: false },
  { kind: 'dateRange', key: 'addDateRange', range: true },
  { kind: 'lookupRange', key: 'addLookupRange', range: true },
];
```

Inside the component, after `deleteAt`:

```tsx
  // ตำแหน่งที่จะเพิ่ม — ตาม cell ที่แผงแก้อยู่ (spec: ต่อหลัง cell นั้น; field ในกลุ่ม = เข้ากลุ่ม แต่ช่วงไปต่อหลังกลุ่ม)
  const focusGroup = focusKey ? parsed.cells.find((c) => c.kind === 'group' && c.fields.some((f) => f.key === focusKey)) : undefined;
  const addWhere = !focusKey
    ? t('components.dialogPreview.editor.addAtEnd')
    : focusGroup
      ? t('components.dialogPreview.editor.addInGroup', { group: nameOf(focusGroup.key), label: nameOf(focusKey) })
      : t('components.dialogPreview.editor.addAfter', { label: nameOf(focusKey) });
  // Radix คืน focus ให้ปุ่ม trigger ตอนเมนูปิด — หลังเพิ่ม field ต้องให้ focus อยู่ในแผงแทน
  const addedRef = React.useRef(false);
  const addField = (kind: NewFieldKind) => {
    if (blockedSwitch()) return;
    const { xml: next, name } = insertField(xml, focusKey, kind);
    if (!name || next === xml) return;
    const key = keyOfName(parseDialogXml(next).cells, name);
    addedRef.current = true;
    setFocus({ xml: next, key });
    onChange(next);
    requestAnimationFrame(() => {
      if (key) canvasRef.current?.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
      const panel = panelRef.current;
      const lookup = kind === 'lookup' || kind === 'lookupRange';
      // ช่อง DataSource มี list= (datalist) — ช่องแรกที่เป็น input คือ Label เสมอ ปุ่ม Delete ในหัวแผงไม่ใช่ input
      (lookup ? panel?.querySelector<HTMLElement>('input[list]') : panel?.querySelector<HTMLElement>('input'))?.focus();
    });
  };
```

- [ ] **Step 3: Render the menu**

In the top toolbar row (`<div className="flex items-center gap-2 text-xs">` that holds the Cols control), append after the Cols `role="group"` div:

```tsx
        {/* เมนูเปิด = editor ไม่ว่าง (ทางเดียวกับการลาก) — Esc ปิดเมนูอย่างเดียว ไม่ไปกด Cancel ของทั้งหน้า
            หน้า ReportTemplateEdit ล้าง flag ใน tick ถัดไป จึงทันกับ listener Esc บน window ของ event เดียวกัน */}
        <DropdownMenu onOpenChange={(open) => onDragActiveChange?.(open)}>
          <DropdownMenuTrigger asChild>
            <Button ref={addRef} type="button" size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('components.dialogPreview.editor.addField')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              if (!addedRef.current) return;
              addedRef.current = false;
              e.preventDefault();
            }}
          >
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{addWhere}</DropdownMenuLabel>
            {ADD_KINDS.map((k) => (
              <DropdownMenuItem key={k.kind} onSelect={() => addField(k.kind)}>
                <span>{t(`components.dialogPreview.editor.${k.key}`)}</span>
                {k.range && focusGroup && (
                  <span className="ml-auto pl-3 text-[11px] text-muted-foreground">
                    {t('components.dialogPreview.editor.addRangeAfterGroup', { group: nameOf(focusGroup.key) })}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
```

Notes for the implementer:
- If `t(\`components.dialogPreview.editor.${k.key}\`)` fails the i18n key type, switch on `k.key` with four literal `t('…')` calls instead (look at how other files pass dynamic keys first and match that).
- If `DropdownMenuTrigger` in `src/components/ui/dropdown-menu.tsx` does not accept `asChild`, render `<DropdownMenuTrigger ref={addRef} className=…>` with the button classes instead — do **not** edit the ui primitive.
- If `DropdownMenuContent` does not forward `onCloseAutoFocus` / `align`, check how the primitive spreads props; the Radix content accepts both.

- [ ] **Step 4: Static checks and suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dialogPreview/DialogLayoutEditor.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): add Date, Lookup and range fields from the layout editor"
```

---

## Browser verification (controller, after Task 3 — local, never saved)

Template "Purchase Order Detail Report" on `http://localhost:3304`, Edit → Preview, ≥ 1800px wide:

1. Nothing focused → Add field → Date: a "New field" cell appears last; panel shows it; Label input focused; Dialog XML tab has one new line `<Label Text="New field"/><Date Name="Date1"/>`.
2. Focus Vendor range → Add Lookup range → new range right after Vendor; DataSource input focused; both sides `@product_list`.
3. Group two fields, focus one → menu shows "Adds to Group 1, after …" and range items show "after Group 1"; add Date → inside the group; add Date range → after the group.
4. Delete a field via its toolbar trash → cell gone, focus on a neighbouring cell (not `body`), toast with Undo → Undo restores the XML exactly.
5. Delete, then rename another field, then Undo → "Can't undo" toast, XML unchanged.
6. Delete the last field of a group → group gone too; Undo restores both.
7. Panel header Delete on the focused cell → same as 4.
8. Open the Add menu, press Esc → menu closes, page still in edit mode.
9. Type `1bad` into the Name of one cell (error shown), then try Add field and the trash of a different cell → `fixErrorFirst` toast, XML unchanged.
10. Delete, then Cancel the page while the Undo toast is visible, then click Undo → "Can't undo" toast; read-only view unchanged.
11. Cancel the page at the end; nothing is saved.
