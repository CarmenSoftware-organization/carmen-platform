# Dialog XML Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let report-template authors lay the filter dialog out in columns with `<Dialog Cols>`, `ColSpan`, and `<Group>`, rendered identically by the platform preview and the inventory run dialog.

**Architecture:** One canonical fixture set (XML + expected JSON) lives in `carmen-platform/docs/dialog-xml/fixtures/` and is copied into the inventory repo. Each frontend keeps its own parser and runs every fixture as a test. micro-report already walks every XML depth, so it gets a test only. `<Group>` is built last.

**Tech Stack:** React 19 + TypeScript, Vitest (jsdom), Tailwind (literal class tables), Go `encoding/xml` (micro-report test).

**Spec:** `docs/superpowers/specs/2026-10-08-dialog-xml-columns-design.md`

## Global Constraints

- Branch in **every** repo: `feature/dialog-xml-columns`. Never commit to `main`. When dispatching a subagent into a sibling repo, name this branch explicitly in its prompt.
- Repo paths (all under `/Users/samutpra/GitHub/carmensoftware-organize/`): `carmen-platform` (PLAT), `carmen-inventory-frontend-react` (INV), `micro-report` (MR).
- INV has an unrelated uncommitted change to `package.json` (version `2.5.0` → `2.5.3`) and MR has unrelated dirty `.claude/*` files. **Never `git add -A` / `git commit -a`** in those repos — add only the files a task names.
- `Cols`: integer 1–4, absent → 1, invalid or < 1 → 1, > 4 → 4.
- `ColSpan`: on `<Group>` and on the control element only, integer ≥ 1, absent/invalid → 1, > effective `Cols` → `Cols`. A range takes the From control's `ColSpan`.
- Inside `<Group>`: no range auto-pairing; nested `<Group>` children are lifted in place; empty `<Group>` skipped; `Cols`/`Label` on `<Group>` reserved, no effect.
- Unknown attributes/elements are never an error. Inventory renders only `Date` and `Lookup`.
- Tailwind classes must be literal strings in a lookup table — never build `` `sm:col-span-${n}` ``.
- Every grid starts `grid-cols-1` (one column below `sm`).
- Modal/preview width per `Cols`: 1 → default (`max-w-lg`), 2 → `max-w-3xl`, 3–4 → `max-w-5xl`.
- Tests: write the parser tests in this plan (user chose this over their default "skip tests"). No component/page tests — UI is verified in the browser (Task 9).
- PLAT rules: never edit `src/components/ui/`; new strings go in **both** `src/i18n/en.ts` and `src/i18n/th.ts`; status colour via `--warning` token classes (`text-warning`, `bg-warning/10`, `border-warning/40`).
- Static checks before every commit: PLAT `bun run typecheck && bun run lint`; INV `bun run typecheck && bunx eslint <changed files>`; MR `go vet ./service/...`.
- Run Vitest non-interactively: `bunx vitest run <path>` (INV's `test` script is watch mode).

## Review Focus

1. **A template without `Cols` must look identical in inventory** after `FieldGroup` turns into a grid — `FieldGroup` carries `flex flex-col gap-7` and container-query classes, not just a gap. → Task 9 step compares before/after screenshots of `Inventory_Balance_Report`.
2. **A `Label` immediately before a `<Group>`** (orphan label, then group) — must not swallow or misalign the group's first field. → Task 7 test `orphan label before a group`.
3. **`Cols` with surrounding whitespace** (`Cols=" 2 "`) — an author would expect 2, not a fallback. → Task 4 test `accepts whitespace around integers`.
4. **Schedule form with a `<Group>`** — grouped fields must still appear, in document order. → Task 7 test in `parse-schedule-dialog.test.ts`.
5. **micro-report filter header with a `<Group>`** — labels must still print as `Text`, not fall back to `Name`. → Task 6.

---

### Task 1: Canonical fixtures + format README (PLAT)

**Files:**
- Create: `carmen-platform/docs/dialog-xml/README.md`
- Create: `carmen-platform/docs/dialog-xml/fixtures/*.xml` and `*.expected.json` (18 real + 12 edge)

**Interfaces:**
- Produces: fixture pairs `<name>.xml` + `<name>.expected.json`. Expected JSON shape (used by Tasks 2, 4, 7, 8):

```json
{ "cols": 1,
  "cells": [ { "kind": "range" | "single" | "group", "colSpan": 1, "names": ["DateFrom", "DateTo"] } ],
  "warnings": ["colsInvalid"] }
```

`names` = control `Name`s in order (range: from, to; group: every field). `cells` lists only cells that have a `Date`/`Lookup` control. `warnings` = platform warning codes in emission order (inventory ignores this key).

- [ ] **Step 1: Check out the branch (already exists from the spec commits)**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout feature/dialog-xml-columns && git status --short
```
Expected: on `feature/dialog-xml-columns`, clean.

- [ ] **Step 2: Generate the 18 real fixtures from the DEV snapshot**

The expected output is computed with the **current** inventory pairing rules (they are the reference the new parsers must keep reproducing).

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
mkdir -p docs/dialog-xml/fixtures
python3 -I - <<'PY'
import glob, json, os, shutil
import xml.etree.ElementTree as ET
SRC = "../reports-backup/report-templates/dev"
OUT = "docs/dialog-xml/fixtures"
CTRL = {"Date", "Lookup"}
for path in sorted(glob.glob(f"{SRC}/*.dialog.xml")):
    name = "real-" + os.path.basename(path).replace(".dialog.xml", "")
    root = ET.parse(path).getroot()
    nodes = []
    for c in root:
        if c.tag == "Label":
            nodes.append(("label", c.get("Text", ""), c.get("Visible") != "false"))
        elif c.tag in CTRL:
            nodes.append(("ctrl", c.get("Name", ""), c.tag))
    cells, i = [], 0
    while i < len(nodes):
        n = nodes[i]
        if n[0] != "label" or not n[2]:
            i += 1; continue
        nxt = nodes[i + 1] if i + 1 < len(nodes) else None
        if not nxt or nxt[0] != "ctrl":
            i += 1; continue
        after = nodes[i + 2] if i + 2 < len(nodes) else None
        to = nodes[i + 3] if i + 3 < len(nodes) else None
        to_label = bool(after) and after[0] == "label" and (not after[2] or after[1] == "to")
        named = (bool(after) and after[0] == "label" and bool(to) and to[0] == "ctrl" and to[2] == nxt[2]
                 and nxt[1].endswith("From") and to[1] == nxt[1][:-4] + "To")
        if (to_label or named) and to and to[0] == "ctrl":
            cells.append({"kind": "range", "colSpan": 1, "names": [nxt[1], to[1]]}); i += 4
        else:
            cells.append({"kind": "single", "colSpan": 1, "names": [nxt[1]]}); i += 2
    shutil.copyfile(path, f"{OUT}/{name}.xml")
    with open(f"{OUT}/{name}.expected.json", "w") as f:
        json.dump({"cols": 1, "cells": cells, "warnings": []}, f, indent=2); f.write("\n")
    print(name, len(cells))
PY
ls docs/dialog-xml/fixtures | wc -l
```
Expected: 18 lines printed (e.g. `real-Purchase_Order_Detail_Report 9`), then `36`.

- [ ] **Step 3: Write the 12 edge fixtures**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform/docs/dialog-xml/fixtures
S='<Label Text="Status"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"'
G='<Label Text="Group By"/><Lookup Name="GroupBy" Items="Vendor~Location" Values="vendor~location"/>'

printf '<Dialog Cols="abc">\n  %s/>\n</Dialog>\n' "$S" > cols-invalid.xml
echo '{"cols":1,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["colsInvalid"]}' > cols-invalid.expected.json

printf '<Dialog Cols="9">\n  %s/>\n  %s\n</Dialog>\n' "$S" "$G" > cols-over-max.xml
echo '{"cols":4,"cells":[{"kind":"single","colSpan":1,"names":["Status"]},{"kind":"single","colSpan":1,"names":["GroupBy"]}],"warnings":["colsClamped"]}' > cols-over-max.expected.json

printf '<Dialog Cols="2">\n  %s ColSpan="5"/>\n  %s\n</Dialog>\n' "$S" "$G" > colspan-over-cols.xml
echo '{"cols":2,"cells":[{"kind":"single","colSpan":2,"names":["Status"]},{"kind":"single","colSpan":1,"names":["GroupBy"]}],"warnings":["colSpanClamped"]}' > colspan-over-cols.expected.json

printf '<Dialog Cols="2">\n  %s ColSpan="wide"/>\n</Dialog>\n' "$S" > colspan-invalid.xml
echo '{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["colSpanInvalid"]}' > colspan-invalid.expected.json

cat > colspan-on-label.xml <<'XML'
<Dialog Cols="2">
  <Label Text="Status" ColSpan="2"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"/>
</Dialog>
XML
echo '{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["colSpanOnLabel"]}' > colspan-on-label.expected.json

cat > colspan-on-range-from.xml <<'XML'
<Dialog Cols="3">
  <Label Text="Date From"/><Date Name="DateFrom" ColSpan="2"/>
  <Label Text="Date To"/><Date Name="DateTo" ColSpan="3"/>
  <Label Text="Status"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"/>
</Dialog>
XML
echo '{"cols":3,"cells":[{"kind":"range","colSpan":2,"names":["DateFrom","DateTo"]},{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":[]}' > colspan-on-range-from.expected.json

printf '<Dialog>\n  %s ColSpan="3"/>\n</Dialog>\n' "$S" > colspan-with-cols-1.xml
echo '{"cols":1,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["colSpanClamped"]}' > colspan-with-cols-1.expected.json

cat > unknown-attrs.xml <<'XML'
<Dialog Cols="2" Theme="dark">
  <Label Text="Status" Hint="x"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O" Tooltip="pick one"/>
</Dialog>
XML
echo '{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":[]}' > unknown-attrs.expected.json

cat > unknown-element.xml <<'XML'
<Dialog Cols="2">
  <Label Text="Note"/><Text Name="Note"/>
  <Label Text="Status"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"/>
</Dialog>
XML
echo '{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["unknownElement"]}' > unknown-element.expected.json

cat > group-basic.xml <<'XML'
<Dialog Cols="3">
  <Group ColSpan="2">
    <Label Text="Date From"/><Date Name="DateFrom" Value="@today"/>
    <Label Text="Date To"/><Date Name="DateTo" Value="@today"/>
  </Group>
  <Label Text="Group By"/><Lookup Name="GroupBy" Items="Vendor~Location" Values="vendor~location"/>
</Dialog>
XML
echo '{"cols":3,"cells":[{"kind":"group","colSpan":2,"names":["DateFrom","DateTo"]},{"kind":"single","colSpan":1,"names":["GroupBy"]}],"warnings":[]}' > group-basic.expected.json

cat > group-nested.xml <<'XML'
<Dialog Cols="2">
  <Group ColSpan="2">
    <Label Text="Location From"/><Lookup Name="LocationFrom" DataSource="@location_list"/>
    <Group>
      <Label Text="Location To"/><Lookup Name="LocationTo" DataSource="@location_list"/>
    </Group>
  </Group>
</Dialog>
XML
echo '{"cols":2,"cells":[{"kind":"group","colSpan":2,"names":["LocationFrom","LocationTo"]}],"warnings":["nestedGroupFlattened"]}' > group-nested.expected.json

cat > group-empty.xml <<'XML'
<Dialog Cols="2">
  <Group ColSpan="2"/>
  <Label Text="Status"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"/>
</Dialog>
XML
echo '{"cols":2,"cells":[{"kind":"single","colSpan":1,"names":["Status"]}],"warnings":["emptyGroup"]}' > group-empty.expected.json

ls | wc -l
for f in *.expected.json; do python3 -I -m json.tool "$f" >/dev/null || echo "BAD $f"; done
```
Expected: `60`, no `BAD` lines.

- [ ] **Step 4: Write `docs/dialog-xml/README.md`**

```markdown
# Dialog XML format

The filter dialog of a report template (`tb_report_template.dialog`). Read by
four places — keep them in step:

| Reader | File |
|---|---|
| Platform preview | `carmen-platform/src/utils/dialogXml.ts` → `src/components/DialogPreview.tsx` |
| Inventory run dialog | `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.ts` |
| Inventory schedule form | `carmen-inventory-frontend-react/routes/report/schedules/parse-schedule-dialog.ts` |
| micro-report filter header | `micro-report/service/template_filter_inject.go` (`parseDialogDefs`) |

## Elements

- `<Dialog Cols="1–4">` — root. `Cols` absent/invalid → 1, > 4 → 4.
- `<Label Text="…" [Visible="false"]/>` followed by a control = one field.
- Controls: `<Date Name Value/>`, `<Lookup Name DataSource|Items+Values [Multi="true"] [Value]/>`.
  Inventory renders only these two.
- `ColSpan="n"` on a control or `<Group>`: integer ≥ 1, clamped to `Cols`.
  Never on `<Label>` (no effect).
- `<Group ColSpan="n">` wraps `Label`+control pairs and lays them side by side.
  No From/To auto-pairing inside. Nested groups are lifted into the outer one.
  Empty groups are skipped. `Cols`/`Label` on `<Group>` are reserved.

Outside groups, `Label XFrom` + `Label XTo` (or a second label that is
`Visible="false"` or reads `to`) collapse into one **range** cell, which takes
the From control's `ColSpan`.

Below 640px every dialog is one column.

> **`<Group>` rollout rule:** do not use `<Group>` in a live template until the
> inventory release that supports it is on inventory **production**. Older
> inventory builds silently drop grouped fields.

## Fixtures

`fixtures/<name>.xml` + `fixtures/<name>.expected.json`. Both frontends run every
fixture as a test. The inventory copy lives at
`carmen-inventory-frontend-react/routes/report/list/__fixtures__/dialog-xml/` —
re-copy it by hand whenever this set changes. `real-*` files are the DEV
templates as of 2026-10-08.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add docs/dialog-xml
git commit -m "docs(dialog-xml): format README and shared parser fixtures"
```

---

### Task 2: Inventory parser — `Cols` / `ColSpan` (INV)

**Files:**
- Modify: `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.ts`
- Modify: `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.test.ts`
- Create: `carmen-inventory-frontend-react/routes/report/list/__fixtures__/dialog-xml/` (copy of Task 1 set)
- Create: `carmen-inventory-frontend-react/routes/report/list/dialog-fixtures.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 1.
- Produces (used by Tasks 3, 7):

```ts
export const MAX_COLS = 4;
// LookupNode, DateNode, RangeField, SingleField each gain: colSpan: number
export type DialogCell = FormField;            // Task 7 widens to FormField | GroupCell
export interface ParsedDialog { cols: number; cells: DialogCell[] }
export function parseReportDialog(xml: string): ParsedDialog;
export function flattenFields(cells: DialogCell[]): FormField[];
```

- [ ] **Step 1: Create the branch and copy the fixtures**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git checkout main && git checkout -b feature/dialog-xml-columns
mkdir -p routes/report/list/__fixtures__/dialog-xml
cp ../carmen-platform/docs/dialog-xml/fixtures/* routes/report/list/__fixtures__/dialog-xml/
git status --short
```
Expected: ` M package.json` (pre-existing, leave it) and `?? routes/report/list/__fixtures__/`.

- [ ] **Step 2: Write the failing fixture test**

Create `routes/report/list/dialog-fixtures.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReportDialog, type ParsedDialog } from "./parse-report-dialog";

const DIR = fileURLToPath(
  new URL("./__fixtures__/dialog-xml/", import.meta.url),
);
// Group ยังไม่รองรับจนถึง Task 7 — ลบบรรทัดนี้ตอนนั้น
const PENDING = /^group-/;

interface ExpectedCell {
  kind: string;
  colSpan: number;
  names: string[];
}

function summarize(parsed: ParsedDialog) {
  return {
    cols: parsed.cols,
    cells: parsed.cells.map(
      (c): ExpectedCell =>
        c.kind === "range"
          ? { kind: "range", colSpan: c.colSpan, names: [c.from.name, c.to.name] }
          : { kind: "single", colSpan: c.colSpan, names: [c.control.name] },
    ),
  };
}

const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".xml"))
  .map((f) => f.replace(/\.xml$/, ""))
  .filter((n) => !PENDING.test(n));

describe("dialog XML fixtures", () => {
  it.each(names)("%s", (name) => {
    const xml = readFileSync(`${DIR}${name}.xml`, "utf8");
    const expected = JSON.parse(
      readFileSync(`${DIR}${name}.expected.json`, "utf8"),
    ) as { cols: number; cells: ExpectedCell[] };

    expect(summarize(parseReportDialog(xml))).toEqual({
      cols: expected.cols,
      cells: expected.cells,
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run routes/report/list/dialog-fixtures.test.ts`
Expected: FAIL — `parseReportDialog(...)` returns an array, so `parsed.cols` is `undefined` (and a TS error on the `ParsedDialog` import).

- [ ] **Step 4: Implement**

In `parse-report-dialog.ts`:

(a) Add `colSpan: number;` as the last member of `LookupNode`, `DateNode`, `RangeField`, and `SingleField`.

(b) Add below `type DialogNode = …`:

```ts
/** เพดานคอลัมน์ของ dialog — modal กว้างได้จำกัด เกินนี้ Lookup จะแคบจนอ่านไม่ออก */
export const MAX_COLS = 4;

export type DialogCell = FormField;

export interface ParsedDialog {
  cols: number;
  cells: DialogCell[];
}

const INT = /^\s*\d+\s*$/;

/** จำนวนเต็ม ≥ 1 หรือ undefined ถ้าไม่ใช่ — ค่าผิดทุกแบบถอยไปค่าเริ่มต้น ไม่ throw */
const readPositiveInt = (raw: string | null): number | undefined => {
  if (raw === null || !INT.test(raw)) return undefined;
  const n = Number.parseInt(raw, 10);
  return n >= 1 ? n : undefined;
};

const readCols = (el: Element): number =>
  Math.min(readPositiveInt(el.getAttribute("Cols")) ?? 1, MAX_COLS);

const readSpan = (el: Element, cols: number): number =>
  Math.min(readPositiveInt(el.getAttribute("ColSpan")) ?? 1, cols);
```

(c) Replace `parseReportDialog` and `parseNodes` with:

```ts
export function parseReportDialog(xml: string): ParsedDialog {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const dialogEl = doc.querySelector("Dialog");
  if (!dialogEl) return { cols: 1, cells: [] };

  const cols = readCols(dialogEl);
  const cells: DialogCell[] = groupFields(
    parseNodes(Array.from(dialogEl.children), cols),
  );
  return { cols, cells };
}

/** รวมทุก field เป็น list แบนสำหรับงานที่ไม่สนใจ layout (data source, period, ส่งค่า filter) */
export function flattenFields(cells: DialogCell[]): FormField[] {
  return cells;
}

const parseNodes = (elements: Element[], cols: number): DialogNode[] => {
  const nodes: DialogNode[] = [];

  for (const child of elements) {
    const tag = child.tagName;

    if (tag === "Label") {
      nodes.push({
        type: "label",
        name: attr(child, "Name"),
        text: attr(child, "Text"),
        visible: child.getAttribute("Visible") !== "false",
      });
    } else if (tag === "Lookup") {
      const rawItems = attr(child, "Items");
      const rawValues = attr(child, "Values");
      nodes.push({
        type: "lookup",
        name: attr(child, "Name"),
        dataSource: resolveDataSource(attr(child, "DataSource")),
        items: rawItems ? rawItems.split("~") : [],
        values: rawValues ? rawValues.split("~") : [],
        value: attr(child, "Value"),
        multi: attr(child, "Multi") === "true",
        colSpan: readSpan(child, cols),
      });
    } else if (tag === "Date") {
      nodes.push({
        type: "date",
        name: attr(child, "Name"),
        value: attr(child, "Value"),
        colSpan: readSpan(child, cols),
      });
    }
  }

  return nodes;
};
```

(d) In `groupFields`, add `colSpan` to both pushes:

```ts
      fields.push({
        kind: "range",
        label: node.text,
        from: next,
        to: toControl,
        colSpan: next.colSpan,
      });
```
```ts
      fields.push({
        kind: "single",
        label: node.text,
        control: next,
        colSpan: next.colSpan,
      });
```

(e) Update the three existing tests in `parse-report-dialog.test.ts` to destructure the new shape:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
sed -i '' 's/const fields = parseReportDialog(/const { cells: fields } = parseReportDialog(/' routes/report/list/parse-report-dialog.test.ts
grep -c "const { cells: fields } = parseReportDialog(" routes/report/list/parse-report-dialog.test.ts
```
Expected: `3`.

- [ ] **Step 5: Run the parser tests**

Run: `bunx vitest run routes/report/list/dialog-fixtures.test.ts routes/report/list/parse-report-dialog.test.ts`
Expected: PASS — 27 fixture cases (18 real + 9 non-group edge) + 3 existing.

- [ ] **Step 6: Commit** (`report-param-dialog.tsx` does not type-check yet; Task 3 fixes it — run only eslint here)

```bash
bunx eslint routes/report/list/parse-report-dialog.ts routes/report/list/dialog-fixtures.test.ts routes/report/list/parse-report-dialog.test.ts
git add routes/report/list/parse-report-dialog.ts routes/report/list/parse-report-dialog.test.ts routes/report/list/dialog-fixtures.test.ts routes/report/list/__fixtures__
git commit -m "feat(report): parse Dialog Cols and ColSpan"
```

---

### Task 3: Inventory run dialog — grid + modal width (INV)

**Files:**
- Create: `carmen-inventory-frontend-react/routes/report/list/dialog-layout.ts`
- Modify: `carmen-inventory-frontend-react/routes/report/list/report-param-dialog.tsx` (imports ~L33-38; `fields`/`enrichedFields` ~L654-710; `DialogContent` ~L735; field list ~L756-776)

**Interfaces:**
- Consumes: `parseReportDialog`, `flattenFields`, `MAX_COLS`, `DialogCell`, `ParsedDialog` from Task 2.
- Produces: `GRID_COLS`, `COL_SPAN`, `MODAL_W: Record<number, string>`; component `ReportField` (Task 7 reuses it for group fields).

- [ ] **Step 1: Create `dialog-layout.ts`**

```ts
/**
 * class ของ grid ใน dialog รายงาน — ต้องเป็น string เต็มเพราะ Tailwind สแกนหา class จากซอร์ส
 * ห้ามประกอบเป็น `sm:col-span-${n}` (class จะไม่ถูกสร้าง)
 */
export const GRID_COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export const COL_SPAN: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
};

/** ความกว้าง modal ตามจำนวนคอลัมน์ — 1 คอลัมน์ใช้ค่าเดิมของ DialogContent (sm:max-w-lg) */
export const MODAL_W: Record<number, string> = {
  1: "",
  2: "sm:max-w-3xl",
  3: "sm:max-w-5xl",
  4: "sm:max-w-5xl",
};
```

- [ ] **Step 2: Update imports in `report-param-dialog.tsx`**

Replace the `./parse-report-dialog` import block with:

```ts
import {
  flattenFields,
  parseReportDialog,
  type DateNode,
  type DialogCell,
  type FormField,
  type LookupNode,
  type ParsedDialog,
} from "./parse-report-dialog";
import { COL_SPAN, GRID_COLS, MODAL_W } from "./dialog-layout";
```
and add `import { cn } from "@/lib/utils";` after the `@/components/lookup/lookup-combobox` import.

- [ ] **Step 3: Add `ReportField` + `cellKey` right after `FieldControl`**

```tsx
/** ช่องหนึ่งของ dialog: ป้าย + control — range ตัด " From" ท้ายป้ายเพราะ RangeRow มีป้าย From/To ของตัวเอง */
function ReportField({
  field,
  periods,
  className,
}: FieldControlProps & { readonly className?: string }) {
  const label =
    field.kind === "range" ? field.label.replace(/ From$/, "") : field.label;
  return (
    <Field className={className}>
      <FieldLabel className="text-xs">{label}</FieldLabel>
      <FieldControl field={field} periods={periods} />
    </Field>
  );
}

const cellKey = (cell: DialogCell): string =>
  cell.kind === "range" ? `${cell.from.name}-${cell.to.name}` : cell.control.name;
```

- [ ] **Step 4: Replace field derivation and enrichment**

Two separate replacements; the `useReportListLookups` block, `lookupData`, and `periods` between them stay exactly as they are.

(a) Replace the three statements `const fields: FormField[] = … parseReportDialog(dialogXml);`, `const sources = collectDataSources(fields);`, `const includePeriods = needsPeriods(fields);` with:

```tsx
  const parsed: ParsedDialog =
    !dialogXml || dialogXml.trim().length === 0
      ? { cols: 1, cells: [] }
      : parseReportDialog(dialogXml);
  const fields: FormField[] = flattenFields(parsed.cells);

  const sources = collectDataSources(fields);
  const includePeriods = needsPeriods(fields);
```
(b) Replace the whole `// Inject lookup data into fields` + `const enrichedFields = fields.map(…);` statement with:

```tsx
  // Inject lookup data into fields
  const injectLookup = (ctrl: LookupNode | DateNode): LookupNode | DateNode => {
    if (ctrl.type !== "lookup") return ctrl;
    const ds = ctrl.dataSource;
    if (!ds) return ctrl;
    const items = lookupData[ds];
    if (!items || items.length === 0) return ctrl;
    // Period is a single-period selection (business rule): no "ALL" option, and the
    // newest period — first in the DESC-ordered list — becomes the default (options[0]).
    const includeAll = ds !== "period";
    return {
      ...ctrl,
      items: includeAll
        ? ["ALL", ...items.map((i) => i.name)]
        : items.map((i) => i.name),
      values: includeAll
        ? ["ALL", ...items.map((i) => i.code)]
        : items.map((i) => i.code),
    };
  };
  const enrichField = (field: FormField): FormField =>
    field.kind === "range"
      ? { ...field, from: injectLookup(field.from), to: injectLookup(field.to) }
      : { ...field, control: injectLookup(field.control) };
  const enrichedCells: DialogCell[] = parsed.cells.map(enrichField);
```

- [ ] **Step 5: Widen the modal**

```tsx
      <DialogContent
        className={cn(
          "flex max-h-[90dvh] flex-col gap-3 p-4",
          MODAL_W[parsed.cols],
        )}
      >
```

- [ ] **Step 6: Render the grid**

Replace the `{enrichedFields.length === 0 ? ( … ) : ( <FieldGroup …> … </FieldGroup> )}` block with:

```tsx
              {enrichedCells.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("noFiltersConfigured")}
                </p>
              ) : (
                <FieldGroup
                  className={cn("grid grid-cols-1 gap-3", GRID_COLS[parsed.cols])}
                >
                  {enrichedCells.map((cell) => (
                    <ReportField
                      key={cellKey(cell)}
                      field={cell}
                      periods={periods}
                      className={COL_SPAN[cell.colSpan]}
                    />
                  ))}
                </FieldGroup>
              )}
```

- [ ] **Step 7: Static checks**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
bun run typecheck
bunx eslint routes/report/list/report-param-dialog.tsx routes/report/list/dialog-layout.ts
bunx vitest run routes/report
```
Expected: all clean / PASS. `grep -n "enrichedFields" routes/report/list/report-param-dialog.tsx` → no output.

- [ ] **Step 8: Commit**

```bash
git add routes/report/list/report-param-dialog.tsx routes/report/list/dialog-layout.ts
git commit -m "feat(report): lay the run dialog out in Cols columns"
```

---

### Task 4: Platform parser `utils/dialogXml.ts` (PLAT)

**Files:**
- Create: `carmen-platform/src/utils/dialogXml.ts`
- Create: `carmen-platform/src/utils/dialogXml.test.ts`
- Create: `carmen-platform/src/utils/dialogXml.fixtures.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 1.
- Produces (used by Tasks 5, 8):

```ts
export const MAX_COLS = 4;
export const CONTROL_TAGS: ReadonlySet<string>; // 'Date', 'Lookup'
export interface DialogLayout { colSpan: number }
export interface DialogField { key: string; label?: string; element: Element | null; layout: DialogLayout }
export type DialogCell =
  | ({ kind: 'field' } & DialogField)
  | { kind: 'range'; key: string; label: string; from: DialogField; to: DialogField; layout: DialogLayout }
  | { kind: 'group'; key: string; layout: DialogLayout; fields: DialogField[] };
export type DialogWarning = …; // spec list incl. { code: 'unknownElement'; at; tag }
export interface DialogParseResult { ok; error?: 'empty'|'parse'|'noDialogRoot'; errorDetail?; cols; cells; counts; warnings }
export function parseDialogXml(xml: string): DialogParseResult;
```

- [ ] **Step 1: Write the failing fixture test**

`src/utils/dialogXml.fixtures.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTROL_TAGS, parseDialogXml, type DialogField, type DialogParseResult } from './dialogXml';

const DIR = fileURLToPath(new URL('../../docs/dialog-xml/fixtures/', import.meta.url));
// Group arrives in Task 8 — delete this line then
const PENDING = /^group-/;

const isControl = (f: DialogField) => !!f.element && CONTROL_TAGS.has(f.element.tagName);
const nameOf = (f: DialogField) => f.element?.getAttribute('Name') ?? '';

function summarize(r: DialogParseResult) {
  return {
    cols: r.cols,
    cells: r.cells.flatMap((c) => {
      if (c.kind === 'range') return [{ kind: 'range', colSpan: c.layout.colSpan, names: [nameOf(c.from), nameOf(c.to)] }];
      if (c.kind === 'group') {
        return [{ kind: 'group', colSpan: c.layout.colSpan, names: c.fields.filter(isControl).map(nameOf) }];
      }
      return isControl(c) ? [{ kind: 'single', colSpan: c.layout.colSpan, names: [nameOf(c)] }] : [];
    }),
    warnings: r.warnings.map((w) => w.code),
  };
}

const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => f.replace(/\.xml$/, ''))
  .filter((n) => !PENDING.test(n));

describe('dialog XML fixtures', () => {
  it.each(names)('%s', (name) => {
    const xml = readFileSync(`${DIR}${name}.xml`, 'utf8');
    const expected = JSON.parse(readFileSync(`${DIR}${name}.expected.json`, 'utf8'));
    const result = parseDialogXml(xml);
    expect(result.ok).toBe(true);
    expect(summarize(result)).toEqual(expected);
  });
});
```

`src/utils/dialogXml.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDialogXml } from './dialogXml';

describe('parseDialogXml', () => {
  it('reports empty input as an error code, not a crash', () => {
    expect(parseDialogXml('   ')).toMatchObject({ ok: false, error: 'empty' });
  });

  it('reports malformed XML with the parser detail', () => {
    const r = parseDialogXml('<Dialog><Label></Dialog>');
    expect(r).toMatchObject({ ok: false, error: 'parse' });
    expect(r.errorDetail).toBeTruthy();
  });

  it('requires a <Dialog> root', () => {
    expect(parseDialogXml('<Form/>')).toMatchObject({ ok: false, error: 'noDialogRoot' });
  });

  it('accepts whitespace around integers', () => {
    const r = parseDialogXml('<Dialog Cols=" 2 "><Label Text="S"/><Lookup Name="S" ColSpan=" 2"/></Dialog>');
    expect(r.cols).toBe(2);
    expect(r.cells[0].layout.colSpan).toBe(2);
    expect(r.warnings).toEqual([]);
  });

  it('keeps label-only cells and unlabelled controls the preview always showed', () => {
    const r = parseDialogXml('<Dialog><Label Text="Orphan"/><Label Text="X"/><Date Name="D"/><Date Name="Bare"/></Dialog>');
    expect(r.cells.map((c) => (c.kind === 'field' ? [c.label, c.element?.getAttribute('Name') ?? null] : c.kind))).toEqual([
      ['Orphan', null],
      ['X', 'D'],
      [undefined, 'Bare'],
    ]);
  });

  it('counts both ends of a range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="Date From"/><Date Name="DateFrom"/><Label Text="Date To"/><Date Name="DateTo"/></Dialog>',
    );
    expect(r.cells).toHaveLength(1);
    expect(r.counts).toEqual({ Date: 2 });
  });

  it('names the offending element in a warning', () => {
    const r = parseDialogXml('<Dialog Cols="2"><Label Text="P"/><Lookup Name="ProductFrom" ColSpan="5"/></Dialog>');
    expect(r.warnings).toEqual([{ code: 'colSpanClamped', raw: '5', used: 2, at: 'ProductFrom' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bunx vitest run src/utils/dialogXml`
Expected: FAIL — `Failed to resolve import "./dialogXml"`.

- [ ] **Step 3: Implement `src/utils/dialogXml.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/utils/dialogXml`
Expected: PASS — 27 fixture cases + 7 unit tests.

- [ ] **Step 5: Static checks + commit**

```bash
bun run typecheck && bun run lint
git add src/utils/dialogXml.ts src/utils/dialogXml.test.ts src/utils/dialogXml.fixtures.test.ts
git commit -m "feat(report-templates): pure Dialog XML parser with columns, ranges, and warnings"
```

---

### Task 5: Platform preview renders cells, columns, warnings (PLAT)

**Files:**
- Modify: `carmen-platform/src/components/DialogPreview.tsx` (whole file)
- Modify: `carmen-platform/src/i18n/en.ts` (`components.dialogPreview`, ~L754-777)
- Modify: `carmen-platform/src/i18n/th.ts` (`components.dialogPreview`, ~L538-559)

**Interfaces:**
- Consumes: everything exported by `src/utils/dialogXml.ts` (Task 4).
- Produces: `DialogPreview` with the same props (`{ xml: string }`); Task 8 adds the group branch.

- [ ] **Step 1: Add i18n keys** — append inside `dialogPreview` in `en.ts` (after `previewOnlyNote`):

```ts
      // {{count}} is the effective Cols value after clamping
      colsBadge: '{{count}} cols',
      warningCountSingular: '{{count}} warning',
      warningCountPlural: '{{count}} warnings',
      rangeFrom: 'From',
      rangeTo: 'To',
      // {{raw}} is the attribute value as written; {{used}} the value applied; {{at}} the
      // control Name (or label text / <Tag>#n) — all data from the XML, never translated
      warnColsInvalid: 'Cols="{{raw}}" is not a whole number of 1 or more, so {{used}} is used',
      warnColsClamped: 'Cols="{{raw}}" is above the maximum, so {{used}} is used',
      warnColSpanInvalid: 'ColSpan="{{raw}}" on {{at}} is not a whole number of 1 or more, so {{used}} is used',
      warnColSpanClamped: 'ColSpan="{{raw}}" on {{at}} is wider than Cols, so {{used}} is used',
      warnColSpanOnLabel: 'ColSpan on label "{{at}}" has no effect. Put it on the control.',
      warnUnknownElement: '<{{tag}}> ({{at}}) is not a Date or Lookup, so the inventory dialog will not show it',
      warnNestedGroup: 'A <Group> inside {{at}} was merged into it. Groups cannot be nested.',
      warnEmptyGroup: '{{at}} is empty and was skipped',
      groupNeedsInventory: '<Group> needs the inventory release that supports it. On older inventory builds, grouped fields disappear.',
```

and the same keys in `th.ts` (after `previewOnlyNote`):

```ts
      colsBadge: '{{count}} คอลัมน์',
      warningCountSingular: 'คำเตือน {{count}} รายการ',
      warningCountPlural: 'คำเตือน {{count}} รายการ',
      rangeFrom: 'จาก',
      rangeTo: 'ถึง',
      // {{raw}} คือค่าตามที่เขียนใน XML, {{used}} คือค่าที่ใช้จริง, {{at}} คือ Name ของ control — เป็นข้อมูลจาก XML ไม่ต้องแปล
      warnColsInvalid: 'Cols="{{raw}}" ไม่ใช่จำนวนเต็มตั้งแต่ 1 ขึ้นไป จึงใช้ {{used}} แทน',
      warnColsClamped: 'Cols="{{raw}}" เกินค่าสูงสุด จึงใช้ {{used}} แทน',
      warnColSpanInvalid: 'ColSpan="{{raw}}" ที่ {{at}} ไม่ใช่จำนวนเต็มตั้งแต่ 1 ขึ้นไป จึงใช้ {{used}} แทน',
      warnColSpanClamped: 'ColSpan="{{raw}}" ที่ {{at}} กว้างกว่า Cols จึงใช้ {{used}} แทน',
      warnColSpanOnLabel: 'ColSpan บนป้าย "{{at}}" ไม่มีผล ให้ย้ายไปใส่ที่ control แทน',
      warnUnknownElement: '<{{tag}}> ({{at}}) ไม่ใช่ Date หรือ Lookup หน้า dialog ของ inventory จะไม่แสดง',
      warnNestedGroup: '<Group> ที่ซ้อนอยู่ใน {{at}} ถูกรวมเข้ากับกลุ่มนอก เพราะซ้อน Group ไม่ได้',
      warnEmptyGroup: '{{at}} ว่างเปล่า จึงถูกข้ามไป',
      groupNeedsInventory: '<Group> ต้องใช้ inventory เวอร์ชันที่รองรับ ถ้าเป็นเวอร์ชันเก่า field ในกลุ่มจะหายไป',
```

- [ ] **Step 2: Rewrite `src/components/DialogPreview.tsx`**

```tsx
import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { EmptyState } from './EmptyState';
import { useI18n } from '../hooks/useI18n';
import { cn } from '../lib/utils';
import type { TFunction } from '../i18n/types';
import { parseDialogXml, type DialogCell, type DialogField, type DialogWarning } from '../utils/dialogXml';

export interface DialogPreviewProps {
  xml: string;
}

// string เต็มเท่านั้น — Tailwind JIT ไม่เห็น class ที่ประกอบตอนรัน
const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};
const COL_SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
};
// กว้างเท่า modal จริงของ inventory (DialogContent sm:max-w-lg และ MODAL_W) — ให้เห็นความแคบจริงของช่อง
const CANVAS_W: Record<number, string> = {
  1: 'max-w-lg',
  2: 'max-w-3xl',
  3: 'max-w-5xl',
  4: 'max-w-5xl',
};

function cleanDataSource(src: string | null | undefined): string {
  if (!src) return '';
  return src
    .replace(/^@/, '')
    .replace(/_list$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderControl(el: Element, t: TFunction): React.ReactNode {
  const tag = el.tagName;
  const name = el.getAttribute('Name') || '';
  if (tag === 'Date') {
    return <Input type="date" disabled placeholder={name} />;
  }
  if (tag === 'Lookup') {
    const source = cleanDataSource(el.getAttribute('DataSource'));
    return (
      <select
        disabled
        className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm text-muted-foreground shadow-xs"
      >
        <option>
          {t('components.dialogPreview.selectPlaceholder', {
            source: source || t('components.dialogPreview.genericValue'),
          })}
        </option>
      </select>
    );
  }
  const attrs = Array.from(el.attributes);
  return (
    <div className="flex min-h-9 w-full items-center rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-mono">&lt;{tag}&gt;</span>
      {attrs.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-1">
          {attrs.map((a) => (
            <span key={a.name} className="font-mono">
              {a.name}="{a.value}"
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldBlock({ field, t, className }: { field: DialogField; t: TFunction; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {field.label !== undefined && (
        <Label className="text-xs text-muted-foreground">{field.label || ' '}</Label>
      )}
      {field.element ? (
        renderControl(field.element, t)
      ) : (
        <div className="text-xs text-muted-foreground italic">{t('components.dialogPreview.noControl')}</div>
      )}
    </div>
  );
}

function CellBlock({ cell, t }: { cell: DialogCell; t: TFunction }) {
  const span = COL_SPAN[cell.layout.colSpan];
  if (cell.kind === 'range') {
    return (
      <div className={cn('space-y-2', span)}>
        <Label className="text-xs text-muted-foreground">{cell.label.replace(/ From$/, '') || ' '}</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { side: cell.from, caption: t('components.dialogPreview.rangeFrom') },
            { side: cell.to, caption: t('components.dialogPreview.rangeTo') },
          ].map(({ side, caption }) => (
            <div key={side.key} className="space-y-1">
              <span className="text-[11px] text-muted-foreground">{caption}</span>
              {side.element && renderControl(side.element, t)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (cell.kind === 'group') return null; // Task 8
  return <FieldBlock field={cell} t={t} className={span} />;
}

function warningText(w: DialogWarning, t: TFunction): string {
  switch (w.code) {
    case 'colsInvalid':
      return t('components.dialogPreview.warnColsInvalid', { raw: w.raw, used: w.used });
    case 'colsClamped':
      return t('components.dialogPreview.warnColsClamped', { raw: w.raw, used: w.used });
    case 'colSpanInvalid':
      return t('components.dialogPreview.warnColSpanInvalid', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanClamped':
      return t('components.dialogPreview.warnColSpanClamped', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanOnLabel':
      return t('components.dialogPreview.warnColSpanOnLabel', { at: w.at });
    case 'unknownElement':
      return t('components.dialogPreview.warnUnknownElement', { at: w.at, tag: w.tag });
    case 'nestedGroupFlattened':
      return t('components.dialogPreview.warnNestedGroup', { at: w.at });
    case 'emptyGroup':
      return t('components.dialogPreview.warnEmptyGroup', { at: w.at });
  }
}

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml }) => {
  const { t } = useI18n();
  const parsed = useMemo(() => parseDialogXml(xml), [xml]);

  // ไม่มี XML เลยไม่ใช่ความผิดพลาด (template แบบ Form มักไม่มี dialog) — สีแดงเก็บไว้ให้ XML ที่ parse ไม่ผ่านจริง
  if (!xml.trim()) {
    return (
      <EmptyState
        icon={Eye}
        title={t('components.dialogPreview.noXmlProvided')}
        description={t('components.dialogPreview.emptyHint')}
      />
    );
  }

  if (!parsed.ok) {
    const message =
      parsed.error === 'noDialogRoot'
        ? t('components.dialogPreview.requiresDialogRoot')
        : parsed.errorDetail || t('components.xml.invalidXml');
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-medium text-destructive">{t('components.dialogPreview.previewUnavailable')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{message}</div>
          </div>
        </div>
      </div>
    );
  }

  const fieldCount = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
  const countBadges = Object.entries(parsed.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => (
      <Badge key={tag} variant="outline" className="text-xs">
        {n} {tag}
      </Badge>
    ));
  const notices = parsed.warnings.map((w) => warningText(w, t));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{t('components.dialogPreview.title')}</span>
          <Badge variant="secondary" className="text-xs">
            {fieldCount === 1
              ? t('components.dialogPreview.fieldCountSingular', { count: fieldCount })
              : t('components.dialogPreview.fieldCountPlural', { count: fieldCount })}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t('components.dialogPreview.colsBadge', { count: parsed.cols })}
          </Badge>
          {notices.length > 0 && (
            <Badge variant="warning" className="text-xs">
              {notices.length === 1
                ? t('components.dialogPreview.warningCountSingular', { count: notices.length })
                : t('components.dialogPreview.warningCountPlural', { count: notices.length })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">{countBadges}</div>
      </div>
      {notices.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          {notices.map((text, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border bg-muted/20 p-4 sm:p-6">
        <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[parsed.cols], CANVAS_W[parsed.cols])}>
          {parsed.cells.map((cell) => (
            <CellBlock key={cell.key} cell={cell} t={t} />
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          {t('components.dialogPreview.previewOnlyNote')}
        </p>
      </div>
    </div>
  );
};
```

Check `src/lib/utils` exports `cn` before relying on it: `grep -n "export function cn" src/lib/utils.ts`. If the path differs, use whatever `src/components/ui/badge.tsx` imports `cn` from.

- [ ] **Step 3: Static checks + existing tests**

```bash
bun run typecheck && bun run lint
bunx vitest run src/pages/ReportTemplateEdit src/utils/dialogXml
```
Expected: clean; PASS (ReportTemplateEdit mocks DialogPreview, so it must still pass untouched). If an i18n parity test exists (`grep -rln "th.ts\|Translations" src --include=*.test.ts`), run it too.

- [ ] **Step 4: Commit**

```bash
git add src/components/DialogPreview.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): preview Dialog columns, ranges, and layout warnings"
```

---

### Task 6: micro-report — Group does not break filter labels (MR)

**Files:**
- Modify: `micro-report/service/template_filter_inject_test.go` (append)

**Interfaces:**
- Consumes: `parseDialogDefs(dialogXML string) []dialogDef` (existing, `template_filter_inject.go:35`).

This is a characterization test: `parseDialogDefs` already walks every depth, so it is expected to **pass on first run**. If it fails, stop and report — the spec assumed no MR code change.

- [ ] **Step 1: Branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/micro-report
git checkout main && git checkout -b feature/dialog-xml-columns
```

- [ ] **Step 2: Append the test** (add `"reflect"` to the import block)

```go
// A <Group> is a layout box only — labels inside it, including in a nested
// Group, must still reach the printed filter header as their Text.
func TestParseDialogDefs_DescendsIntoGroups(t *testing.T) {
	dialog := `<Dialog Cols="2">
  <Group ColSpan="2">
    <Label Text="Date From"/><Date Name="DateFrom"/>
    <Group>
      <Label Text="Date To"/><Date Name="DateTo"/>
    </Group>
  </Group>
  <Label Text="Group By"/><Lookup Name="GroupBy" Items="Vendor~Location" Values="vendor~location"/>
</Dialog>`

	got := parseDialogDefs(dialog)
	want := []dialogDef{
		{Label: "Date From", Name: "DateFrom"},
		{Label: "Date To", Name: "DateTo"},
		{Label: "Group By", Name: "GroupBy", Items: []string{"Vendor", "Location"}, Values: []string{"vendor", "location"}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseDialogDefs with groups:\n got %+v\nwant %+v", got, want)
	}
}
```

- [ ] **Step 3: Run**

Run: `go test ./service/ -run TestParseDialogDefs_DescendsIntoGroups -v && go vet ./service/...`
Expected: PASS, vet clean.

- [ ] **Step 4: Commit**

```bash
git add service/template_filter_inject_test.go
git commit -m "test(report): dialog filter labels survive <Group> wrappers"
```

---

### Task 7: Inventory `<Group>` — parser, render, schedule form (INV)

**Files:**
- Modify: `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.ts`
- Modify: `carmen-inventory-frontend-react/routes/report/list/dialog-fixtures.test.ts`
- Modify: `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.test.ts` (append)
- Modify: `carmen-inventory-frontend-react/routes/report/list/report-param-dialog.tsx`
- Modify: `carmen-inventory-frontend-react/routes/report/schedules/parse-schedule-dialog.ts`
- Create: `carmen-inventory-frontend-react/routes/report/schedules/parse-schedule-dialog.test.ts`

**Interfaces:**
- Consumes: Task 2 parser internals, Task 3 `ReportField`, `cellKey`, `GRID_COLS`, `COL_SPAN`.
- Produces:

```ts
export interface GroupCell { kind: "group"; colSpan: number; fields: SingleField[] }
export type DialogCell = FormField | GroupCell;
```

- [ ] **Step 1: Write failing tests**

In `dialog-fixtures.test.ts`: delete the `PENDING` constant and the `.filter((n) => !PENDING.test(n))` line, and replace the `cells` mapping in `summarize` with:

```ts
    cells: parsed.cells.map((c): ExpectedCell => {
      if (c.kind === "range")
        return { kind: "range", colSpan: c.colSpan, names: [c.from.name, c.to.name] };
      if (c.kind === "group")
        return { kind: "group", colSpan: c.colSpan, names: c.fields.map((f) => f.control.name) };
      return { kind: "single", colSpan: c.colSpan, names: [c.control.name] };
    }),
```

Append to `parse-report-dialog.test.ts` (inside the `describe`):

```ts
  it("orphan label before a group neither swallows nor shifts the group", () => {
    const { cells } = parseReportDialog(`<Dialog Cols="2">
      <Label Text="Dangling"/>
      <Group ColSpan="2">
        <Label Text="Date From"/><Date Name="DateFrom"/>
        <Label Text="Date To"/><Date Name="DateTo"/>
      </Group>
    </Dialog>`);

    expect(cells).toEqual([
      expect.objectContaining({
        kind: "group",
        colSpan: 2,
        fields: [
          expect.objectContaining({ label: "Date From", control: expect.objectContaining({ name: "DateFrom" }) }),
          expect.objectContaining({ label: "Date To", control: expect.objectContaining({ name: "DateTo" }) }),
        ],
      }),
    ]);
  });

  it("flattenFields includes grouped fields in document order", () => {
    const { cells } = parseReportDialog(`<Dialog>
      <Label Text="A"/><Lookup Name="A" Items="x" Values="x"/>
      <Group><Label Text="B"/><Lookup Name="B" Items="x" Values="x"/></Group>
      <Label Text="C"/><Lookup Name="C" Items="x" Values="x"/>
    </Dialog>`);

    expect(
      flattenFields(cells).map((f) => (f.kind === "single" ? f.control.name : f.from.name)),
    ).toEqual(["A", "B", "C"]);
  });
```
and change the test file's import to `import { flattenFields, parseReportDialog } from "./parse-report-dialog";`.

Create `routes/report/schedules/parse-schedule-dialog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseScheduleDialog } from "./parse-schedule-dialog";

describe("parseScheduleDialog", () => {
  it("keeps fields inside <Group> (and nested groups) in document order", () => {
    const fields = parseScheduleDialog(`<Dialog Cols="2">
      <Label Text="Status"/><Lookup Name="Status" Items="ALL~Open" Values="ALL~O"/>
      <Group ColSpan="2">
        <Label Text="Date From"/><Date Name="DateFrom"/>
        <Group><Label Text="Date To"/><Date Name="DateTo"/></Group>
      </Group>
    </Dialog>`);

    expect(fields.map((f) => [f.name, f.label])).toEqual([
      ["Status", "Status"],
      ["DateFrom", "Date From"],
      ["DateTo", "Date To"],
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run routes/report/list routes/report/schedules`
Expected: FAIL — `group-basic`, `group-nested` (no group cell), `group-empty` passes already; the two new list tests and the schedule test fail (grouped fields missing).

- [ ] **Step 3: Implement the parser**

In `parse-report-dialog.ts`, replace `export type DialogCell = FormField;` with:

```ts
/** <Group> — กล่องจัด layout ที่ผู้เขียนกำหนดเอง ข้างในไม่จับคู่ From/To อัตโนมัติ */
export interface GroupCell {
  kind: "group";
  colSpan: number;
  fields: SingleField[];
}

export type DialogCell = FormField | GroupCell;
```

Replace the body of `parseReportDialog` after `const cols = readCols(dialogEl);` with:

```ts
  const cells: DialogCell[] = [];
  let run: Element[] = [];
  const flush = () => {
    if (run.length) cells.push(...groupFields(parseNodes(run, cols)));
    run = [];
  };
  for (const child of Array.from(dialogEl.children)) {
    if (child.tagName !== "Group") {
      run.push(child);
      continue;
    }
    flush();
    const fields = groupFields(
      parseNodes(groupChildren(child), cols),
      false,
    ) as SingleField[];
    if (fields.length > 0) {
      cells.push({ kind: "group", colSpan: readSpan(child, cols), fields });
    }
  }
  flush();
  return { cols, cells };
}

/** Group ซ้อน Group ไม่รองรับ — ยกลูกของกลุ่มในขึ้นมาแทนที่ เพื่อไม่ให้ field หาย */
const groupChildren = (group: Element): Element[] =>
  Array.from(group.children).flatMap((c) =>
    c.tagName === "Group" ? groupChildren(c) : [c],
  );
```

Replace `flattenFields`:

```ts
export function flattenFields(cells: DialogCell[]): FormField[] {
  return cells.flatMap((c) => (c.kind === "group" ? c.fields : [c]));
}
```

Change `groupFields` signature to `const groupFields = (nodes: DialogNode[], pairRanges = true): FormField[] => {` and change `if (isPaired && isControl(toControl)) {` to `if (pairRanges && isPaired && isControl(toControl)) {`.

- [ ] **Step 4: Implement the schedule parser**

In `parse-schedule-dialog.ts`, replace

```ts
    for (const node of Array.from(dialogEl.childNodes)) {
      if (node.nodeType !== 1) continue;
      const child = node as Element;
```
with
```ts
    for (const child of flattenGroups(dialogEl)) {
```
and add above `export function parseScheduleDialog`:

```ts
/** ลูกของ <Dialog> ตามลำดับเอกสาร โดยเปิด <Group> (รวมที่ซ้อนกัน) ออก — layout ไม่มีผลกับฟอร์ม schedule แต่ field ห้ามหาย */
const flattenGroups = (el: Element): Element[] =>
  Array.from(el.children).flatMap((c) =>
    c.tagName === "Group" ? flattenGroups(c) : [c],
  );
```

- [ ] **Step 5: Render groups in `report-param-dialog.tsx`**

Import `MAX_COLS` from `./parse-report-dialog` and `type SingleField` alongside the others. Change `cellKey` to:

```tsx
const cellKey = (cell: DialogCell): string => {
  if (cell.kind === "group") return `group-${cell.fields[0]?.control.name ?? ""}`;
  return cell.kind === "range" ? `${cell.from.name}-${cell.to.name}` : cell.control.name;
};
```

Change `enrichedCells` to:

```tsx
  const enrichedCells: DialogCell[] = parsed.cells.map((cell) =>
    cell.kind === "group"
      ? {
          ...cell,
          fields: cell.fields.map(
            (f): SingleField => ({ ...f, control: injectLookup(f.control) }),
          ),
        }
      : enrichField(cell),
  );
```

Change the map body inside `<FieldGroup>` to:

```tsx
                  {enrichedCells.map((cell) =>
                    cell.kind === "group" ? (
                      <div
                        key={cellKey(cell)}
                        className={cn(
                          "grid grid-cols-1 gap-3",
                          GRID_COLS[Math.min(cell.fields.length, MAX_COLS)],
                          COL_SPAN[cell.colSpan],
                        )}
                      >
                        {cell.fields.map((f) => (
                          <ReportField key={f.control.name} field={f} periods={periods} />
                        ))}
                      </div>
                    ) : (
                      <ReportField
                        key={cellKey(cell)}
                        field={cell}
                        periods={periods}
                        className={COL_SPAN[cell.colSpan]}
                      />
                    ),
                  )}
```

- [ ] **Step 6: Run tests + static checks**

```bash
bunx vitest run routes/report
bun run typecheck
bunx eslint routes/report/list routes/report/schedules
```
Expected: PASS (30 fixtures + all parser/schedule tests), clean.

- [ ] **Step 7: Commit**

```bash
git add routes/report/list/parse-report-dialog.ts routes/report/list/parse-report-dialog.test.ts routes/report/list/dialog-fixtures.test.ts routes/report/list/report-param-dialog.tsx routes/report/schedules/parse-schedule-dialog.ts routes/report/schedules/parse-schedule-dialog.test.ts
git commit -m "feat(report): support <Group> layout boxes in report dialogs"
```

---

### Task 8: Platform `<Group>` — parser, render, transition notice (PLAT)

**Files:**
- Modify: `carmen-platform/src/utils/dialogXml.ts`
- Modify: `carmen-platform/src/utils/dialogXml.fixtures.test.ts`
- Modify: `carmen-platform/src/utils/dialogXml.test.ts` (append)
- Modify: `carmen-platform/src/components/DialogPreview.tsx`

**Interfaces:**
- Consumes: Task 4/5 code.
- Produces: `parseDialogXml` emitting `kind: 'group'` cells and `nestedGroupFlattened` / `emptyGroup` warnings.

- [ ] **Step 1: Failing tests**

In `dialogXml.fixtures.test.ts`, delete the `PENDING` constant and its `.filter(...)` line.

Append to `dialogXml.test.ts`:

```ts
  it('does not pair From/To inside a group', () => {
    const r = parseDialogXml(`<Dialog Cols="2"><Group ColSpan="2">
      <Label Text="Date From"/><Date Name="DateFrom"/>
      <Label Text="Date To"/><Date Name="DateTo"/>
    </Group></Dialog>`);
    expect(r.cells).toHaveLength(1);
    const g = r.cells[0];
    expect(g.kind).toBe('group');
    if (g.kind === 'group') expect(g.fields.map((f) => f.label)).toEqual(['Date From', 'Date To']);
    expect(r.counts).toEqual({ Date: 2 });
  });

  it('keeps an orphan label before a group as its own cell', () => {
    const r = parseDialogXml(
      '<Dialog Cols="2"><Label Text="Dangling"/><Group><Label Text="A"/><Date Name="A"/></Group></Dialog>',
    );
    expect(r.cells.map((c) => c.kind)).toEqual(['field', 'group']);
  });
```

Run: `bunx vitest run src/utils/dialogXml`
Expected: FAIL on `group-basic`, `group-nested`, `group-empty`, and the two new tests.

- [ ] **Step 2: Implement in `dialogXml.ts`**

Add above `parseDialogXml`:

```ts
/** Group ซ้อนไม่รองรับ — ยกลูกขึ้นมาแทนที่ (field ไม่หาย) และเตือนผู้เขียน */
function groupChildren(group: Element, at: string, warnings: DialogWarning[]): Element[] {
  return Array.from(group.children).flatMap((c) => {
    if (c.tagName !== 'Group') return [c];
    warnings.push({ code: 'nestedGroupFlattened', at });
    return groupChildren(c, at, warnings);
  });
}
```

Replace the `Array.from(root.children).forEach(...)` block with:

```ts
  Array.from(root.children).forEach((el, index) => {
    if (el.tagName !== 'Group') {
      if (run.length === 0) runStart = index;
      run.push(el);
      return;
    }
    flush();
    const at = `<Group>#${index + 1}`;
    const drafts = toDrafts(groupChildren(el, at, warnings), cols, warnings, `${index}-`);
    if (drafts.length === 0) {
      warnings.push({ code: 'emptyGroup', at });
      return;
    }
    cells.push({
      kind: 'group',
      key: `g${index}`,
      layout: { colSpan: readSpan(el, cols, at, warnings) },
      fields: drafts.map(strip),
    });
  });
```

- [ ] **Step 3: Render groups in `DialogPreview.tsx`**

Replace `if (cell.kind === 'group') return null; // Task 8` with:

```tsx
  if (cell.kind === 'group') {
    return (
      <div
        className={cn(
          'grid grid-cols-1 gap-4 rounded-md border border-dashed p-3',
          GRID_COLS[Math.min(cell.fields.length, MAX_COLS)],
          span,
        )}
      >
        {cell.fields.map((f) => (
          <FieldBlock key={f.key} field={f} t={t} />
        ))}
      </div>
    );
  }
```
(add `MAX_COLS` to the `../utils/dialogXml` import). The dashed border shows the author where the group is; inventory draws none.

Add the transition notice — after `const notices = parsed.warnings.map((w) => warningText(w, t));`:

```tsx
  // ลบบรรทัดนี้เมื่อ inventory รุ่นที่รองรับ <Group> ขึ้น production แล้ว (docs/dialog-xml/README.md)
  if (parsed.cells.some((c) => c.kind === 'group')) notices.push(t('components.dialogPreview.groupNeedsInventory'));
```

- [ ] **Step 4: Run tests + static checks**

```bash
bunx vitest run src/utils/dialogXml
bun run typecheck && bun run lint
```
Expected: PASS (30 fixtures + 9 unit tests), clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dialogXml.ts src/utils/dialogXml.test.ts src/utils/dialogXml.fixtures.test.ts src/components/DialogPreview.tsx
git commit -m "feat(report-templates): preview <Group> layout boxes with a rollout notice"
```

---

### Task 9: Browser verification (both frontends)

No code unless a check fails. Use Claude-in-Chrome; for 390px use the iframe probe (`resize_window` does not work in this setup).

- [ ] **Step 1: Baseline before switching branch (Review Focus #1)**

In INV on `main`'s code you need a "before" picture: `git stash` is not needed — instead check out `main` in a throwaway worktree:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git worktree add ../inv-baseline main && cd ../inv-baseline && bun install --frozen-lockfile && bun run dev
```
Open the report list, run **Inventory Balance Report**'s dialog, screenshot it. Stop the server, `git worktree remove ../inv-baseline`.

- [ ] **Step 2: Same dialog on the branch**

`cd carmen-inventory-frontend-react && bun run dev`, open the same dialog. Expected: identical layout to Step 1 (one column, same gaps, same width). Any difference is a bug in Task 3 — most likely `FieldGroup`'s `flex-col`/`gap-7` or container-query classes.

- [ ] **Step 3: Platform preview with columns**

`cd carmen-platform && bun run dev:dev` (port 3304). Open Report Template Edit for **Purchase Order Detail Report**, XML tab → Dialog, set `<Dialog Cols="2">` and `ColSpan="2"` on `DateFrom` (do not save). Expected: Preview shows a "2 cols" badge, 9 cells (date range full-width, then ranges two per row), no warnings. Then set `ColSpan="5"` → one clamp warning naming `DateFrom`. Discard changes.

- [ ] **Step 4: Preview vs inventory parity**

Save `Cols="2"` + date `ColSpan="2"` on Purchase Order Detail Report on **DEV only** (as the spec's first real use), open its run dialog in INV (pointed at DEV). Expected: the modal widens to `max-w-3xl`, same 9-cell arrangement as the preview. Then at 390px (iframe probe): one column, no horizontal scroll.

- [ ] **Step 5: Group (never saved to a live template)**

In the platform preview only, paste `docs/dialog-xml/fixtures/group-basic.xml` into the Dialog editor. Expected: dashed group box spanning 2 of 3 columns, `DateFrom`/`DateTo` side by side as separate fields, plus the `groupNeedsInventory` notice. Discard.

- [ ] **Step 6: Report**

Record results (pass/fail per step, screenshots) in the PR descriptions. Do not deploy or push `main:vercel` as part of this plan.

---

## Execution notes

- PRs: one per repo from `feature/dialog-xml-columns`. Merge order is free for Tasks 1–6 (`Cols`/`ColSpan` are ignored by old inventory). Templates may only start using `<Group>` after Task 7 is on inventory production — then delete the `groupNeedsInventory` line from Task 8.
- micro-report's PR is test-only; it ships nothing.
