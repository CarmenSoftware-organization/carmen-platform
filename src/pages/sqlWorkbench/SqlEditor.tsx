import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { format as sqlFormat } from 'sql-formatter';
import { Play, Wand2, Search as SearchIcon, Eraser, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import type { DbObjectsResponse } from '../../types';
import { countStatements, findStatementAt } from './sqlEditorHelpers';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: (sqlToRun: string) => void;
  isRunning?: boolean;
  schema?: DbObjectsResponse;
  height?: number;
}

// Build the { table: [columns] } map lang-sql uses for schema-aware autocomplete.
function buildSchemaMap(schema?: DbObjectsResponse): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (!schema) return map;
  for (const t of schema.tables ?? []) map[t.name] ??= [];
  for (const v of schema.views ?? []) map[v.name] ??= [];
  for (const c of schema.columns ?? []) (map[c.table] ??= []).push(c.column);
  return map;
}

function schemaKey(schema?: DbObjectsResponse): string {
  if (!schema) return '';
  return `${schema.tables?.length ?? 0}:${schema.views?.length ?? 0}:${schema.columns?.length ?? 0}`;
}

export function SqlEditor({
  value,
  onChange,
  onRun,
  isRunning = false,
  schema,
  height = 360,
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestValueRef = useRef(value);
  const onRunRef = useRef(onRun);
  const langCompartment = useRef(new Compartment());

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  // Run the current selection, else the statement under the cursor.
  const runFromEditor = (view: EditorView): boolean => {
    const cb = onRunRef.current;
    if (!cb) return false;
    const sel = view.state.selection.main;
    const selected = view.state.sliceDoc(sel.from, sel.to);
    if (selected.trim()) {
      cb(selected.trim());
      return true;
    }
    const doc = view.state.doc.toString();
    const { start, end } = findStatementAt(doc, sel.head);
    const stmt = doc.slice(start, end).trim().replace(/;\s*$/, '');
    if (stmt) cb(stmt);
    return true;
  };

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        latestValueRef.current = next;
        onChange(next);
      }
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        closeBrackets(),
        autocompletion(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        search({ top: true }),
        langCompartment.current.of(
          sql({ dialect: PostgreSQL, schema: buildSchemaMap(schema), upperCaseKeywords: true }),
        ),
        keymap.of([
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: (view) => runFromEditor(view),
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        EditorView.theme({
          '&': { fontSize: '13px' },
          '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid hsl(var(--border))',
          },
          '.cm-focused': { outline: 'none' },
        }),
        updateListener,
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    latestValueRef.current = value;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === latestValueRef.current) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    latestValueRef.current = value;
  }, [value]);

  // Reconfigure the language (schema autocomplete) when the schema changes,
  // without discarding editor content.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(
        sql({ dialect: PostgreSQL, schema: buildSchemaMap(schema), upperCaseKeywords: true }),
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaKey(schema)]);

  const replaceAll = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  };

  const handleRun = () => {
    const view = viewRef.current;
    if (view) runFromEditor(view);
  };

  const handleFormat = () => {
    try {
      const formatted = sqlFormat(latestValueRef.current, {
        language: 'postgresql',
        keywordCase: 'upper',
        tabWidth: 2,
      });
      replaceAll(formatted);
      onChange(formatted);
    } catch {
      // ignore format errors silently
    }
  };

  const handleFind = () => {
    const view = viewRef.current;
    if (view) openSearchPanel(view);
  };

  const handleClear = () => {
    replaceAll('');
    onChange('');
  };

  const totalLines = value.split('\n').length;
  const stmtCount = countStatements(value);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {onRun && (
          <Button
            size="sm"
            className="h-7"
            onClick={handleRun}
            disabled={isRunning}
            title="Run (Ctrl/⌘+Enter)"
          >
            {isRunning ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            Run
          </Button>
        )}
        <div className="bg-border mx-1 h-5 w-px" />
        <Button size="sm" variant="ghost" className="h-7" onClick={handleFormat} title="Format SQL">
          <Wand2 className="mr-1 size-3.5" />
          Format
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={handleFind} title="Find (Ctrl/⌘+F)">
          <SearchIcon className="mr-1 size-3.5" />
          Find
        </Button>
        <div className="ml-auto" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-destructive"
          onClick={handleClear}
          title="Clear editor"
        >
          <Eraser className="mr-1 size-3.5" />
          Clear
        </Button>
      </div>

      <div
        ref={hostRef}
        className="overflow-auto"
        style={{ minHeight: height, maxHeight: height + 160 }}
      />

      <div
        className={cn(
          'bg-muted/30 text-muted-foreground flex flex-wrap items-center gap-x-4 border-t px-3 py-1 text-[11px]',
        )}
      >
        <span>
          <span className="text-foreground">{totalLines}</span> lines
        </span>
        <span>
          <span className="text-foreground">{stmtCount}</span> statement
          {stmtCount === 1 ? '' : 's'}
        </span>
        <span className="ml-auto">SQL · PostgreSQL</span>
      </div>
    </div>
  );
}
