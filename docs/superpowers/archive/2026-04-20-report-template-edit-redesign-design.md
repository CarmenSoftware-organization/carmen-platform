# Report Template Edit — UI/UX Redesign

**Date:** 2026-04-20
**Page:** `/report-templates/:id/edit` and `/report-templates/new`
**File:** `src/pages/ReportTemplateEdit.tsx`
**Status:** Design approved — ready for implementation plan

---

## Goals

Overhaul the Report Template edit page to provide:

1. A real code-editor experience for the two XML fields (`dialog`, `content`)
2. A Dialog Preview that renders the XML as an interactive-looking form
3. A tab-based layout that scales to large XML content without sprawling vertically
4. Chip-style input for Allow/Deny Business Unit lists
5. A sticky action bar that keeps Save/Cancel in view while editing
6. Prominent status/metadata display

Must keep: `useGlobalShortcuts` (Ctrl+S / Esc), `useUnsavedChanges`, toast notifications, debug sheet (dev only), `parseApiError` in catch blocks, read-only vs edit-mode toggle, existing API service contract.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Template Name                                      [Edit / Cancel]      │
│     View and edit report template details                                   │
│     [Standard] [Active]     ← prominent status badges under subtitle        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┬──────────────────────────────────────────────────┐
│ Template Info            │ [Dialog XML · 24 lines] [Content XML] [Preview]  │
│ ┌──────────────────────┐ │ ┌────────────────────────────────────────────┐   │
│ │ Name *               │ │ │ Toolbar: Upload · Format · Copy · Download │   │
│ │ [input]              │ │ ├────────────────────────────────────────────┤   │
│ │ Description          │ │ │ 1 | <Dialog>                               │   │
│ │ [textarea]           │ │ │ 2 |   <Label Text="Date From"/>            │   │
│ │ Report Group *       │ │ │ 3 |   <Date Name="DateFrom"/>              │   │
│ │ [input]              │ │ │ ...                                        │   │
│ │ ☐ Standard template  │ │ │                                            │   │
│ │ ☐ Active             │ │ │                                            │   │
│ └──────────────────────┘ │ │  CodeMirror 6 (XML, folding, line numbers) │   │
│                          │ │                                            │   │
│ Business Unit Scope      │ └────────────────────────────────────────────┘   │
│ ┌──────────────────────┐ │ Parse status: ✓ Valid XML (or error with line) │
│ │ Allow  [BU001×][+]   │ │                                                  │
│ │ Deny   [BU003×][+]   │ │                                                  │
│ └──────────────────────┘ │                                                  │
│                          │                                                  │
│ Metadata (read-only)     │                                                  │
│ ┌──────────────────────┐ │                                                  │
│ │ Created: ...         │ │                                                  │
│ │ Updated: ...         │ │                                                  │
│ └──────────────────────┘ │                                                  │
└──────────────────────────┴──────────────────────────────────────────────────┘

(when editing, sticky bottom bar slides in:)
┌─────────────────────────────────────────────────────────────────────────────┐
│ ● Unsaved changes            [Cancel]    [Save Changes]                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Grid: `grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 sm:gap-6`
- Left column sticky on `lg+` (`lg:sticky lg:top-4 lg:self-start`)
- Right column tabs stretch full width

---

## Components

### New components to add

| Component | Path | Purpose |
|-----------|------|---------|
| `XmlEditor` | `src/components/XmlEditor.tsx` | CodeMirror 6 wrapper for editing XML with toolbar (Upload/Format/Copy/Download/Clear). Read-only mode supported. |
| `XmlViewer` | `src/components/XmlViewer.tsx` | Read-only CodeMirror 6 viewer with Copy/Download buttons. Used in non-editing mode. |
| `DialogPreview` | `src/components/DialogPreview.tsx` | Parses Dialog XML, renders as form preview. Shows parse errors. |
| `ChipInput` | `src/components/ui/chip-input.tsx` | Tag/chip input: type + Enter/comma to add, X to remove. Used for Allow/Deny BU. |
| `Tabs` | `src/components/ui/tabs.tsx` | shadcn Tabs primitive (Radix Tabs). Required — not currently in project. |
| `StickyActionBar` | reuse inside page | Conditional sticky bottom bar during edit mode. Inline in `ReportTemplateEdit.tsx`. |

### Dependencies to add

```jsonc
"@codemirror/lang-xml": "^6.1.0",
"@codemirror/state": "^6.4.1",
"@codemirror/view": "^6.26.0",
"@codemirror/commands": "^6.3.3",
"@codemirror/language": "^6.10.1",
"@codemirror/autocomplete": "^6.12.0",
"@codemirror/search": "^6.5.6",
"@codemirror/theme-one-dark": "^6.1.2",
"codemirror": "^6.0.1",
"@radix-ui/react-tabs": "^1.0.4"
```

All tree-shakeable; total gzipped ≈ 180 KB.

---

## XmlEditor behavior

**Props:**
```ts
interface XmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;      // default 320
  maxHeight?: number;      // default 560
  label?: string;          // "Dialog XML" — used for download filename
  filename?: string;       // default `${label}.xml`
  onParseChange?: (status: { valid: boolean; message?: string; line?: number; column?: number }) => void;
  readOnly?: boolean;
  uploadAccept?: string;   // e.g. ".xml,.frx"
}
```

**Extensions:**
- `lineNumbers()`
- `foldGutter()`
- `xml()` language + syntax highlighting
- `highlightActiveLine()`
- `EditorView.lineWrapping`
- `keymap.of([...defaultKeymap, ...searchKeymap, indentWithTab])`
- `search({ top: true })` — Ctrl/⌘+F search panel
- Light theme by default; `oneDark` if `document.documentElement.classList.contains('dark')`

**Toolbar actions** (rendered above editor):

- **Upload** — hidden file input, reads and replaces contents via `formatXml` (existing helper — move to `src/utils/xml.ts`)
- **Format** — runs `formatXml()` on current content
- **Copy** — `navigator.clipboard.writeText(value)` + toast
- **Download** — blob download as `{filename}` (default `dialog.xml`, `content.xml`)
- **Clear** — empties value (only in edit mode; shows confirm if content non-empty via `ConfirmDialog`)

**Status chip below toolbar:**
- `✓ Valid · N lines · X KB` (green)
- `✗ Invalid XML at line L, col C: message` (destructive)

Parse check runs on every change (debounced 300ms) via `DOMParser` + `parsererror` check.

---

## XmlViewer (read-only)

Same CodeMirror mount but `EditorState.readOnly.of(true)` and `EditorView.editable.of(false)`. Toolbar only shows **Copy** and **Download**. Status chip still visible.

---

## DialogPreview

**Props:**
```ts
interface DialogPreviewProps {
  xml: string;
}
```

**Parsing:**
1. `new DOMParser().parseFromString(xml, 'application/xml')`
2. If `parsererror`, show inline `EmptyState`-style error: "Preview unavailable — invalid XML" with message
3. If root is not `<Dialog>`, show: "Preview requires a `<Dialog>` root element"
4. Walk children in order; pair adjacent `<Label>` + control (next non-Label sibling) into rows

**Element mapping:**

| XML element | Preview rendering |
|-------------|-------------------|
| `<Label Text="..."/>` | Field label text (paired with next sibling) |
| `<Date Name="X"/>` | `<input type="date" disabled>` with label |
| `<Lookup Name="X" DataSource="@y"/>` | `<select disabled>` showing `Select ${cleanSource}…` placeholder (strip `@`, replace `_` → space, title-case) |
| Any other element | Neutral row: `<tag>` name + attribute key/value chips, muted styling |
| `<Label>` with no following control | Standalone label row |

**Layout:** 2-column grid on `sm+` (`grid-cols-1 sm:grid-cols-2 gap-4`), 1-column on mobile. Rendered inside a muted, bordered box to signal "preview, not real form".

**Header:** "Dialog Preview" + counters `N fields` and parsed element tag summary (e.g. `6 Lookup, 2 Date`).

All controls `disabled`, styled like normal inputs so users see how the form will look.

---

## ChipInput

**Props:**
```ts
interface ChipInputProps {
  value: string;          // comma-separated string (to match API contract)
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;     // read-only mode → renders as Badge list
  id?: string;
  name?: string;
}
```

**Behavior:**
- Internally splits `value` by `,`, trims, filters empty → array of chips
- Enter, `,`, or Tab commits current text to a new chip
- Backspace on empty input removes last chip
- Click `×` on any chip removes it
- On any change, emits comma-joined string to `onChange`
- Duplicates ignored
- Chips rendered as `Badge variant="secondary"` with X button

**Read-only mode:** renders chips as badges without input or ×, showing `-` if empty.

---

## Tabs

Add shadcn Tabs primitive (`src/components/ui/tabs.tsx`) using `@radix-ui/react-tabs`. Standard shadcn styling:

```tsx
<Tabs defaultValue="dialog" className="w-full">
  <TabsList>
    <TabsTrigger value="dialog">
      Dialog XML
      <Badge variant="outline" className="ml-2">{dialogLineCount} lines</Badge>
    </TabsTrigger>
    <TabsTrigger value="content">
      Content XML
      <Badge variant="outline" className="ml-2">{contentLineCount} lines</Badge>
    </TabsTrigger>
    <TabsTrigger value="preview">Preview</TabsTrigger>
  </TabsList>
  <TabsContent value="dialog">…</TabsContent>
  <TabsContent value="content">…</TabsContent>
  <TabsContent value="preview">…</TabsContent>
</Tabs>
```

Line counts derive from `value.split('\n').length` when value non-empty; `0` otherwise.

---

## Sticky action bar

Only mounted when `editing === true`.

```tsx
<div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-white/10 glass-strong">
  <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 max-w-full">
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      {hasChanges ? (
        <><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes</>
      ) : (
        <span className="text-muted-foreground">No changes</span>
      )}
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving || isNew}>
        <X className="mr-2 h-4 w-4" /> Cancel
      </Button>
      <Button size="sm" disabled={saving || !hasChanges} onClick={() => formRef.current?.requestSubmit()}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
      </Button>
    </div>
  </div>
</div>
```

Left offset matches sidebar collapsed/expanded widths (`md:left-16 lg:left-60`) — mirrors the main content area's `ml` logic.
Page content gets `pb-20` to avoid overlap.
For `isNew`, hide Cancel (it would navigate home; let users use back arrow instead).

---

## Status & Metadata

**Header status cluster** (under subtitle):

```tsx
<div className="flex items-center gap-2 mt-2">
  <Badge variant={formData.is_active ? 'success' : 'secondary'}>
    {formData.is_active ? 'Active' : 'Inactive'}
  </Badge>
  <Badge variant={formData.is_standard ? 'default' : 'outline'}>
    {formData.is_standard ? 'Standard' : 'Custom'}
  </Badge>
  {formData.report_group && <Badge variant="outline">{formData.report_group}</Badge>}
</div>
```

**Metadata card** (left column, bottom, read-only always):

Fetched from `rawResponse` — pulls `created_at`, `created_by_name`, `updated_at`, `updated_by_name` if present. Shows `-` if missing. Hidden entirely for `isNew`.

```
┌─ Metadata ─────────────┐
│ Created  2026-03-14 …  │
│          by John Doe   │
│ Updated  2026-04-02 …  │
│          by Jane Smith │
└────────────────────────┘
```

---

## Form Info card (left column)

Fields (in order):
1. **Name** — text input, required
2. **Description** — textarea, 3 rows
3. **Report Group** — text input, required (keep as-is)
4. **Standard** + **Active** — two checkboxes side-by-side in edit mode; shown as badges in header (not duplicated in card when read-only → show as inline `Status` rows)

Move `allow_business_unit` / `deny_business_unit` out to a separate **Business Unit Scope** card.

---

## Behavior preserved

- `useUnsavedChanges(hasChanges)` — unchanged
- `useGlobalShortcuts({ onSave, onCancel })` — unchanged; Save now also triggers from sticky bar
- Debug sheet (dev only) — unchanged, still at fixed bottom-right
- `formatXml` helper — moved to `src/utils/xml.ts` (exported), also gains `validateXml()` helper returning `{ valid, message?, line?, column? }`
- API service calls — unchanged
- Route guards — unchanged
- Toast + error parsing — unchanged

---

## Loading & empty states

- Initial load: left column = stacked `<Skeleton>`s (6 × h-9); right column = `<Skeleton className="h-96 w-full" />` under a disabled tab bar
- No empty state needed (form always renders)
- Error state: same `<div>` with destructive styling at top of page

---

## Accessibility

- All toolbar buttons have `aria-label`
- CodeMirror provides native keyboard navigation + screen reader support
- Tabs use Radix (accessible by default)
- ChipInput: input has `aria-describedby` pointing to helper text; chip remove buttons have `aria-label="Remove {chip}"`
- Status badges in header aren't buttons; use `<span role="status">` wrapper for screen reader announcement on change

---

## Responsive

- `< sm`: single column; tabs stack full-width; sticky bar spans full width (no sidebar offset)
- `sm–md`: single column, tabs keep horizontal bar
- `lg+`: two-column with sticky left
- CodeMirror `minHeight: 320px` on mobile, `480px` on `lg+`

---

## Non-goals (explicit YAGNI)

- No real XML validation against an XSD schema
- No drag-drop file upload (standard file picker only)
- No undo history beyond what CodeMirror provides natively
- No multi-user collaborative editing
- No version history UI (if the API supports it, that's a separate feature)
- No dark-mode toggle here — inherits from page theme
- Preview tab does NOT render actual `@vendor_list` / `@product_list` data — it only shows placeholders

---

## File changes

| Path | Change |
|------|--------|
| `src/pages/ReportTemplateEdit.tsx` | Major rewrite — adopt new layout, new components |
| `src/components/XmlEditor.tsx` | **New** |
| `src/components/XmlViewer.tsx` | **New** |
| `src/components/DialogPreview.tsx` | **New** |
| `src/components/ui/chip-input.tsx` | **New** |
| `src/components/ui/tabs.tsx` | **New** (shadcn Tabs) |
| `src/utils/xml.ts` | **New** — move `formatXml`, add `validateXml`, `countLines` |
| `package.json` | Add CodeMirror + Radix Tabs deps |

---

## Testing plan

**Manual (primary — per CLAUDE.md UI testing rule):**

1. Start dev server; navigate to an existing template → verify read-only renders correctly with all status badges, editors show content with line numbers, Preview tab shows parsed form
2. Click Edit → verify editors become editable, toolbar Upload/Format/Copy/Download work
3. Paste invalid XML → verify error status, Preview tab shows parse error with line
4. Edit chips in Allow/Deny → Enter, comma, backspace, × remove all work; value persists as comma-joined string
5. Make unsaved edits → verify sticky bar appears with pulse indicator; refresh → browser warning fires
6. Ctrl/⌘+S → submits form; Esc → cancels edit mode
7. New template (`/report-templates/new`) → verify edit mode on by default, no Cancel button, no metadata card
8. Resize to mobile → verify tabs stack, sticky bar full width
9. Test with the sample Dialog XML provided → Preview should render 8 rows: 4 date fields + 4 lookup fields, paired with labels

**Unit tests:** Not required for this pass (project has no unit tests for pages currently — would be scope creep).

---

## Open questions — none remaining

All resolved during brainstorming: CodeMirror 6 (Q1 = a), documented schema-based preview (Q2 = a), schema captured above.
