# Dialog Layout Editor Property Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A panel beside the layout editor canvas that edits the focused cell's label, `Name`, default `Value`, `Multi`, `ColSpan`, Lookup data source (`DataSource` or an `Items`/`Values` table), and group heading — writing to the Dialog XML on blur/Enter.

**Architecture:** Pure `xml → xml` attribute ops in `dialogXmlEdit.ts` (same DOM load/save as the existing ops, no re-layout), a pure validation module, a constant DataSource list mirrored from inventory, and a `PropertyPanel` component fed by the editor's new "focused cell" state. The panel writes only through the editor's `onChange`.

**Tech Stack:** React 19 + TypeScript, Tailwind (literal classes), shadcn `ui/input`, `ui/label`, `ui/button`, `ui/select`; Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-09-dialog-property-panel-design.md`

## Global Constraints

- Platform repo only, branch `feature/dialog-property-panel`. No inventory/backend change; XML format unchanged.
- Ops never throw; bad XML / unknown key → return the input string. Attribute ops never touch whitespace.
- Labels are edited where they live: `<Label Text>` (classic) or `Label=` (self-labelled). Never convert.
- Writes happen on blur or Enter; a validation error blocks the write; Esc restores the last written value and must not trigger the page's Cancel.
- Tests: unit tests for the pure modules only (spec "Testing" — user-approved, overrides the default skip). No component tests. Static checks: `bun run typecheck && bun run lint && bun run test`.
- Never modify `src/components/ui/`. No new libraries. No `alert`/`confirm`. Tailwind classes literal.
- i18n: every user-visible string in both `src/i18n/en.ts` and `src/i18n/th.ts` under `components.dialogPreview.panel`.
- DataSource values must match inventory `dataSourceMap` keys exactly, including the misspelt `@location_consigment_list`.
- Esc guard: the spec says to reuse the drag ref; this plan uses `e.stopPropagation()` on Escape inside panel inputs instead — `KeyboardShortcuts.tsx` listens on `window` in the bubble phase, so stopping propagation is sufficient and `ReportTemplateEdit.tsx` needs no change. Same requirement, smaller change.

## Review Focus

1. **Blur-commit races with a click on another cell** — clicking cell B while editing cell A's Name must write A's value (blur fires first), then focus B; A's edit must not land on B. Browser check in Task 5; the form is keyed by focus key + side so drafts never leak across cells.
2. **Self-labelled field with its label cleared** — must keep `Label=""` (preview falls back to Name), never remove the attribute (that would turn it into a bare control inventory drops). Test in Task 2.
3. **Escaping** — `"`, `&`, `<`, Thai text in Label/Items must serialize and parse back unchanged. Test in Task 2.
4. **Name uniqueness counts controls the parser drops** (a control with no label still exists in XML and in micro-data) — validation scans the whole document, not just parsed cells. Test in Task 1.
5. **Esc inside a panel input** cancelling the whole page — `stopPropagation` on Escape in every panel input (window listener is bubble-phase in `KeyboardShortcuts.tsx:44`). Browser check in Task 5.

---

### Task 1: DataSource list + validation

**Files:**
- Create: `src/utils/dialogDataSources.ts`
- Create: `src/utils/dialogXmlValidate.ts`
- Create: `src/utils/dialogXmlValidate.test.ts`
- Modify: `docs/dialog-xml/README.md`

**Interfaces — Produces:**
- `DATA_SOURCES: ReadonlyArray<{ value: string; description: string }>`; `isKnownDataSource(v: string): boolean`
- `type IssueCode = 'nameRequired' | 'namePattern' | 'nameDuplicate' | 'itemsEmptyRow' | 'itemsTilde'`
- `validateName(name: string, self: Element): IssueCode | null`
- `validateRows(rows: { item: string; value: string }[]): IssueCode | null`
- `rangeWillSplit(fromName: string, toName: string, toLabel: Element | null): boolean`
- `dataSourceUnknown(v: string): boolean`

- [ ] **Step 1: Failing tests** — `src/utils/dialogXmlValidate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dataSourceUnknown, rangeWillSplit, validateName, validateRows } from './dialogXmlValidate';

const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const byName = (d: Document, n: string) => Array.from(d.getElementsByTagName('*')).find((e) => e.getAttribute('Name') === n) as Element;

describe('validateName', () => {
  const d = doc('<Dialog><Label Text="A"/><Date Name="A"/><Date Name="Bare"/><Group><Label Text="G"/><Lookup Name="G"/></Group></Dialog>');
  const a = byName(d, 'A');

  it('requires a value and a code-like pattern', () => {
    expect(validateName('  ', a)).toBe('nameRequired');
    expect(validateName('1st', a)).toBe('namePattern');
    expect(validateName('has space', a)).toBe('namePattern');
    expect(validateName('Date_From2', a)).toBeNull();
  });

  it('is unique across the whole document, including groups and controls the parser drops', () => {
    expect(validateName('G', a)).toBe('nameDuplicate');
    expect(validateName('Bare', a)).toBe('nameDuplicate');
    expect(validateName('A', a)).toBeNull();
  });
});

describe('validateRows', () => {
  it('rejects empty cells and the ~ separator', () => {
    expect(validateRows([{ item: 'All', value: 'ALL' }])).toBeNull();
    expect(validateRows([{ item: 'All', value: ' ' }])).toBe('itemsEmptyRow');
    expect(validateRows([{ item: 'A~B', value: 'x' }])).toBe('itemsTilde');
  });
});

describe('rangeWillSplit', () => {
  const d = doc('<Dialog><Label Text="to"/><Label Text="Date To"/><Label Text="x" Visible="false"/></Dialog>');
  const [toText, other, hidden] = Array.from(d.documentElement.children);

  it('a range held together by a "to" or hidden label never splits on rename', () => {
    expect(rangeWillSplit('Start', 'End', toText)).toBe(false);
    expect(rangeWillSplit('Start', 'End', hidden)).toBe(false);
  });

  it('a range held together by names splits once the names stop matching', () => {
    expect(rangeWillSplit('DateFrom', 'DateTo', other)).toBe(false);
    expect(rangeWillSplit('DateStart', 'DateTo', other)).toBe(true);
  });
});

describe('dataSourceUnknown', () => {
  it('knows inventory’s list case-insensitively; empty is not unknown', () => {
    expect(dataSourceUnknown('@vendor_list')).toBe(false);
    expect(dataSourceUnknown('@VENDOR_LIST')).toBe(false);
    expect(dataSourceUnknown('@location_consigment_list')).toBe(false);
    expect(dataSourceUnknown('@supplier_list')).toBe(true);
    expect(dataSourceUnknown('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — `bun run test -- src/utils/dialogXmlValidate` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/utils/dialogDataSources.ts`:

```ts
// ต้องตรงกับ dataSourceMap ใน inventory routes/report/list/parse-report-dialog.ts — แก้คู่กันเสมอ
// (@location_consigment_list สะกดตาม inventory ห้ามแก้ฝั่งเดียว)
export const DATA_SOURCES: ReadonlyArray<{ value: string; description: string }> = [
  { value: '@product_list', description: 'Products' },
  { value: '@category_list', description: 'Categories' },
  { value: '@subcategory_list', description: 'Sub-categories' },
  { value: '@itemgroup_list', description: 'Item groups' },
  { value: '@location_list', description: 'Locations' },
  { value: '@location_inventory_list', description: 'Locations — inventory' },
  { value: '@location_direct_list', description: 'Locations — direct' },
  { value: '@location_consigment_list', description: 'Locations — consignment' },
  { value: '@location_count_list', description: 'Locations — count' },
  { value: '@vendor_list', description: 'Vendors' },
  { value: '@period_list', description: 'Periods' },
];

export const isKnownDataSource = (v: string): boolean => DATA_SOURCES.some((d) => d.value === v.trim().toLowerCase());
```

`src/utils/dialogXmlValidate.ts`:

```ts
// ตรวจค่าที่แผง property จะเขียนลง Dialog XML — คืน code ให้ UI แปลเป็นข้อความเอง
import { CONTROL_TAGS } from './dialogXml';
import { isKnownDataSource } from './dialogDataSources';

export type IssueCode = 'nameRequired' | 'namePattern' | 'nameDuplicate' | 'itemsEmptyRow' | 'itemsTilde';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Name เป็นคีย์ filter ของ micro-data — ห้ามซ้ำทั้งเอกสาร รวม control ที่ preview ไม่วาด (ไม่มีป้าย) ด้วย */
export function validateName(name: string, self: Element): IssueCode | null {
  const n = name.trim();
  if (!n) return 'nameRequired';
  if (!NAME.test(n)) return 'namePattern';
  const dup = Array.from(self.ownerDocument.getElementsByTagName('*')).some(
    (e) => e !== self && CONTROL_TAGS.has(e.tagName) && e.getAttribute('Name') === n,
  );
  return dup ? 'nameDuplicate' : null;
}

/** Items/Values คั่นด้วย ~ — ช่องว่างหรือ ~ ในค่าทำให้สองฝั่งเลื่อนไม่ตรงกัน */
export function validateRows(rows: { item: string; value: string }[]): IssueCode | null {
  if (rows.some((r) => !r.item.trim() || !r.value.trim())) return 'itemsEmptyRow';
  if (rows.some((r) => r.item.includes('~') || r.value.includes('~'))) return 'itemsTilde';
  return null;
}

/** ช่วงที่จับคู่ด้วยป้าย "to"/ซ่อน อยู่รอดการเปลี่ยนชื่อ — ช่วงที่จับคู่ด้วยชื่อ XFrom/XTo แยกเมื่อชื่อไม่ตรงแล้ว */
export function rangeWillSplit(fromName: string, toName: string, toLabel: Element | null): boolean {
  if (toLabel && (toLabel.getAttribute('Visible') === 'false' || toLabel.getAttribute('Text') === 'to')) return false;
  return !(fromName.endsWith('From') && toName === `${fromName.slice(0, -'From'.length)}To`);
}

export const dataSourceUnknown = (v: string): boolean => v.trim() !== '' && !isKnownDataSource(v);
```

- [ ] **Step 4: Run** — `bun run test -- src/utils/dialogXmlValidate` → Expected: PASS (6 tests).

- [ ] **Step 5: README** — in `docs/dialog-xml/README.md`, after the Controls bullet add:
```
- `DataSource="@…_list"` values the run dialog understands are inventory's
  `dataSourceMap` (`routes/report/list/parse-report-dialog.ts`). The platform
  editor suggests the same list from `src/utils/dialogDataSources.ts` — change
  both together. Other values are passed through unchanged.
```

- [ ] **Step 6: Commit**
```bash
git add src/utils/dialogDataSources.ts src/utils/dialogXmlValidate.ts src/utils/dialogXmlValidate.test.ts docs/dialog-xml/README.md
git commit -m "feat(report-templates): Dialog XML validation and DataSource list for the property panel"
```

---

### Task 2: Attribute edit ops

**Files:**
- Modify: `src/utils/dialogXmlEdit.ts`
- Modify: `src/utils/dialogXmlEdit.test.ts`

**Interfaces — Produces:**
- `type Side = 'from' | 'to' | undefined`
- `setControlAttrs(xml: string, key: string, side: Side, patch: Record<string, string | null>): string`
- `setLabelText(xml: string, key: string, side: Side, text: string): string`
- `setGroupLabel(xml: string, groupKey: string, text: string): string`
- Key rules: a range is addressed by its key **with** `side`; a field (top level or in a group) **without** `side`; anything else → input unchanged.

- [ ] **Step 1: Failing tests** — append to `src/utils/dialogXmlEdit.test.ts` (add `setControlAttrs, setGroupLabel, setLabelText` to the import list):

```ts
describe('property ops', () => {
  const XML = `<Dialog Cols="2">
  <Label Text="Date"/><Date Name="DateFrom"/>
  <Label Text="to" Visible="false"/><Date Name="DateTo"/>
  <Lookup Name="Status" Label="Status" Items="ALL~Open" Values="ALL~O" Tooltip="t"/>
  <Group Label="P">
    <Label Text="Vendor"/><Lookup Name="Vendor" DataSource="@vendor_list"/>
  </Group>
</Dialog>
`;
  const [range, status, group] = cellsOf(XML);
  const vendorKey = group.kind === 'group' ? group.fields[0].key : '';

  it('setControlAttrs changes only the listed attributes and leaves the rest byte-identical', () => {
    const out = setControlAttrs(XML, status.key, undefined, { Multi: 'true', Tooltip: null });
    expect(out).toBe(XML.replace(' Tooltip="t"/>', ' Multi="true"/>'));
  });

  it('setControlAttrs addresses each side of a range and fields inside a group', () => {
    const to = setControlAttrs(XML, range.key, 'to', { Value: '@today' });
    expect(to).toContain('<Date Name="DateTo" Value="@today"/>');
    expect(setControlAttrs(XML, range.key, undefined, { Value: 'x' })).toBe(XML);
    const v = setControlAttrs(XML, vendorKey, undefined, { DataSource: null, Items: 'A', Values: 'a' });
    expect(v).toContain('<Lookup Name="Vendor" Items="A" Values="a"/>');
  });

  it('setControlAttrs: empty string removes; bad key or broken XML returns the input', () => {
    expect(setControlAttrs(XML, status.key, undefined, { Items: '', Values: '' })).not.toContain('Items=');
    expect(setControlAttrs(XML, 'nope', undefined, { Multi: 'true' })).toBe(XML);
    expect(setControlAttrs('<Dialog>', status.key, undefined, { Multi: 'true' })).toBe('<Dialog>');
  });

  it('setLabelText edits a classic <Label Text>, a self label in place, and never the To side', () => {
    expect(setLabelText(XML, range.key, 'from', 'Period')).toContain('<Label Text="Period"/><Date Name="DateFrom"/>');
    expect(setLabelText(XML, range.key, 'to', 'x')).toBe(XML);
    expect(setLabelText(XML, status.key, undefined, 'State')).toContain('<Lookup Name="Status" Label="State"');
  });

  it('clearing a self label keeps Label="" rather than turning the control into a bare one', () => {
    expect(setLabelText(XML, status.key, undefined, '')).toContain('<Lookup Name="Status" Label=""');
  });

  it('setGroupLabel sets, and removes when blank', () => {
    expect(setGroupLabel(XML, group.key, ' Supplier ')).toContain('<Group Label="Supplier">');
    expect(setGroupLabel(XML, group.key, '  ')).toContain('<Group>');
    expect(setGroupLabel(XML, status.key, 'x')).toBe(XML);
  });

  it('quotes, ampersands, angle brackets and Thai survive a round trip', () => {
    const text = 'ผู้ขาย "A" & <B>';
    const out = setLabelText(XML, status.key, undefined, text);
    const c = cellsOf(out)[1];
    expect(c.kind === 'field' && c.label).toBe(text);
  });
});
```

- [ ] **Step 2: Run** — `bun run test -- src/utils/dialogXmlEdit` → Expected: FAIL (imports not exported).

- [ ] **Step 3: Implement** — append to `src/utils/dialogXmlEdit.ts` (before `containerMap`):

```ts
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
```

- [ ] **Step 4: Run** — `bun run test -- src/utils/dialogXmlEdit` → Expected: PASS (all existing + 7 new).

- [ ] **Step 5: Commit**
```bash
git add src/utils/dialogXmlEdit.ts src/utils/dialogXmlEdit.test.ts
git commit -m "feat(report-templates): Dialog XML attribute ops for the property panel"
```

---

### Task 3: PropertyPanel component + i18n

**Files:**
- Create: `src/components/dialogPreview/PropertyPanel.tsx`
- Create: `src/components/dialogPreview/panelInputs.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (new `panel` block inside `components.dialogPreview`, after the `editor` block)

**Interfaces:**
- Consumes: Task 1 (`DATA_SOURCES`, `validateName`, `validateRows`, `rangeWillSplit`, `dataSourceUnknown`), Task 2 (`setControlAttrs`, `setLabelText`, `setGroupLabel`, `Side`), existing `setColSpan`, `ungroup`, `DialogParseResult`, `DialogField`.
- Produces: `PropertyPanel` props `{ xml: string; parsed: DialogParseResult; focusKey: string | null; onApply: (next: string) => void; onUngroup: (groupKey: string) => void; onClose: () => void; className?: string; panelRef?: React.Ref<HTMLElement> }`.

- [ ] **Step 1: i18n** — `src/i18n/en.ts`, inside `components.dialogPreview` after the closing `},` of `editor`:
```ts
      panel: {
        aria: 'Field properties',
        empty: 'Click a field to edit its properties',
        close: 'Close properties',
        kindDate: 'Date',
        kindLookup: 'Lookup',
        kindRange: 'Range',
        kindGroup: 'Group',
        label: 'Label',
        rangeLabel: 'Range label',
        heading: 'Heading',
        name: 'Name',
        defaultValue: 'Default value',
        defaultDateHint: '@today = today',
        none: 'None',
        modeSource: 'Data source',
        modeList: 'Fixed list',
        dataSource: 'Data source',
        shown: 'Shown text',
        sent: 'Value sent',
        addRow: 'Add row',
        removeRow: 'Remove row {{n}}',
        moveUp: 'Move row {{n}} up',
        moveDown: 'Move row {{n}} down',
        multi: 'Allow multiple selections',
        colSpan: 'Column span',
        from: 'From',
        to: 'To',
        sameAsFrom: 'Same source as From',
        otherAttrs: 'Other attributes',
        otherAttrsHint: 'Edit these in the Dialog XML tab',
        errNameRequired: 'Name is required',
        errNamePattern: 'Use letters, digits and _ only, not starting with a digit',
        errNameDuplicate: 'Another control already uses this name',
        errItemsEmptyRow: 'Every row needs both a shown text and a value',
        errItemsTilde: '~ is the list separator and cannot be used in a value',
        warnRangeSplit: 'These names no longer pair as XFrom / XTo — the range will become two fields',
        warnUnknownDataSource: 'Not a known data source — inventory will pass it through as-is',
      },
```
`src/i18n/th.ts`, same position:
```ts
      panel: {
        aria: 'คุณสมบัติของ field',
        empty: 'คลิก field เพื่อแก้คุณสมบัติ',
        close: 'ปิดแผงคุณสมบัติ',
        kindDate: 'วันที่',
        kindLookup: 'Lookup',
        kindRange: 'ช่วง',
        kindGroup: 'กลุ่ม',
        label: 'ป้าย',
        rangeLabel: 'ป้ายของช่วง',
        heading: 'หัวข้อ',
        name: 'Name',
        defaultValue: 'ค่าเริ่มต้น',
        defaultDateHint: '@today = วันนี้',
        none: 'ไม่มี',
        modeSource: 'แหล่งข้อมูล',
        modeList: 'รายการกำหนดเอง',
        dataSource: 'แหล่งข้อมูล',
        shown: 'ข้อความที่แสดง',
        sent: 'ค่าที่ส่ง',
        addRow: 'เพิ่มแถว',
        removeRow: 'ลบแถว {{n}}',
        moveUp: 'เลื่อนแถว {{n}} ขึ้น',
        moveDown: 'เลื่อนแถว {{n}} ลง',
        multi: 'เลือกได้หลายค่า',
        colSpan: 'จำนวนคอลัมน์ที่กิน',
        from: 'จาก',
        to: 'ถึง',
        sameAsFrom: 'ใช้แหล่งข้อมูลเดียวกับฝั่งจาก',
        otherAttrs: 'attribute อื่น',
        otherAttrsHint: 'แก้ได้ใน tab Dialog XML',
        errNameRequired: 'ต้องระบุ Name',
        errNamePattern: 'ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ _ และห้ามขึ้นต้นด้วยตัวเลข',
        errNameDuplicate: 'มี control อื่นใช้ชื่อนี้แล้ว',
        errItemsEmptyRow: 'ทุกแถวต้องมีทั้งข้อความที่แสดงและค่าที่ส่ง',
        errItemsTilde: '~ เป็นตัวคั่นรายการ ใช้ในค่าไม่ได้',
        warnRangeSplit: 'ชื่อไม่จับคู่แบบ XFrom / XTo แล้ว ช่วงนี้จะแยกเป็นสอง field',
        warnUnknownDataSource: 'ไม่ใช่แหล่งข้อมูลที่รู้จัก inventory จะส่งค่านี้ไปตามที่เขียน',
      },
```

- [ ] **Step 2: Inputs** — `src/components/dialogPreview/panelInputs.tsx`:

```tsx
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
  const initial = React.useMemo(() => toRows(items, values), [items, values]);
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
    <div
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
```
(If `text-warning` is not a defined Tailwind token in `tailwind.config.js`, use the class the existing preview notices use for warning text — record a Ruling.)

- [ ] **Step 3: Panel** — `src/components/dialogPreview/PropertyPanel.tsx`:

```tsx
import React from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
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

const split = (raw: string | null) => (raw ? raw.split('~') : []);
const DATALIST_ID = 'dialog-data-sources';

export function PropertyPanel({ xml, parsed, focusKey, onApply, onUngroup, onClose, className, panelRef }: PropertyPanelProps) {
  const { t } = useI18n();
  const f = findFocused(parsed.cells, focusKey);
  const issue = (code: IssueCode | null) =>
    code ? t(`components.dialogPreview.panel.err${code.charAt(0).toUpperCase()}${code.slice(1)}` as Parameters<typeof t>[0]) : null;

  const Span = ({ k, span }: { k: string; span: number }) =>
    parsed.cols === 1 ? null : (
      <div className="space-y-1.5">
        <Label className="text-xs">{t('components.dialogPreview.panel.colSpan')}</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={span <= 1} aria-label={`${t('components.dialogPreview.panel.colSpan')} −`} onClick={() => onApply(setColSpan(xml, k, span - 1))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-xs tabular-nums">{span}</span>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={span >= parsed.cols} aria-label={`${t('components.dialogPreview.panel.colSpan')} +`} onClick={() => onApply(setColSpan(xml, k, span + 1))}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );

  /** ช่องของ control หนึ่งตัว (ไม่รวม Label/ColSpan) — ใช้ทั้ง field และแต่ละฝั่งของช่วง */
  const ControlFields = ({ k, side, el, nameWarn }: { k: string; side: Side; el: Element; nameWarn?: (v: string) => string | null }) => {
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
          validate={(v) => issue(validateName(v, el))}
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
                validate={(rows) => issue(validateRows(rows))}
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
  };

  const others = (el: Element) => Array.from(el.attributes).filter((a) => !KNOWN[el.tagName]?.has(a.name));
  const Others = ({ els }: { els: Element[] }) => {
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
  };

  let title = '';
  let body: React.ReactNode = <p className="text-xs text-muted-foreground">{t('components.dialogPreview.panel.empty')}</p>;
  if (f?.kind === 'field') {
    const el = f.cell.element;
    title = `${t(el.tagName === 'Date' ? 'components.dialogPreview.panel.kindDate' : 'components.dialogPreview.panel.kindLookup')} · ${el.getAttribute('Name') ?? ''}`;
    body = (
      <>
        <CommitInput id={`${f.cell.key}-label`} label={t('components.dialogPreview.panel.label')} value={f.cell.labelElement ? (f.cell.labelElement.getAttribute('Text') ?? '') : (el.getAttribute('Label') ?? '')} onCommit={(v) => onApply(setLabelText(xml, f.cell.key, undefined, v))} />
        <ControlFields k={f.cell.key} side={undefined} el={el} />
        {!f.inGroup && <Span k={f.cell.key} span={f.cell.layout.colSpan} />}
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
          <ControlFields k={r.key} side="from" el={r.from.element} nameWarn={splitWarn(toName, true)} />
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
          <ControlFields k={r.key} side="to" el={r.to.element} nameWarn={splitWarn(fromName, false)} />
        </section>
        <Span k={r.key} span={r.layout.colSpan} />
        <Others els={[r.from.element, r.to.element]} />
      </>
    );
  } else if (f?.kind === 'group') {
    const g = f.cell;
    title = `${t('components.dialogPreview.panel.kindGroup')}${g.label ? ` · ${g.label}` : ''}`;
    body = (
      <>
        <CommitInput id={`${g.key}-heading`} label={t('components.dialogPreview.panel.heading')} value={g.label} onCommit={(v) => onApply(setGroupLabel(xml, g.key, v))} />
        <Span k={g.key} span={g.layout.colSpan} />
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUngroup(g.key)}>
          {t('components.dialogPreview.editor.ungroup')}
        </Button>
      </>
    );
  }

  return (
    <aside ref={panelRef} aria-label={t('components.dialogPreview.panel.aria')} className={cn('space-y-3 rounded-md border bg-card p-3', className)}>
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
      {/* key ผูกกับ cell + XML — ร่างที่พิมพ์ค้างไม่ข้ามไปอีก cell และ state โหมดของ Lookup รีเซ็ตตาม XML จริง */}
      <div key={`${focusKey ?? ''}`} className="space-y-3">
        {body}
      </div>
    </aside>
  );
}
```
Note for the implementer: `ControlFields`, `Span`, `Others` are declared inside the component and used as JSX components; because they are re-created every render React would remount them and drop input focus/drafts on every keystroke. **Hoist each of them to module scope** as real components taking `xml`, `parsed.cols`, `onApply`, `t`, `issue` as props (keep the bodies exactly as above). This plan shows them inline only for readability.

- [ ] **Step 4: Static checks** — `bun run typecheck && bun run lint` → Expected: clean (fix any TKey typing on the `issue` helper with an explicit `Record<IssueCode, TKey>` map if the template-literal cast is rejected — record a Ruling).

- [ ] **Step 5: Commit**
```bash
git add src/components/dialogPreview/PropertyPanel.tsx src/components/dialogPreview/panelInputs.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): Dialog layout editor property panel component"
```

---

### Task 4: Wire focus + panel into the editor

**Files:**
- Modify: `src/components/dialogPreview/SortableCell.tsx`
- Modify: `src/components/dialogPreview/DialogLayoutEditor.tsx`

**Interfaces — Consumes:** `PropertyPanel` (Task 3).

- [ ] **Step 1: SortableCell** — add props and behaviour:
```ts
  /** cell ที่แผง property กำลังแก้ */
  focused?: boolean;
  onFocusCell?: () => void;
```
Destructure them and on the outer `<div>` add:
```tsx
      tabIndex={onFocusCell ? 0 : undefined}
      aria-current={focused || undefined}
      onClick={(e) => {
        // คลิกปุ่ม/ช่องใน toolbar ไม่ใช่การเลือก cell — และ field ใน Group ไม่ให้กล่อง Group แย่งไป
        if (!onFocusCell || (e.target as HTMLElement).closest('button,input,select,a,label')) return;
        e.stopPropagation();
        onFocusCell();
      }}
      onKeyDown={(e) => {
        if (!onFocusCell || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        e.stopPropagation();
        onFocusCell();
      }}
```
and extend `className` with `focused && 'rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background'` plus `'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'`.

- [ ] **Step 2: Editor state** — in `DialogLayoutEditor.tsx`, after the selection state:
```ts
  // cell ที่แผง property แก้อยู่ — ผูกกับ XML แบบเดียวกับการเลือก: แก้ attribute ไม่ทำให้ key เลื่อน จึงพาไปด้วย
  const [focus, setFocus] = React.useState<{ xml: string; key: string | null }>({ xml, key: null });
  const focusKey = focus.xml === xml ? focus.key : null;
  const panelRef = React.useRef<HTMLElement>(null);
  const focusCell = (key: string) => {
    setFocus({ xml, key });
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input,select,button:not([aria-label])')?.focus());
  };
```
Change `applyKeepingSelection` to carry focus too:
```ts
  const applyKeepingSelection = (next: string) => {
    if (next === xml) return;
    setSelection({ xml: next, keys: selected });
    setFocus({ xml: next, key: focusKey });
    onChange(next);
  };
```
(the declaration order must stay valid: move `applyKeepingSelection` below both state declarations if needed.)

Pass `focused={focusKey === cell.key}` and `onFocusCell={() => focusCell(cell.key)}` to every top-level `SortableCell`, and `focused={focusKey === f.key}` / `onFocusCell={() => focusCell(f.key)}` to the group-field `SortableCell`s.

Note: `focusCell` focusing the panel on click would steal focus from mouse users mid-gesture; only move focus into the panel for the keyboard path. Implement as two calls: `onFocusCell` from `onClick` → `setFocus` only; from `onKeyDown` → `focusCell` (sets + focuses). Give `SortableCell` a second optional prop `onFocusCellByKey?: () => void` used by `onKeyDown`, or pass a boolean argument — pick one and keep it consistent.

- [ ] **Step 3: Layout** — wrap the `DndContext` block (and the cols/selection bars stay above) so the panel sits beside it:
```tsx
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* existing <DndContext>…</DndContext> unchanged */}
        </div>
        <PropertyPanel
          xml={xml}
          parsed={parsed}
          focusKey={focusKey}
          onApply={applyKeepingSelection}
          onUngroup={(k) => apply(ungroup(xml, k))}
          onClose={() => setFocus({ xml, key: null })}
          panelRef={panelRef}
          className="lg:sticky lg:top-4 lg:w-72 lg:shrink-0"
        />
      </div>
```

- [ ] **Step 4: Static checks + suite** — `bun run typecheck && bun run lint && bun run test` → Expected: clean / all pass.

- [ ] **Step 5: Commit**
```bash
git add src/components/dialogPreview/SortableCell.tsx src/components/dialogPreview/DialogLayoutEditor.tsx
git commit -m "feat(report-templates): focus a Dialog cell to edit it in the property panel"
```

---

### Task 5: Browser verification (localhost:3304, never saved)

Report Template Edit → edit mode → Dialog XML tab → paste XML (via the CodeMirror view: `document.querySelector('.cm-content').cmTile.view.dispatch(...)`) → Preview. Finish with the page's Cancel.

- [ ] Click a classic Lookup field: panel shows Label / Name / Data source / Multi / Default / Column span. Change Label, Tab out → Dialog XML tab shows only that `Text` changed.
- [ ] Type a duplicate Name, Enter → error under the field, XML unchanged. Esc → original Name back, **page still in edit mode**.
- [ ] Switch to Fixed list, add two rows, click outside → `Items`/`Values` written, `DataSource` removed. Default select lists the two values.
- [ ] Unknown DataSource `@supplier_list` → warning, still written.
- [ ] Range `DateFrom`/`DateTo` (named pair, no `to` label): rename From to `DateStart` → warning shown while typing; after commit the range becomes two fields.
- [ ] Edit cell A's Name, then click cell B without pressing Enter → A's value written to A; panel now shows B.
- [ ] Group heading edit; clearing it removes `Label`.
- [ ] Window ≥ 1024px: panel right; 768–1023px: panel below canvas.
- [ ] Keyboard: Tab to a cell, Enter → focus lands in the panel's first input.
- [ ] Cancel the page; template unchanged.

---

## Finish

Final whole-branch review, then push + PR on request. No inventory/backend PR needed.
