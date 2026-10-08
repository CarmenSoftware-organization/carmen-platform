import React, { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import reportTemplateService, { type ReportTemplate } from '../../services/reportTemplateService';
import { parseBackup, MAX_BACKUP_BYTES, type BackupTemplate, type BackupProblem } from '../../utils/reportTemplateBackup';
import { pickLocalized, secondaryLocalized, withPlainEn } from '../../utils/localized';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { useAuth } from '../../context/AuthContext';
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

/**
 * แปลงแถวในไฟล์ backup เป็น payload ของ create/update
 * - ตัด id/version (import ไม่ใช้) และ view_name (DTO ไม่รับ — gateway strip ทิ้งอยู่แล้ว แต่ไม่ส่งเลยดีกว่า)
 * - name_i18n null = ไม่มี → ไม่ส่ง; ถ้ามีให้ en = name เสมอ (backend ปฏิเสธ th ที่ไม่มี en; parseBackup normalize name แล้ว)
 * - description เดี่ยวคือค่าจริงของ EN: ประกอบ description_i18n จาก description + th ของไฟล์
 *   เพื่อไม่ให้ description_i18n: null ไปล้าง description ที่มีค่าอยู่
 * - source_params / signature_config ที่ seeder ของ micro-report เก็บเป็น {} → เติม params/blocks เป็น []
 */
function payloadOf(tpl: BackupTemplate): Partial<ReportTemplate> {
  const {
    id: _id, version: _version, view_name: _viewName,
    name_i18n, description_i18n, source_params, signature_config, ...rest
  } = tpl;
  const out: Partial<ReportTemplate> = { ...rest, change_type: 'import' };

  if (name_i18n) out.name_i18n = { ...name_i18n, en: rest.name };

  const description = rest.description as string | null | undefined;
  if (description !== undefined) {
    const { en: _staleEn, ...others } = description_i18n ?? {};
    const merged = { ...others, ...(description?.trim() ? { en: description } : {}) };
    out.description_i18n = Object.keys(merged).length ? merged : null;
  } else if (description_i18n !== undefined) {
    out.description_i18n = description_i18n;
  }

  out.source_params = Array.isArray(source_params?.params) ? source_params : { ...source_params, params: [] };
  out.signature_config = Array.isArray(signature_config?.blocks)
    ? signature_config
    : { ...signature_config, blocks: [] };
  return out;
}

export default function ReportTemplateImportDialog({ open, onOpenChange, onImported }: Props) {
  const { t, lang } = useI18n();
  const { hasPermission } = useAuth();
  // เขียนทับ = update — ผู้ที่มีแค่ report_template.create ทำได้แค่สร้าง/ข้าม
  const canOverwrite = hasPermission('report_template.update');
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
    // ปิดระหว่างนำเข้า หรือระหว่างโหลดชื่อเดิม (setRows ที่มาช้าจะทิ้งพรีวิวค้างไว้) ไม่ได้
    if (running || checking) return;
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
            {!finished && canOverwrite && rows.some((r) => r.status === 'conflict') && (
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
                    const nameI18n = withPlainEn(r.template.name_i18n, r.template.name);
                    const secondary = secondaryLocalized(nameI18n, lang);
                    return (
                      <tr key={r.index} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div>{pickLocalized(nameI18n, r.template.name, lang)}</div>
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
                          ) : r.status === 'conflict' && canOverwrite ? (
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
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={running || checking}>
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
