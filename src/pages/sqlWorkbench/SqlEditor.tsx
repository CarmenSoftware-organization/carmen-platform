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
import { toast } from 'sonner';
import { Play, Wand2, Search as SearchIcon, Eraser, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { DbObjectsResponse } from '../../types';
import { countStatements, findStatementAt } from './sqlEditorHelpers';
import { useI18n } from '../../hooks/useI18n';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: (sqlToRun: string) => void;
  isRunning?: boolean;
  schema?: DbObjectsResponse;
  /** Share of the work column this pane takes, driven by the divider below it. */
  grow?: number;
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

export function SqlEditor({
  value,
  onChange,
  onRun,
  isRunning = false,
  schema,
  grow = 1,
}: SqlEditorProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestValueRef = useRef(value);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const langCompartment = useRef(new Compartment());

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
    const stmtAt = (offset: number) => {
      const { start, end } = findStatementAt(doc, offset);
      return doc.slice(start, end).trim().replace(/;\s*$/, '');
    };
    // The caret sitting just past a trailing `;` resolves to the *next* (empty) statement, which
    // is where the caret lands after typing a query — the single most common way to reach Run.
    // Falling back one character puts it back inside the statement that was just typed, so Run
    // does the obvious thing instead of no-oping. Only a genuinely empty editor reaches the toast.
    const stmt = stmtAt(sel.head) || stmtAt(Math.max(0, sel.head - 1)) || doc.trim().replace(/;\s*$/, '');
    if (!stmt) {
      toast.error(t('pages.sqlWorkbench.nothingToRun'));
      return true;
    }
    cb(stmt);
    return true;
  };

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        latestValueRef.current = next;
        onChangeRef.current(next);
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
          // `height: 100%` resolves only against a definite parent height — true inside the
          // desktop frame, false on mobile where the pane is sized by min-height, which
          // collapsed the editor to a single line. Flex fill is correct in both.
          '&': { fontSize: '13px', flex: '1 1 auto', minHeight: 0 },
          // Grow the scroller to the full pane, not just the text: the empty space under the
          // last line is still the editor, and clicking it should place the caret.
          '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            flexGrow: 1,
            overflow: 'auto',
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
  }, [schema]);

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.formatFailed'));
    }
  };

  const handleFind = () => {
    const view = viewRef.current;
    if (view) openSearchPanel(view);
  };

  const handleClear = () => {
    replaceAll('');
  };

  const totalLines = value.split('\n').length;
  const stmtCount = countStatements(value);

  return (
    <div
      // `min-h-0` is what lets the divider shrink this pane past its content — desktop only.
      // On mobile there is no divider and the column is content-height, so removing the
      // min-content floor just collapses the pane to zero and spills the editor out of it.
      className="flex flex-col lg:min-h-0"
      style={{ flexGrow: grow, flexShrink: 1, flexBasis: 0 }}
    >
      {/* One row, one job: everything here acts on the text in the editor. Persisting the text as
          a database object lives on its own strip above, next to the name it saves under. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {onRun && (
          <Button
            size="sm"
            className="h-7"
            onClick={handleRun}
            disabled={isRunning}
            title={t('pages.sqlWorkbench.runTitle')}
          >
            {isRunning ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            {t('pages.sqlWorkbench.run')}
          </Button>
        )}
        <div className="bg-border mx-1 h-5 w-px" />
        <Button size="sm" variant="ghost" className="h-7" onClick={handleFormat} title={t('pages.sqlWorkbench.formatSqlTitle')}>
          <Wand2 className="mr-1 size-3.5" />
          {t('pages.sqlWorkbench.format')}
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={handleFind} title={t('pages.sqlWorkbench.findTitle')}>
          <SearchIcon className="mr-1 size-3.5" />
          {t('pages.sqlWorkbench.find')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive h-7"
          onClick={handleClear}
          title={t('pages.sqlWorkbench.clearEditorTitle')}
        >
          <Eraser className="mr-1 size-3.5" />
          {t('pages.sqlWorkbench.clear')}
        </Button>

        {/* Editor meta rides the toolbar rather than a status bar of its own — it is one line of
            text and a whole extra row for it costs more screen than it is worth in a pane that
            has to share its height with the result grid. */}
        <div className="text-muted-foreground ml-auto hidden items-center gap-x-3 pr-1 font-mono text-[11px] sm:flex">
          <span>{t(totalLines === 1 ? 'pages.sqlWorkbench.metaLine' : 'pages.sqlWorkbench.metaLines', { count: totalLines })}</span>
          <span aria-hidden="true" className="opacity-40">·</span>
          <span>
            {t(stmtCount === 1 ? 'pages.sqlWorkbench.metaStatement' : 'pages.sqlWorkbench.metaStatements', { count: stmtCount })}
          </span>
          <span aria-hidden="true" className="opacity-40">·</span>
          <span>PostgreSQL</span>
        </div>
      </div>

      {/* The min-height is the MOBILE floor only: below `lg` the frame is content-height, so the
          flex shares have nothing to divide and each pane must claim a usable size of its own.
          On desktop it has to give way — leave it in place and the divider cannot shrink the
          editor past it, so dragging up overflows the frame and clips the editor instead of
          handing the height to the rows. */}
      <div ref={hostRef} className="flex min-h-[12rem] flex-1 flex-col overflow-hidden lg:min-h-0" />
    </div>
  );
}
