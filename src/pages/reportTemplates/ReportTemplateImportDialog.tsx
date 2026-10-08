import React, { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import reportTemplateService, { type ReportTemplate } from '../../services/reportTemplateService';
import { parseBackup, MAX_BACKUP_BYTES, type BackupTemplate, type BackupProblem } from '../../utils/reportTemplateBackup';
import { pickLocalized, secondaryLocalized } from '../../utils/localized';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

type Status = 'new' | 'conflict' | 'invalid';
type Action = 'create' | 'overwrite' | 'skip';
type Outcome = 'created' | 'overwritten' | 'skipped' | 'failed';

interface Row {
  index: number;
  template: BackupTemplate;
  problems: BackupProblem[];
  status: Status;
  existingId?: string;
  action: Action;
  outcome?: Outcome;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** โหลดชื่อ template ทั้งหมดในระบบ (หน้าละ 100 ตาม cap) → Map<name, id> */
async function loadExistingNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const res: any = await reportTemplateService.getAll({ page, perpage: 100 });
    const inner = res.data?.data ?? res.data ?? res;
    const items: ReportTemplate[] = Array.isArray(inner) ? inner : (inner?.data ?? []);
    items.forEach((r) => map.set(r.name, r.id));
    const total = (inner?.paginate ?? res.data?.paginate ?? res.paginate)?.total ?? map.size;
    if (items.length === 0 || page * 100 >= total) break;
  }
  return map;
}

/** ตัด id/version ของไฟล์ทิ้ง — import ไม่ใช้ */
function payloadOf(tpl: BackupTemplate): Partial<ReportTemplate> {
  const { id: _id, version: _version, ...rest } = tpl;
  // backend ปฏิเสธ name_i18n ที่มี th แต่ไม่มี en — ให้ en = name เสมอ (parseBackup normalize name แล้ว)
  const name_i18n = rest.name_i18n ? { ...rest.name_i18n, en: rest.name } : undefined;
  return { ...rest, ...(name_i18n ? { name_i18n } : {}), change_type: 'import' };
}

export default function ReportTemplateImportDialog({ open, onOpenChange, onImported }: Props) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState(false);

  const running = progress !== null;

  const reset = () => {
    setRows(null);
    setFinished(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (next: boolean) => {
    if (running) return; // ปิดระหว่างนำเข้าไม่ได้
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error(t('pages.reportTemplates.importDialog.tooLarge'));
      return;
    }
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      toast.error(t(`pages.reportTemplates.importDialog.${parsed.error}` as TKey));
      return;
    }
    setChecking(true);
    try {
      const existing = await loadExistingNames();
      setRows(
        parsed.entries.map((e) => {
          const existingId = existing.get(e.template.name);
          const status: Status = e.problems.length ? 'invalid' : existingId ? 'conflict' : 'new';
          return { ...e, status, existingId, action: status === 'new' ? 'create' : 'skip' };
        }),
      );
    } catch (err: unknown) {
      toast.error(getErrorDetail(err, t));
    } finally {
      setChecking(false);
    }
  };

  const setAction = (index: number, action: Action) =>
    setRows((prev) => prev?.map((r) => (r.index === index ? { ...r, action } : r)) ?? null);

  const overwriteAll = () =>
    setRows((prev) => prev?.map((r) => (r.status === 'conflict' ? { ...r, action: 'overwrite' } : r)) ?? null);

  const todo = rows?.filter((r) => r.action !== 'skip') ?? [];

  const run = async () => {
    if (!rows) return;
    if (todo.length === 0) {
      toast.info(t('pages.reportTemplates.importDialog.nothingToDo'));
      return;
    }
    setProgress({ done: 0, total: todo.length });
    const next = [...rows];
    let done = 0;
    // ทีละรายการตามลำดับ — ลำดับเวอร์ชันอ่านง่าย และไม่ชน partial index ของ is_default
    for (const row of next) {
      if (row.action === 'skip') {
        row.outcome = 'skipped';
        continue;
      }
      try {
        if (row.action === 'create') {
          await reportTemplateService.create({ ...payloadOf(row.template), is_default: false });
          row.outcome = 'created';
        } else if (row.existingId) {
          const res = await reportTemplateService.getById(row.existingId);
          const current = (res?.data ?? res) as ReportTemplate;
          await reportTemplateService.update(row.existingId, {
            ...payloadOf(row.template),
            is_default: current.is_default,
            ...(current.doc_version != null ? { doc_version: current.doc_version } : {}),
          });
          row.outcome = 'overwritten';
        }
      } catch (err: unknown) {
        row.outcome = 'failed';
        row.error = getErrorDetail(err, t);
      }
      done += 1;
      setProgress({ done, total: todo.length });
      setRows([...next]);
    }
    setProgress(null);
    setFinished(true);

    const count = (o: Outcome) => next.filter((r) => r.outcome === o).length;
    const failed = count('failed');
    const succeeded = count('created') + count('overwritten');
    const summary = t('pages.reportTemplates.importDialog.summary', {
      created: count('created'), overwritten: count('overwritten'), skipped: count('skipped'), failed,
    });
    if (failed === 0) toast.success(summary);
    else if (succeeded === 0) toast.error(summary);
    else toast.warning(summary);
    if (succeeded > 0) onImported();
  };

  const statusBadge = (s: Status) => (
    <Badge variant={s === 'new' ? 'success' : s === 'conflict' ? 'secondary' : 'destructive'}>
      {t(`pages.reportTemplates.importDialog.status${s === 'new' ? 'New' : s === 'conflict' ? 'Conflict' : 'Invalid'}` as TKey)}
    </Badge>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pages.reportTemplates.importDialog.title')}</DialogTitle>
          <DialogDescription>{t('pages.reportTemplates.importDialog.description')}</DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="flex flex-col items-start gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้หลังเกิดข้อผิดพลาด
                handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={checking}>
              {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {checking ? t('pages.reportTemplates.importDialog.loadingExisting') : t('pages.reportTemplates.importDialog.pickFile')}
            </Button>
          </div>
        )}

        {rows && (
          <div className="space-y-3">
            {!finished && rows.some((r) => r.status === 'conflict') && (
              <Button variant="outline" size="sm" onClick={overwriteAll} disabled={running}>
                {t('pages.reportTemplates.importDialog.overwriteAll')}
              </Button>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colName')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colGroup')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colType')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colStatus')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const secondary = secondaryLocalized(r.template.name_i18n, lang);
                    return (
                      <tr key={r.index} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div>{pickLocalized(r.template.name_i18n, r.template.name, lang)}</div>
                          {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
                          {r.problems.map((p) => (
                            <div key={p} className="text-xs text-destructive">
                              {t(`pages.reportTemplates.importDialog.problem.${p}` as TKey)}
                            </div>
                          ))}
                          {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                        </td>
                        <td className="px-3 py-2">{r.template.report_group}</td>
                        <td className="px-3 py-2">{r.template.template_type ?? 'list'}</td>
                        <td className="px-3 py-2">{statusBadge(r.status)}</td>
                        <td className="px-3 py-2">
                          {r.outcome ? (
                            <span className={r.outcome === 'failed' ? 'text-destructive' : ''}>
                              {t(`pages.reportTemplates.importDialog.${
                                r.outcome === 'created' ? 'resultCreated'
                                : r.outcome === 'overwritten' ? 'resultOverwritten'
                                : r.outcome === 'failed' ? 'resultFailed' : 'actionSkip'}` as TKey)}
                            </span>
                          ) : r.status === 'conflict' ? (
                            <Select value={r.action} onValueChange={(v) => setAction(r.index, v as Action)} disabled={running}>
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="skip">{t('pages.reportTemplates.importDialog.actionSkip')}</SelectItem>
                                <SelectItem value="overwrite">{t('pages.reportTemplates.importDialog.actionOverwrite')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground">
                              {t(r.action === 'create' ? 'pages.reportTemplates.importDialog.actionCreate' : 'pages.reportTemplates.importDialog.actionSkip')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={running}>
            {t('common.cancel')}
          </Button>
          {rows && !finished && (
            <Button onClick={run} disabled={running || todo.length === 0}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {running
                ? t('pages.reportTemplates.importDialog.running', progress!)
                : t('pages.reportTemplates.importDialog.run', { count: todo.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
