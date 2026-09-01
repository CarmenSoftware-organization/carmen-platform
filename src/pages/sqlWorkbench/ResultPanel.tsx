
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, AlertTriangle, Table as TableIcon, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { SqlExecuteResult } from '../../types';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

interface ResultPanelProps {
  result: SqlExecuteResult | null;
  error: string | null;
  isRunning: boolean;
  onClose?: () => void;
  /** Share of the work column this pane takes, driven by the divider above it. */
  grow?: number;
}

/**
 * Row height in px, and it has to be exact — the virtual window maps scroll offset to a row
 * index by dividing by it, so a row that renders taller than this makes the spacers lie and the
 * rows drift out from under the header. Every cell is one truncated line, so the height is
 * `py-1` (8) + a 16px line + the 1px bottom border. `ROW_H` is asserted against a real measured
 * row in development rather than trusted.
 */
const ROW_H = 25;

/** Rows rendered beyond each edge of the viewport so a fast scroll doesn't show blank bands. */
const OVERSCAN = 8;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(result: SqlExecuteResult) {
  const header = result.columns.map(csvEscape).join(",");
  const body = result.rows
    .map((r) => result.columns.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `query_result_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseErrorLine(error: string): number | null {
  const m = error.match(/line\s+(\d+)/i) || error.match(/at or near.*?:(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ResultPanel({
  result,
  error,
  isRunning,
  onClose,
  grow = 1,
}: ResultPanelProps) {
  const { t } = useI18n();

  // Virtual window over the rows. A result set is delivered whole (sqlQueryService.executeSql
  // returns every row), and the old client-side pager existed only so the DOM would not have to
  // hold thousands of <tr>s. Rendering just the visible slice removes that reason, so the grid
  // is now one continuous scroll — which is what the header's row count already promised.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // The pane is resizable, so its height is not a constant — observe it rather than measure once.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [result, error, isRunning]);

  // A new result starts at the top; leaving the old offset would scroll the new rows to an
  // arbitrary place, or past their end.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [result]);

  const rows = result?.rows ?? [];
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const windowRows = rows.slice(first, last);
  const padTop = first * ROW_H;
  const padBottom = Math.max(0, (rows.length - last) * ROW_H);

  // ROW_H is a layout contract, not an observation: if a cell ever grows a second line or the
  // padding changes, the virtual window silently misaligns instead of failing. Say so loudly in
  // development rather than shipping rows that drift.
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const tr = bodyRef.current?.querySelector<HTMLTableRowElement>('tr[data-result-row]');
    if (tr && Math.abs(tr.offsetHeight - ROW_H) > 0.5) {
      console.warn(
        `[ResultPanel] ROW_H is ${ROW_H}px but a row measured ${tr.offsetHeight}px — the virtual window will drift.`,
      );
    }
  }, [result]);

  const idle = !result && !error && !isRunning;
  const errorLine = error ? parseErrorLine(error) : null;

  return (
    <div
      className="flex min-h-[16rem] flex-col border-t lg:min-h-0 lg:border-t-0"
      style={{ flexGrow: grow, flexShrink: 1, flexBasis: 0 }}
    >
      {/* Header */}
      <div className="bg-muted/30 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {error ? (
          <AlertTriangle className="text-destructive size-4" />
        ) : (
          <TableIcon className="text-muted-foreground size-4" />
        )}
        <span className="text-sm font-semibold">
          {error ? t('pages.sqlWorkbench.resultError') : isRunning ? t('pages.sqlWorkbench.resultRunning') : t('pages.sqlWorkbench.results')}
        </span>
        {result && (
          <>
            <span className="text-muted-foreground text-xs">
              {result.rowCount === 1
                ? t('pages.sqlWorkbench.rowCount', { count: result.rowCount })
                : t('pages.sqlWorkbench.rowCountPlural', { count: result.rowCount })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('pages.sqlWorkbench.msSuffix', { ms: result.durationMs })}
            </span>
            <span className="text-muted-foreground text-xs">
              {result.columns.length === 1
                ? t('pages.sqlWorkbench.colCount', { count: result.columns.length })
                : t('pages.sqlWorkbench.colCountPlural', { count: result.columns.length })}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {result && result.rowCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => exportCsv(result)}
              title={t('common.action.exportCsv')}
            >
              <Download className="mr-1 size-3.5" />
              CSV
            </Button>
          )}
          {onClose && !idle && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={onClose}
              title={t('pages.sqlWorkbench.closeResults')}
              aria-label={t('pages.sqlWorkbench.closeResults')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      {idle ? (
        <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-3 py-6 text-xs">
          {t('pages.sqlWorkbench.resultsIdle')}
        </div>
      ) : error ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <pre
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive rounded border p-3 text-xs whitespace-pre-wrap"
          >
            {error}
          </pre>
          {errorLine !== null && (
            <p className="text-muted-foreground mt-2 text-xs">
              Hint: error referenced line{" "}
              <span className="text-foreground">{errorLine}</span>
            </p>
          )}
        </div>
      ) : isRunning && !result ? (
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center py-10 text-sm"
        >
          {t('pages.sqlWorkbench.runningQuery')}
        </div>
      ) : result && result.rowCount === 0 ? (
        <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center py-10 text-sm">
          {t('pages.sqlWorkbench.noRowsReturned')}
        </div>
      ) : result ? (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs [&_th]:whitespace-nowrap">
              {/* ทึบ ไม่ใช่ `bg-muted/60 backdrop-blur` — หัวตารางนี้ปักอยู่กับที่ในกรอบเลื่อน
                  สูง 420px แถวผลลัพธ์จึงวิ่งผ่านใต้มันตลอด และที่ 60% แถวที่เลื่อนผ่านกลาย
                  เป็นเงาทับชื่อคอลัมน์ที่กำลังใช้อ่านผลอยู่ เหตุผลเดียวกับแถบ header ใน
                  `Layout` และแถบ tab ของหน้า Edit */}
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-muted-foreground w-12 border-r border-b px-2 py-1.5 text-right font-semibold">
                    #
                  </th>
                  {result.columns.map((c) => (
                    <th
                      key={c}
                      className="border-r border-b px-2 py-1.5 text-left font-semibold"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {/* Spacer rows stand in for everything scrolled past, so the scrollbar reflects
                    the whole result set and the sticky header keeps its column widths. */}
                {padTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={result.columns.length + 1} style={{ height: padTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {windowRows.map((row, idx) => {
                  const rowIdx = first + idx + 1;
                  return (
                    <tr
                      key={rowIdx}
                      data-result-row=""
                      style={{ height: ROW_H }}
                      className="hover:bg-muted/40"
                    >
                      <td className="text-muted-foreground border-r border-b px-2 py-1 text-right">
                        {rowIdx}
                      </td>
                      {result.columns.map((c) => {
                        const v = row[c];
                        const isNull = v === null || v === undefined;
                        return (
                          <td
                            key={c}
                            className={cn(
                              "border-r border-b px-2 py-1 align-top",
                              isNull && "text-muted-foreground italic",
                            )}
                            title={renderCell(v)}
                          >
                            <div className="max-w-[400px] truncate">
                              {renderCell(v)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {padBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={result.columns.length + 1} style={{ height: padBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* What the pager used to answer — "where am I in 5000 rows" — a bare scrollbar does
              not. One quiet line keeps that, without putting the rows behind a page control. */}
          {rows.length * ROW_H > viewportH && viewportH > 0 && (
            <div className="bg-muted/30 text-muted-foreground flex shrink-0 items-center justify-end border-t px-3 py-1 font-mono text-[11px]">
              {t('pages.sqlWorkbench.rangeOfTotal', {
                from: Math.floor(scrollTop / ROW_H) + 1,
                to: Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H)),
                total: rows.length,
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
