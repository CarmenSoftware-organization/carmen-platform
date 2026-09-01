
import { useState } from 'react';
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
}

const PAGE_SIZES = [50, 100, 200, 500];

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
}: ResultPanelProps) {
  const { t } = useI18n();
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);

  const totalRows = result?.rowCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pagedRows = (() => {
    if (!result) return [];
    const start = safePage * pageSize;
    return result.rows.slice(start, start + pageSize);
  })();

  const idle = !result && !error && !isRunning;
  const errorLine = error ? parseErrorLine(error) : null;

  return (
    <div className="flex min-h-[16rem] flex-[3] flex-col border-t lg:min-h-0">
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
          <div className="min-h-0 flex-1 overflow-auto">
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
              <tbody>
                {pagedRows.map((row, idx) => {
                  const rowIdx = safePage * pageSize + idx + 1;
                  return (
                    <tr key={rowIdx} className="hover:bg-muted/40">
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
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalRows > pageSize && (
            <div className="bg-muted/30 flex shrink-0 items-center gap-2 border-t px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{t('table.rowsPerPage')}:</span>
              <select
                className="bg-background rounded border px-1 py-0.5 text-xs"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground ml-auto">
                {t('pages.sqlWorkbench.rangeOfTotal', {
                  from: safePage * pageSize + 1,
                  to: Math.min((safePage + 1) * pageSize, totalRows),
                  total: totalRows,
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                {t('pages.sqlWorkbench.prev')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                {t('pages.sqlWorkbench.next')}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
