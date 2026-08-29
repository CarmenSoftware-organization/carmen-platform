import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PreconfigCheckReport, PreconfigStepMeta } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

// เก็บ TKey ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้
const STATUS_LABEL: Record<PreconfigCheckReport['steps'][number]['status'], TKey> = {
  ready: 'pages.tenantImport.statusReady',
  sheet_missing: 'pages.tenantImport.statusSheetMissing',
  columns_missing: 'pages.tenantImport.statusColumnsMissing',
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
  const { t } = useI18n();
  const metaById = new Map(steps.map((s) => [s.id, s]));
  const readyCount = report.steps.filter((s) => s.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{report.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {t('pages.tenantImport.fileSummary', {
              sheets: report.sheets_found.length,
              ready: readyCount,
              total: report.steps.length,
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onReset}>{t('pages.tenantImport.chooseAnotherFile')}</Button>
          <Button onClick={onContinue} disabled={readyCount === 0}>{t('pages.tenantImport.continueAction')}</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm [&_th]:whitespace-nowrap">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('pages.tenantImport.columnStep')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.tenantImport.columnSheet')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('pages.tenantImport.columnRows')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.tenantImport.columnMissing')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('common.status.label')}</th>
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
                      {t(STATUS_LABEL[s.status])}
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
