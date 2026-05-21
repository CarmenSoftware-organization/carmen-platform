# Report Template Edit Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/report-templates/:id/edit` with CodeMirror 6 XML editors, tabbed layout (Dialog / Content / Preview), chip inputs for BU scope, sticky action bar, and prominent status/metadata.

**Architecture:** Extract XML editor/viewer, dialog preview, chip input, and tabs primitive into reusable components. Move XML utilities to `src/utils/xml.ts`. Rewrite `ReportTemplateEdit.tsx` to compose these new components with a sticky left column + right tab container layout.

**Tech Stack:** React 18, TypeScript strict, Tailwind CSS, shadcn/ui, Radix Tabs, CodeMirror 6 (`@codemirror/*` + `codemirror`), sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-20-report-template-edit-redesign-design.md`

**Testing approach:** This project has no unit-test infrastructure for pages (per CLAUDE.md). Each task ends with a TypeScript compile check via `bun run build` locally OR a dev-server smoke test. Final validation is manual in-browser against the task's acceptance criteria. E2E tests are out of scope for this plan.

**Commit style:** Conventional commits matching project history (`feat:`, `refactor:`, `chore:`). Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` / `package-lock.json` (auto)

- [ ] **Step 1: Install CodeMirror + Radix Tabs**

Run:
```bash
bun add @codemirror/lang-xml@^6.1.0 @codemirror/state@^6.4.1 @codemirror/view@^6.26.0 @codemirror/commands@^6.3.3 @codemirror/language@^6.10.1 @codemirror/autocomplete@^6.12.0 @codemirror/search@^6.5.6 @codemirror/theme-one-dark@^6.1.2 codemirror@^6.0.1 @radix-ui/react-tabs@^1.0.4
```

Expected: dependencies added to `package.json`; no peer-dep errors (project has `.npmrc` `legacy-peer-deps=true`).

- [ ] **Step 2: Verify build still compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock package-lock.json 2>/dev/null; git commit -m "$(cat <<'EOF'
chore: add codemirror 6 and radix tabs dependencies

For report template edit redesign: XML syntax-highlighted editors
and tab navigation between Dialog/Content/Preview views.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `src/utils/xml.ts`

Move the existing `formatXml` helper out of `ReportTemplateEdit.tsx` and add validation + line counting.

**Files:**
- Create: `src/utils/xml.ts`

- [ ] **Step 1: Write the utility file**

Contents of `src/utils/xml.ts`:

```ts
export interface XmlValidation {
  valid: boolean;
  message?: string;
  line?: number;
  column?: number;
}

export function formatXml(xml: string): string {
  if (!xml.trim()) return xml;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml.trim(), 'application/xml');
    if (doc.querySelector('parsererror')) return xml;
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    let formatted = '';
    let indent = 0;
    raw
      .replace(/>\s*</g, '><')
      .split(/(<[^>]+>)/g)
      .filter(Boolean)
      .forEach((node) => {
        if (/^<\/\w/.test(node)) indent--;
        formatted += '  '.repeat(Math.max(indent, 0)) + node + '\n';
        if (/^<\w[^/]*[^/]>$/.test(node)) indent++;
      });
    return formatted.trim();
  } catch {
    return xml;
  }
}

export function validateXml(xml: string): XmlValidation {
  if (!xml.trim()) return { valid: true };
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (!parserError) return { valid: true };
    const text = parserError.textContent || 'Invalid XML';
    const lineMatch = text.match(/[Ll]ine[^\d]*(\d+)/);
    const colMatch = text.match(/[Cc]olumn[^\d]*(\d+)/);
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
      valid: false,
      message: cleaned,
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      column: colMatch ? parseInt(colMatch[1], 10) : undefined,
    };
  } catch (e) {
    return { valid: false, message: e instanceof Error ? e.message : 'Invalid XML' };
  }
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function byteSize(text: string): number {
  if (!text) return 0;
  return new Blob([text]).size;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/xml.ts && git commit -m "$(cat <<'EOF'
feat: add xml utilities module

Extracts formatXml and adds validateXml, countLines, byteSize,
formatBytes, downloadText for shared use across xml editor/viewer
and report template edit page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create shadcn Tabs primitive

**Files:**
- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Write the Tabs component**

Contents of `src/components/ui/tabs.tsx`:

```tsx
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tabs.tsx && git commit -m "$(cat <<'EOF'
feat: add shadcn tabs primitive

Wraps Radix Tabs with project styling for use in the report
template edit page (Dialog / Content / Preview tabs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `ChipInput` component

**Files:**
- Create: `src/components/ui/chip-input.tsx`

- [ ] **Step 1: Write the ChipInput component**

Contents of `src/components/ui/chip-input.tsx`:

```tsx
import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '../../lib/utils';

export interface ChipInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

function parseChips(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function joinChips(chips: string[]): string {
  return chips.join(',');
}

export const ChipInput: React.FC<ChipInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  id,
  name,
  className,
}) => {
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chips = React.useMemo(() => parseChips(value), [value]);

  const commit = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (chips.includes(next)) {
      setDraft('');
      return;
    }
    onChange(joinChips([...chips, next]));
    setDraft('');
  };

  const removeAt = (index: number) => {
    const next = chips.filter((_, i) => i !== index);
    onChange(joinChips(next));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === 'Backspace' && !draft && chips.length > 0) {
      e.preventDefault();
      removeAt(chips.length - 1);
    }
  };

  if (disabled) {
    if (chips.length === 0) {
      return (
        <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center text-muted-foreground">
          -
        </div>
      );
    }
    return (
      <div className="flex min-h-9 w-full flex-wrap gap-1.5 rounded-md border border-input bg-muted/50 px-2 py-1.5">
        {chips.map((chip, i) => (
          <Badge key={`${chip}-${i}`} variant="secondary" className="text-xs">
            {chip}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip, i) => (
        <Badge
          key={`${chip}-${i}`}
          variant="secondary"
          className="gap-1 pl-2 pr-1 py-0.5 text-xs"
        >
          {chip}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
            className="ml-0.5 rounded hover:text-destructive"
            aria-label={`Remove ${chip}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        placeholder={chips.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
};

export default ChipInput;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/chip-input.tsx && git commit -m "$(cat <<'EOF'
feat: add chip input component

Tag-style input for comma-separated value lists. Used for business
unit allow/deny fields in report template edit. Enter/comma/tab
commits, backspace removes, X removes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create `XmlEditor` component

**Files:**
- Create: `src/components/XmlEditor.tsx`

- [ ] **Step 1: Write the XmlEditor component**

Contents of `src/components/XmlEditor.tsx`:

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { foldGutter, foldKeymap, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { Check, Copy, Download, Upload, Wand2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import {
  formatXml,
  validateXml,
  countLines,
  byteSize,
  formatBytes,
  downloadText,
  type XmlValidation,
} from '../utils/xml';

export interface XmlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  label?: string;
  filename?: string;
  onParseChange?: (status: XmlValidation) => void;
  readOnly?: boolean;
  uploadAccept?: string;
}

const baseExtensions = () => [
  lineNumbers(),
  foldGutter(),
  highlightActiveLine(),
  history(),
  bracketMatching(),
  indentOnInput(),
  closeBrackets(),
  autocompletion(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  search({ top: true }),
  xml(),
  EditorView.lineWrapping,
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...searchKeymap,
    ...completionKeymap,
    ...closeBracketsKeymap,
    indentWithTab,
  ]),
  EditorView.theme({
    '&': { fontSize: '12px' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid hsl(var(--border))' },
    '.cm-focused': { outline: 'none' },
  }),
];

export const XmlEditor: React.FC<XmlEditorProps> = ({
  value,
  onChange,
  placeholder,
  minHeight = 320,
  maxHeight = 560,
  label = 'XML',
  filename,
  onParseChange,
  readOnly = false,
  uploadAccept = '.xml,.txt',
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestValueRef = useRef(value);
  const [copied, setCopied] = useState(false);
  const [validation, setValidation] = useState<XmlValidation>({ valid: true });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const runValidate = useCallback(
    (text: string) => {
      const result = validateXml(text);
      setValidation(result);
      onParseChange?.(result);
    },
    [onParseChange],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        latestValueRef.current = next;
        onChange?.(next);
      }
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions(),
        updateListener,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    latestValueRef.current = value;
    runValidate(value);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === latestValueRef.current) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    latestValueRef.current = value;
    runValidate(value);
  }, [value, runValidate]);

  useEffect(() => {
    const handle = setTimeout(() => runValidate(latestValueRef.current), 300);
    return () => clearTimeout(handle);
  }, [value, runValidate]);

  const replaceAll = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  };

  const handleFormat = () => {
    const formatted = formatXml(latestValueRef.current);
    if (formatted === latestValueRef.current) {
      toast.info('Already formatted');
      return;
    }
    replaceAll(formatted);
    toast.success('XML formatted');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latestValueRef.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDownload = () => {
    if (!latestValueRef.current) {
      toast.info('Nothing to download');
      return;
    }
    const name = filename || `${label.toLowerCase().replace(/\s+/g, '-')}.xml`;
    downloadText(latestValueRef.current, name);
    toast.success(`Downloaded ${name}`);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const formatted = formatXml(text);
      replaceAll(formatted);
      toast.success(`${file.name} loaded`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClear = () => {
    if (!latestValueRef.current) return;
    setConfirmClearOpen(true);
  };

  const confirmClear = () => {
    replaceAll('');
    setConfirmClearOpen(false);
    toast.success('Cleared');
  };

  const lines = countLines(latestValueRef.current);
  const size = byteSize(latestValueRef.current);

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <label className="cursor-pointer inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadAccept}
                className="hidden"
                onChange={handleUpload}
              />
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload
            </label>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleFormat}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              Format
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleCopy}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-destructive hover:text-destructive"
              onClick={handleClear}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}
      {readOnly && (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleCopy}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleDownload}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      )}
      <div
        ref={hostRef}
        className="rounded-md border border-input bg-background overflow-hidden"
        style={{ minHeight, maxHeight }}
        data-placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {validation.valid ? (
          <div className="flex items-center gap-2 text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            <span>Valid XML</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {validation.line ? `Line ${validation.line}${validation.column ? `, col ${validation.column}` : ''}: ` : ''}
              {validation.message || 'Invalid XML'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{lines} lines</Badge>
          <Badge variant="outline" className="text-[10px]">{formatBytes(size)}</Badge>
        </div>
      </div>
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear editor?"
        description="This removes all content from the editor. You can undo this with Ctrl/⌘+Z."
        confirmText="Clear"
        cancelText="Cancel"
        confirmVariant="destructive"
        onConfirm={confirmClear}
      />
    </div>
  );
};

export default XmlEditor;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: build succeeds. Confirm CodeMirror types resolve.

- [ ] **Step 3: Commit**

```bash
git add src/components/XmlEditor.tsx && git commit -m "$(cat <<'EOF'
feat: add codemirror-based xml editor component

Syntax-highlighted XML editor with line numbers, folding, search,
autocomplete, and toolbar (upload, format, copy, download, clear).
Reports parse validity via onParseChange and surfaces line/column
error locations inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create `DialogPreview` component

**Files:**
- Create: `src/components/DialogPreview.tsx`

- [ ] **Step 1: Write the DialogPreview component**

Contents of `src/components/DialogPreview.tsx`:

```tsx
import React, { useMemo } from 'react';
import { AlertCircle, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';

export interface DialogPreviewProps {
  xml: string;
}

interface PreviewRow {
  key: string;
  label?: string;
  element: Element | null;
}

interface ParseResult {
  ok: boolean;
  error?: string;
  rows: PreviewRow[];
  counts: Record<string, number>;
}

function cleanDataSource(src: string | null | undefined): string {
  if (!src) return '';
  return src
    .replace(/^@/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDialogXml(xml: string): ParseResult {
  if (!xml.trim()) {
    return { ok: false, error: 'No XML provided', rows: [], counts: {} };
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Parse error',
      rows: [],
      counts: {},
    };
  }
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return {
      ok: false,
      error: (parserError.textContent || 'Invalid XML').replace(/\s+/g, ' ').trim().slice(0, 240),
      rows: [],
      counts: {},
    };
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== 'Dialog') {
    return {
      ok: false,
      error: 'Preview requires a <Dialog> root element',
      rows: [],
      counts: {},
    };
  }
  const children = Array.from(root.children);
  const rows: PreviewRow[] = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName === 'Label') {
      const labelText = el.getAttribute('Text') || '';
      const next = children[i + 1];
      if (next && next.tagName !== 'Label') {
        rows.push({ key: `${i}`, label: labelText, element: next });
        counts[next.tagName] = (counts[next.tagName] || 0) + 1;
        i++;
      } else {
        rows.push({ key: `${i}`, label: labelText, element: null });
      }
    } else {
      rows.push({ key: `${i}`, label: undefined, element: el });
      counts[el.tagName] = (counts[el.tagName] || 0) + 1;
    }
  }
  return { ok: true, rows, counts };
}

function renderControl(el: Element): React.ReactNode {
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
        className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm text-muted-foreground shadow-sm"
      >
        <option>Select {source || 'value'}…</option>
      </select>
    );
  }
  const attrs = Array.from(el.attributes);
  return (
    <div className="flex h-9 w-full items-center rounded-md border border-dashed border-input bg-muted/30 px-3 text-xs text-muted-foreground">
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

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml }) => {
  const parsed = useMemo(() => parseDialogXml(xml), [xml]);

  if (!parsed.ok) {
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-medium text-destructive">Preview unavailable</div>
            <div className="mt-1 text-xs text-muted-foreground">{parsed.error}</div>
          </div>
        </div>
      </div>
    );
  }

  const fieldCount = parsed.rows.filter((r) => r.element).length;
  const countBadges = Object.entries(parsed.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => (
      <Badge key={tag} variant="outline" className="text-[10px]">
        {n} {tag}
      </Badge>
    ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Dialog Preview</span>
          <Badge variant="secondary" className="text-[10px]">
            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">{countBadges}</div>
      </div>
      <div className="rounded-md border bg-muted/20 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {parsed.rows.map((row) => (
            <div key={row.key} className="space-y-2">
              {row.label !== undefined && (
                <Label className="text-xs text-muted-foreground">{row.label || '\u00A0'}</Label>
              )}
              {row.element ? (
                renderControl(row.element)
              ) : (
                <div className="text-xs text-muted-foreground italic">(no control)</div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          Preview only — controls are disabled and lookup data is not loaded.
        </p>
      </div>
    </div>
  );
};

export default DialogPreview;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/DialogPreview.tsx && git commit -m "$(cat <<'EOF'
feat: add dialog xml preview component

Parses <Dialog> XML, pairs Label with following Date/Lookup siblings,
renders read-only form preview with tag counts and fallback for
unknown elements or parse errors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rewrite `ReportTemplateEdit.tsx` — scaffold new layout

Full rewrite of the page to use the new components and layout. Done in a single task (replacing the file wholesale) because the layout changes are deeply intertwined.

**Files:**
- Modify (rewrite): `src/pages/ReportTemplateEdit.tsx`

- [ ] **Step 1: Replace file contents**

Write the following as the complete contents of `src/pages/ReportTemplateEdit.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import reportTemplateService from '../services/reportTemplateService';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Skeleton } from '../components/ui/skeleton';
import { ChipInput } from '../components/ui/chip-input';
import { XmlEditor } from '../components/XmlEditor';
import { DialogPreview } from '../components/DialogPreview';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { countLines, type XmlValidation } from '../utils/xml';

interface ReportTemplateFormData {
  name: string;
  description: string;
  report_group: string;
  dialog: string;
  content: string;
  is_standard: boolean;
  allow_business_unit: string;
  deny_business_unit: string;
  is_active: boolean;
}

interface MetadataFields {
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

const initialFormData: ReportTemplateFormData = {
  name: '',
  description: '',
  report_group: '',
  dialog: '',
  content: '',
  is_standard: true,
  allow_business_unit: '',
  deny_business_unit: '',
  is_active: true,
};

const fmtDateTime = (v?: string) => {
  if (!v) return '-';
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const ReportTemplateEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ReportTemplateFormData>(initialFormData);
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(initialFormData);
  const [metadata, setMetadata] = useState<MetadataFields>({});
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dialog' | 'content' | 'preview'>('dialog');
  const [dialogValidation, setDialogValidation] = useState<XmlValidation>({ valid: true });
  const [contentValidation, setContentValidation] = useState<XmlValidation>({ valid: true });
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const handleCancelEdit = useCallback(() => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
    setFieldErrors({});
  }, [savedFormData]);

  useGlobalShortcuts({
    onSave: () => {
      if (editing && !saving) formRef.current?.requestSubmit();
    },
    onCancel: () => {
      if (editing && !isNew) handleCancelEdit();
    },
  });

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchTemplate = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await reportTemplateService.getById(id);
      setRawResponse(data);
      const template = data.data || data;
      const loaded: ReportTemplateFormData = {
        name: template.name || '',
        description: template.description || '',
        report_group: template.report_group || '',
        dialog: template.dialog || '',
        content: template.content || '',
        is_standard: template.is_standard ?? true,
        allow_business_unit: template.allow_business_unit || '',
        deny_business_unit: template.deny_business_unit || '',
        is_active: template.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setMetadata({
        created_at: template.created_at,
        created_by_name: template.created_by_name,
        updated_at: template.updated_at,
        updated_by_name: template.updated_by_name,
      });
    } catch (err: unknown) {
      setError('Failed to load report template: ' + getErrorDetail(err));
      devLog('Error fetching report template:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isNew) fetchTemplate();
  }, [isNew, fetchTemplate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (!value && ['name', 'report_group'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: `${name.replace('_', ' ')} is required` }));
    } else {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleXmlChange = (field: 'dialog' | 'content') => (val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setError('');
  };

  const handleChipChange = (field: 'allow_business_unit' | 'deny_business_unit') => (val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.report_group.trim()) errs.report_group = 'Report group is required';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setSaving(false);
      return;
    }

    try {
      if (isNew) {
        const result = await reportTemplateService.create(formData);
        const created = result.data || result;
        toast.success('Report template created successfully');
        if (created?.id) {
          navigate(`/report-templates/${created.id}/edit`, { replace: true });
        } else {
          navigate('/report-templates');
        }
      } else {
        await reportTemplateService.update(id!, formData);
        toast.success('Changes saved successfully');
        await fetchTemplate();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save report template: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  const dialogLines = countLines(formData.dialog);
  const contentLines = countLines(formData.content);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/report-templates')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {loading ? <Skeleton className="h-8 w-48" /> : isNew ? 'New Report Template' : formData.name || 'Report Template'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isNew ? 'Create a new report template' : 'View and edit report template details'}
              </p>
              {!isNew && !loading && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                    {formData.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant={formData.is_standard ? 'default' : 'outline'}>
                    {formData.is_standard ? 'Standard' : 'Custom'}
                  </Badge>
                  {formData.report_group && <Badge variant="outline">{formData.report_group}</Badge>}
                </div>
              )}
            </div>
          </div>
          {!isNew && !loading && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {editing ? (
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 sm:gap-6">
            {/* Left column: Info + BU Scope + Metadata */}
            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">Name {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <Input
                              type="text"
                              id="name"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              onBlur={handleBlur}
                              onFocus={handleFocus}
                              placeholder="Template name"
                              className={fieldErrors.name ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.name && (
                              <p className="text-xs text-destructive">{fieldErrors.name}</p>
                            )}
                          </>
                        ) : (
                          <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                            {formData.name || '-'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        {editing ? (
                          <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Template description"
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                          />
                        ) : (
                          <div className="flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm min-h-[4.5rem] whitespace-pre-wrap">
                            {formData.description || '-'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="report_group">Report Group {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <Input
                              type="text"
                              id="report_group"
                              name="report_group"
                              value={formData.report_group}
                              onChange={handleChange}
                              onBlur={handleBlur}
                              onFocus={handleFocus}
                              placeholder="e.g. inventory, procurement"
                              className={fieldErrors.report_group ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.report_group && (
                              <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
                            )}
                          </>
                        ) : (
                          <div>
                            <Badge variant="outline">{formData.report_group || '-'}</Badge>
                          </div>
                        )}
                      </div>

                      {editing && (
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              id="is_standard"
                              name="is_standard"
                              checked={formData.is_standard}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            Standard
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              id="is_active"
                              name="is_active"
                              checked={formData.is_active}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            Active
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business Unit Scope</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="allow_business_unit">Allow</Label>
                        <ChipInput
                          id="allow_business_unit"
                          name="allow_business_unit"
                          value={formData.allow_business_unit}
                          onChange={handleChipChange('allow_business_unit')}
                          placeholder="Type BU code + Enter (blank = all)"
                          disabled={!editing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deny_business_unit">Deny</Label>
                        <ChipInput
                          id="deny_business_unit"
                          name="deny_business_unit"
                          value={formData.deny_business_unit}
                          onChange={handleChipChange('deny_business_unit')}
                          placeholder="Type BU code + Enter (blank = none)"
                          disabled={!editing}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {!isNew && !loading && (metadata.created_at || metadata.updated_at) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Created</div>
                      <div className="font-medium">{fmtDateTime(metadata.created_at)}</div>
                      {metadata.created_by_name && (
                        <div className="text-muted-foreground">by {metadata.created_by_name}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground">Updated</div>
                      <div className="font-medium">{fmtDateTime(metadata.updated_at)}</div>
                      {metadata.updated_by_name && (
                        <div className="text-muted-foreground">by {metadata.updated_by_name}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column: tabs */}
            <div>
              <Card>
                <CardHeader>
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                    <TabsList>
                      <TabsTrigger value="dialog">
                        Dialog XML
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {dialogLines}
                        </Badge>
                        {!dialogValidation.valid && (
                          <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive" aria-label="Invalid" />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="content">
                        Content XML
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {contentLines}
                        </Badge>
                        {!contentValidation.valid && (
                          <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive" aria-label="Invalid" />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-80 w-full" />
                  ) : (
                    <>
                      <div hidden={activeTab !== 'dialog'}>
                        <XmlEditor
                          value={formData.dialog}
                          onChange={handleXmlChange('dialog')}
                          onParseChange={setDialogValidation}
                          label="Dialog"
                          filename="dialog.xml"
                          uploadAccept=".xml,.txt"
                          readOnly={!editing}
                          minHeight={360}
                          maxHeight={560}
                        />
                      </div>
                      <div hidden={activeTab !== 'content'}>
                        <XmlEditor
                          value={formData.content}
                          onChange={handleXmlChange('content')}
                          onParseChange={setContentValidation}
                          label="Content"
                          filename="content.xml"
                          uploadAccept=".frx,.xml,.txt"
                          readOnly={!editing}
                          minHeight={360}
                          maxHeight={560}
                        />
                      </div>
                      <div hidden={activeTab !== 'preview'}>
                        <DialogPreview xml={formData.dialog} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>

      {/* Sticky action bar */}
      {editing && (
        <div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-white/10 bg-background/85 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {hasChanges ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <span className="text-muted-foreground">No changes</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isNew && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={saving || (!isNew && !hasChanges)}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Sheet */}
      {process.env.NODE_ENV === 'development' && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-20 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  DEV
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/report-template/{id}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default ReportTemplateEdit;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: build succeeds with no TS errors. If CodeMirror bundler warnings appear they are non-fatal.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx && git commit -m "$(cat <<'EOF'
feat: redesign report template edit page

- Two-column sticky layout (Info + BU Scope + Metadata / tabbed editors)
- CodeMirror XML editors with syntax highlighting, folding, search
- Tabs for Dialog XML, Content XML, Preview
- DialogPreview renders parsed form from <Label>+<Date>/<Lookup> pairs
- ChipInput replaces comma-separated BU allow/deny text
- Prominent status badges in header (Active, Standard, report group)
- Metadata card shows created_at/by and updated_at/by
- Sticky bottom action bar with unsaved-changes pulse indicator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual smoke test in dev server

**Files:** (none modified)

- [ ] **Step 1: Start dev server**

Run: `bun start` (in background or a separate terminal)
Expected: server starts at `http://localhost:3001` with no compile errors.

- [ ] **Step 2: Verify existing template (read-only mode)**

Open: `http://localhost:3001/report-templates/388515c1-760c-43ef-82a8-9218e2e36956/edit`

Check:
- [ ] Header shows template name + subtitle + badges (Active/Inactive, Standard/Custom, report_group)
- [ ] Left column sticky on large screens
- [ ] Template Info card shows name, description, report group as read-only
- [ ] Business Unit Scope card shows Allow/Deny as badges (or `-`)
- [ ] Metadata card shows Created / Updated date + by (if present in API response)
- [ ] Right side tabs: `Dialog XML`, `Content XML`, `Preview`
- [ ] Dialog tab shows CodeMirror editor with syntax-highlighted XML (read-only, no toolbar except Copy/Download)
- [ ] Line count badge appears in tab
- [ ] Status chip shows `✓ Valid XML` and size badges
- [ ] Preview tab shows form rows (e.g. 4 Date fields + 4 Lookup fields paired with labels for the sample template)

- [ ] **Step 3: Enter edit mode**

Click `Edit` in top-right.

Check:
- [ ] Form fields become editable
- [ ] Chip inputs accept Enter/comma to add chip, X to remove, Backspace on empty removes last
- [ ] Editor toolbar appears with Upload, Format, Copy, Download, Clear
- [ ] Sticky bottom bar appears showing "No changes"

- [ ] **Step 4: Make changes**

Edit the Name field.

Check:
- [ ] Sticky bar shows amber pulse + "Unsaved changes"
- [ ] Ctrl/⌘+S triggers save
- [ ] Esc cancels edit (reverts Name)

- [ ] **Step 5: XML editor tests**

In Dialog tab (edit mode):
- [ ] Click `Format` — XML reformats with indentation
- [ ] Click `Copy` — toast confirms; paste verifies contents
- [ ] Click `Download` — file `dialog.xml` downloads
- [ ] Upload a file via `Upload` button — content replaces editor
- [ ] Click `Clear` → ConfirmDialog appears → Confirm clears editor
- [ ] Paste invalid XML (e.g. `<Dialog><Bad>`) — status shows destructive error with line number; tab shows red dot indicator

- [ ] **Step 6: Preview tab**

With the sample template's dialog XML:
- [ ] Preview shows 8 rows: 4 Date fields + 4 Lookup fields with correct labels
- [ ] Date controls render as disabled `<input type="date">`
- [ ] Lookup controls render as disabled `<select>` with `Select Vendor List…`, etc.
- [ ] Header chips show `6 Lookup, 2 Date` counts
- [ ] With invalid XML, shows "Preview unavailable" error card

- [ ] **Step 7: Save**

Click `Save Changes` in sticky bar.

Check:
- [ ] Spinner shows during save
- [ ] Toast: "Changes saved successfully"
- [ ] Edit mode exits, read-only mode restored
- [ ] Sticky bar disappears
- [ ] Updated metadata (if backend returns it)

- [ ] **Step 8: New template flow**

Navigate: `http://localhost:3001/report-templates/new`

Check:
- [ ] Edit mode active immediately
- [ ] No metadata card
- [ ] No Cancel button in sticky bar (only Save)
- [ ] Save enabled only after required fields filled
- [ ] After save, redirects to `/report-templates/:id/edit` with new id

- [ ] **Step 9: Mobile responsive check**

Resize browser to ~375px width.

Check:
- [ ] Columns stack vertically
- [ ] Tabs remain horizontal (scrollable if needed)
- [ ] Sticky bar spans full width (no sidebar offset)
- [ ] Editor toolbar wraps without overflow

- [ ] **Step 10: No console errors**

Open DevTools → Console during all steps.

Check:
- [ ] No red errors (warnings about CodeMirror source maps are OK)

- [ ] **Step 11: Commit if any fixes were needed**

If issues were found and fixed during manual testing, commit each fix as a separate commit with message `fix: <description>` and the standard co-author trailer.

---

## Task 9: Final build verification

**Files:** (none modified)

- [ ] **Step 1: Production build**

Run: `bun run build`
Expected: build completes successfully. Warnings about bundle size due to CodeMirror are acceptable.

- [ ] **Step 2: Confirm git status clean**

Run: `git status`
Expected: "working tree clean" on `main`.

- [ ] **Step 3: Review git log**

Run: `git log --oneline -15`
Expected: commits in order — deps, xml utils, tabs, chip-input, xml-editor, dialog-preview, page redesign, (any fix commits).

---

## Self-Review Results

**Spec coverage:**
- [x] CodeMirror 6 editor — Task 5
- [x] Radix Tabs — Task 3
- [x] ChipInput for BU scope — Task 4
- [x] Dialog Preview from documented schema — Task 6
- [x] `src/utils/xml.ts` (formatXml, validateXml, line/byte counters) — Task 2
- [x] Page redesign with sticky left column + right tabs — Task 7
- [x] Sticky action bar with unsaved-changes indicator — Task 7
- [x] Status badges in header (Active, Standard, report_group) — Task 7
- [x] Metadata card — Task 7
- [x] Preserves useUnsavedChanges, useGlobalShortcuts, debug sheet, toast patterns — Task 7
- [x] Manual testing against sample XML — Task 8

**Placeholder scan:** No TBDs, TODOs, or generic "add error handling" instructions. All code blocks are complete and runnable.

**Type consistency:** `XmlValidation` defined in `src/utils/xml.ts` (Task 2), consumed in `XmlEditor` (Task 5) and `ReportTemplateEdit` (Task 7). `ChipInputProps`, `XmlEditorProps`, `DialogPreviewProps` defined once and used where declared.

**Scope:** Focused on the one page and its directly-required components. No unrelated refactoring.
