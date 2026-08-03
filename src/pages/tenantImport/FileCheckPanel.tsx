import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PreconfigCheckReport, PreconfigStepMeta } from '../../types';

const STATUS_LABEL: Record<PreconfigCheckReport['steps'][number]['status'], string> = {
  ready: 'Ready',
  sheet_missing: 'Sheet missing',
  columns_missing: 'Columns missing',
};

/**
 * Pre-wizard report: which sheets were found, how many rows, what is missing.
 * A step that is not `ready` still appears here so nothing disappears silently.
 */
export function FileCheckPanel({
  report,
  steps,
  onContinue,
  onReset,
}: {
  report: PreconfigCheckReport;
  steps: PreconfigStepMeta[];
  onContinue: () => void;
  onReset: () => void;
}) {
  const metaById = new Map(steps.map((s) => [s.id, s]));
  const readyCount = report.steps.filter((s) => s.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{report.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {report.sheets_found.length} sheets found · {readyCount} of {report.steps.length} steps ready
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onReset}>Choose another file</Button>
          <Button onClick={onContinue} disabled={readyCount === 0}>Continue</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Step</th>
              <th className="px-3 py-2 text-left font-medium">Sheet</th>
              <th className="px-3 py-2 text-right font-medium">Rows</th>
              <th className="px-3 py-2 text-left font-medium">Missing</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.steps.map((s) => {
              const meta = metaById.get(s.step_id);
              const missing = [...s.missing_required_columns, ...s.missing_optional_columns];
              return (
                <tr key={s.step_id} className="border-t">
                  <td className="px-3 py-2">{meta?.display_name ?? s.step_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{meta?.sheet_name ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.row_count || '-'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {missing.length ? missing.join(', ') : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status === 'ready' ? 'success' : 'secondary'}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
