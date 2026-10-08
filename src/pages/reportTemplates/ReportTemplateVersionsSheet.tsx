import React, { useMemo, useState } from 'react';
import { ChevronDown, Download, GitCompare, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Tooltip } from '../../components/ui/tooltip';
import { EmptyState } from '../../components/EmptyState';
import { AuditMeta } from '../../components/AuditMeta';
import { TabStrip } from '../../components/TabStrip';
import { XmlDiffView } from '../../components/XmlDiffView';
import Can from '../../components/Can';
import reportTemplateService, {
  type ReportTemplate,
  type ReportTemplateVersionSummary,
  type ReportTemplateSnapshot,
} from '../../services/reportTemplateService';
import { normalizeAudit } from '../../utils/audit';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail } from '../../utils/errorParser';
import { countLines } from '../../utils/xml';
import { buildBackup, backupFileName, downloadJSON, toBackupTemplate } from '../../utils/reportTemplateBackup';
import { useI18n } from '../../hooks/useI18n';
import { cn } from '../../lib/utils';
import { useReportTemplateVersions } from './useReportTemplateVersions';

interface Props {
  templateId: string;
  /** แถวล่าสุดที่บันทึกแล้ว (templateRecord) — ใช้เทียบ diff */
  current: ReportTemplate;
  docVersion?: number;
  /** หน้าแม่อยู่ในโหมดแก้ไข → ปิดปุ่มกู้คืน */
  editing: boolean;
  onRestored: () => Promise<void> | void;
}

/** ฟิลด์ scalar ที่แสดงในรายการ "ต่างจากปัจจุบัน" (XML ไปอยู่ใน diff แยก) */
const SCALAR_FIELDS: Array<{ key: string; read: (s: Partial<ReportTemplateSnapshot>) => unknown }> = [
  // EN = คอลัมน์เดิม (ค่าจริง) ก่อน *_i18n.en — ตรงกับที่หน้าแก้ไขอ่าน
  { key: 'name', read: (s) => s.name || s.name_i18n?.en || '' },
  { key: 'name.th', read: (s) => s.name_i18n?.th ?? '' },
  { key: 'description', read: (s) => s.description ?? s.description_i18n?.en ?? '' },
  { key: 'description.th', read: (s) => s.description_i18n?.th ?? '' },
  { key: 'report_group', read: (s) => s.report_group },
  { key: 'template_type', read: (s) => s.template_type },
  { key: 'is_active', read: (s) => s.is_active },
  { key: 'is_standard', read: (s) => s.is_standard },
  { key: 'builder_key', read: (s) => s.builder_key ?? '' },
  { key: 'source_type', read: (s) => s.source_type },
  { key: 'source_name', read: (s) => s.source_name ?? '' },
  { key: 'source_params', read: (s) => JSON.stringify(s.source_params ?? {}) },
  { key: 'orientation', read: (s) => s.orientation },
  { key: 'allow_business_unit', read: (s) => JSON.stringify(s.allow_business_unit ?? null) },
  { key: 'deny_business_unit', read: (s) => JSON.stringify(s.deny_business_unit ?? null) },
  // snapshot ก่อนมีฟิลด์นี้ = undefined — restore คงค่าปัจจุบัน จึงไม่นับเป็นความต่าง (ดู filter ใน changes)
  {
    key: 'calculation_methods',
    read: (s) => (s.calculation_methods === undefined ? undefined : [...s.calculation_methods].sort().join(', ')),
  },
];

const fmt = (v: unknown) => (v === '' || v == null ? '—' : String(v));

export const ReportTemplateVersionsSheet: React.FC<Props> = ({ templateId, current, docVersion, editing, onRestored }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [xmlTab, setXmlTab] = useState<'dialog' | 'content'>('content');
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  // hook probe ให้เองครั้งเดียวตอน mount (รู้ `unsupported` ก่อนผู้ใช้เปิด) แล้วโหลดใหม่ทุกครั้งที่เปิดแผ่น
  const v = useReportTemplateVersions(templateId, open);

  const changeLabel = (row: ReportTemplateVersionSummary) =>
    row.change_type === 'restore'
      ? t('pages.reportTemplates.versions.changeRestore', { from: row.restored_from_version ?? '?' })
      : t(row.change_type === 'create' ? 'pages.reportTemplates.versions.changeCreate'
        : row.change_type === 'import' ? 'pages.reportTemplates.versions.changeImport'
        : 'pages.reportTemplates.versions.changeUpdate');

  const toggle = (version: number) => {
    if (expanded === version) {
      setExpanded(null);
      return;
    }
    setExpanded(version);
    v.loadDetail(version); // cache ในตัว — กางซ้ำไม่ยิงใหม่
  };

  const restore = async () => {
    if (confirmVersion == null || docVersion == null) return;
    try {
      await reportTemplateService.restoreVersion(templateId, confirmVersion, docVersion);
      toast.success(t('pages.reportTemplates.versions.restored', { version: confirmVersion }));
      setConfirmVersion(null);
      setExpanded(null);
      await onRestored();
      v.reload();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        setConfirmVersion(null);
        notifyVersionConflict(t);
        await onRestored();
        v.reload();
      } else {
        toast.error(getErrorDetail(err, t));
      }
    }
  };

  const nextVersion = (docVersion ?? 0) + 1;

  if (v.unsupported) return null; // backend ยังไม่ขึ้น — ซ่อนทั้งปุ่ม

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitCompare className="mr-2 h-4 w-4" />
        {t('pages.reportTemplates.versions.button')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{t('pages.reportTemplates.versions.title')}</SheetTitle>
            <SheetDescription>{t('pages.reportTemplates.versions.description')}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {v.error && (
              <p className="text-destructive text-sm">{t('pages.reportTemplates.versions.loadError')} — {v.error}</p>
            )}
            {v.loading && v.versions.length === 0 && <Skeleton className="h-24 w-full" />}
            {!v.loading && !v.error && v.versions.length === 0 && (
              <EmptyState
                icon={GitCompare}
                title={t('pages.reportTemplates.versions.empty')}
                description={t('pages.reportTemplates.versions.emptyDescription')}
              />
            )}

            {v.versions.length > 0 && (
              <div>
                {v.versions.map((row) => {
                  const isCurrent = row.version === docVersion;
                  const detail = v.details[row.version];
                  const detailError = v.detailError[row.version];
                  const isOpen = expanded === row.version;
                  return (
                    <div key={row.version} className="border-border border-b last:border-b-0">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(row.version)}
                        className="focus-visible:ring-ring flex w-full items-center gap-3 py-3 text-left focus-visible:ring-1 focus-visible:outline-hidden"
                      >
                        <span className="font-mono text-sm font-medium">v{row.version}</span>
                        <Badge variant="outline">{changeLabel(row)}</Badge>
                        {isCurrent && <Badge variant="secondary">{t('pages.reportTemplates.versions.current')}</Badge>}
                        <span className="min-w-0 flex-1">
                          <AuditMeta
                            variant="compact"
                            actor={normalizeAudit(row).created}
                            className="text-muted-foreground text-xs"
                          />
                        </span>
                        <ChevronDown
                          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                        />
                      </button>

                      {isOpen && (
                        <div className="space-y-4 pb-4">
                          {detailError && !detail ? (
                            <p className="text-destructive text-sm">{detailError}</p>
                          ) : v.detailLoading[row.version] || !detail ? (
                            <Skeleton className="h-40 w-full" />
                          ) : (
                            <VersionDetail snapshot={detail.snapshot} current={current} xmlTab={xmlTab} onXmlTab={setXmlTab} />
                          )}
                          {detail && (
                            <div className="flex flex-wrap gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const tpl = toBackupTemplate({ ...detail.snapshot, id: templateId }, row.version);
                                  downloadJSON(buildBackup([tpl]), backupFileName([tpl]));
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                {t('pages.reportTemplates.versions.download')}
                              </Button>
                              {/* restoreVersion ต้องมี doc_version — ไม่มีก็ไม่ให้กู้ (ส่งไปก็ 400/409) */}
                              {!isCurrent && docVersion != null && (
                                <Can permission="report_template.update">
                                  {editing ? (
                                    <Tooltip content={t('pages.reportTemplates.versions.restoreBlocked')}>
                                      {/* wrapper โฟกัสได้ ให้คีย์บอร์ดเห็น tooltip ของปุ่ม disabled (แบบเดียวกับ TenantMigrationCard) */}
                                      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                                      <span tabIndex={0} className="inline-flex">
                                        <Button size="sm" disabled>
                                          <RotateCcw className="mr-2 h-4 w-4" />
                                          {t('pages.reportTemplates.versions.restore')}
                                        </Button>
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <Button size="sm" onClick={() => setConfirmVersion(row.version)}>
                                      <RotateCcw className="mr-2 h-4 w-4" />
                                      {t('pages.reportTemplates.versions.restore')}
                                    </Button>
                                  )}
                                </Can>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmVersion !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmVersion(null);
        }}
        title={t('pages.reportTemplates.versions.restoreTitle', { version: confirmVersion ?? '' })}
        description={t('pages.reportTemplates.versions.restoreDescription', { version: confirmVersion ?? '', next: nextVersion })}
        confirmText={t('pages.reportTemplates.versions.restore')}
        onConfirm={restore}
      />
    </>
  );
};

const VersionDetail: React.FC<{
  snapshot: ReportTemplateSnapshot;
  current: ReportTemplate;
  xmlTab: 'dialog' | 'content';
  onXmlTab: (tab: 'dialog' | 'content') => void;
}> = ({ snapshot, current, xmlTab, onXmlTab }) => {
  const { t } = useI18n();
  const changes = useMemo(
    () =>
      SCALAR_FIELDS.map((f) => ({ key: f.key, from: f.read(snapshot), to: f.read(current) })).filter(
        (c) => fmt(c.from) !== fmt(c.to) && !(c.key === 'calculation_methods' && c.from === undefined),
      ),
    [snapshot, current],
  );
  const dialogChanged = (snapshot.dialog ?? '') !== (current.dialog ?? '');
  const contentChanged = (snapshot.content ?? '') !== (current.content ?? '');
  const lineDelta = (a: string, b: string) => Math.abs(countLines(a) - countLines(b));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs font-medium">{t('pages.reportTemplates.versions.changedFields')}</div>
        {changes.length === 0 ? (
          <div className="text-muted-foreground text-xs">{t('pages.reportTemplates.versions.noFieldChanges')}</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {changes.map((c) => (
              <li key={c.key} className="break-all">
                <span className="font-mono">{c.key}</span>: {fmt(c.from)} → {fmt(c.to)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <TabStrip
        tabs={[
          {
            id: 'dialog',
            label: t('pages.reportTemplates.dialogXmlTab'),
            count: dialogChanged ? lineDelta(snapshot.dialog ?? '', current.dialog ?? '') : undefined,
          },
          {
            id: 'content',
            label: t('pages.reportTemplates.contentXmlTab'),
            count: contentChanged ? lineDelta(snapshot.content ?? '', current.content ?? '') : undefined,
          },
        ]}
        value={xmlTab}
        onChange={onXmlTab}
      />
      {xmlTab === 'dialog' ? (
        <XmlDiffView original={snapshot.dialog ?? ''} current={current.dialog ?? ''} />
      ) : (
        <XmlDiffView original={snapshot.content ?? ''} current={current.content ?? ''} />
      )}
    </div>
  );
};
