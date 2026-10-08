import reportTemplateService, {
  type ReportTemplate,
  type ReportTemplateSnapshot,
} from '../services/reportTemplateService';
import { CURRENT_VERSION } from '../components/VersionBadge';
import { mapWithConcurrency } from './concurrent';
import { validateXml } from './xml';

export const BACKUP_FORMAT = 'carmen.report-template-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** ฟิลด์ที่เก็บลงไฟล์ — ชุดเดียวกับ snapshot ฝั่ง backend (SNAPSHOT_FIELDS) */
export const BACKUP_FIELDS = [
  'name', 'name_i18n', 'description', 'description_i18n', 'report_group', 'template_type',
  'dialog', 'content', 'builder_key', 'view_name', 'source_type', 'source_name', 'source_params',
  'orientation', 'signature_config', 'is_standard', 'is_default', 'is_active',
  'allow_business_unit', 'deny_business_unit', 'calculation_methods',
] as const;

export type BackupTemplate = ReportTemplateSnapshot & { id?: string; version?: number };

export interface ReportTemplateBackup {
  format: typeof BACKUP_FORMAT;
  format_version: number;
  exported_at: string;
  source: { api_base_url?: string; app_version: string };
  templates: BackupTemplate[];
}

export function toBackupTemplate(
  src: Partial<ReportTemplate> & Record<string, unknown>,
  version?: number,
): BackupTemplate {
  const out: Record<string, unknown> = {};
  if (src.id) out.id = src.id;
  const v = version ?? (typeof src.doc_version === 'number' ? src.doc_version : undefined);
  if (v != null) out.version = v;
  for (const key of BACKUP_FIELDS) if (src[key] !== undefined) out[key] = src[key];
  return out as BackupTemplate;
}

export function buildBackup(templates: BackupTemplate[]): ReportTemplateBackup {
  return {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    source: { api_base_url: import.meta.env.REACT_APP_API_BASE_URL, app_version: CURRENT_VERSION },
    templates,
  };
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'template';

export function backupFileName(templates: BackupTemplate[], now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  if (templates.length === 1) {
    const t = templates[0];
    return `report-template_${slug(t.name ?? '')}_v${t.version ?? 0}_${date}.json`;
  }
  return `report-templates_${templates.length}_${date}.json`;
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** list endpoint ไม่คืน content — ต้อง getById ทีละตัว (พร้อมกันสูงสุด 4) */
export async function fetchFullTemplates(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: BackupTemplate[]; failed: number }> {
  const results: Array<BackupTemplate | undefined> = new Array(ids.length);
  let done = 0;
  let failed = 0;
  await mapWithConcurrency(
    ids,
    4,
    async (id) => {
      const res = await reportTemplateService.getById(id);
      return (res?.data ?? res) as ReportTemplate & Record<string, unknown>;
    },
    (_id, i, row, err) => {
      done += 1;
      if (err || !row) failed += 1;
      else results[i] = toBackupTemplate(row);
      onProgress?.(done, ids.length);
    },
  );
  return { ok: results.filter((r): r is BackupTemplate => !!r), failed };
}

export type BackupProblem =
  | 'missingName' | 'missingGroup' | 'missingXml' | 'badTemplateType'
  | 'badDialogXml' | 'badContentXml' | 'duplicateInFile';

export type ParseBackupResult =
  | { ok: true; entries: Array<{ index: number; template: BackupTemplate; problems: BackupProblem[] }> }
  | { ok: false; error: 'invalidJson' | 'wrongFormat' | 'newerFormat' | 'empty' };

export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const doc = raw as Partial<ReportTemplateBackup> | null;
  if (!doc || doc.format !== BACKUP_FORMAT || !Array.isArray(doc.templates)) return { ok: false, error: 'wrongFormat' };
  if (typeof doc.format_version !== 'number' || doc.format_version > BACKUP_FORMAT_VERSION) return { ok: false, error: 'newerFormat' };
  if (doc.templates.length === 0) return { ok: false, error: 'empty' };

  const seen = new Set<string>();
  const entries = doc.templates.map((tpl, index) => {
    const template = (tpl ?? {}) as BackupTemplate;
    const problems: BackupProblem[] = [];
    const name = (template.name_i18n?.en || template.name || '').trim();
    if (!name) problems.push('missingName');
    if (!template.report_group?.trim()) problems.push('missingGroup');
    // dialog/content ต้องเป็นสตริง — ว่างได้ (template บางตัวไม่มี dialog)
    if (typeof template.dialog !== 'string' || typeof template.content !== 'string') problems.push('missingXml');
    else {
      if (!validateXml(template.dialog).valid) problems.push('badDialogXml');
      if (!validateXml(template.content).valid) problems.push('badContentXml');
    }
    if (template.template_type && template.template_type !== 'form' && template.template_type !== 'list') {
      problems.push('badTemplateType');
    }
    if (name) {
      if (seen.has(name)) problems.push('duplicateInFile');
      seen.add(name);
    }
    return { index, template: { ...template, name }, problems };
  });
  return { ok: true, entries };
}
