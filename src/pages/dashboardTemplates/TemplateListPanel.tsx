import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Languages, LayoutDashboard, Pencil, Plus, Trash2 } from 'lucide-react';
import dashboardTemplateService from '../../services/dashboardTemplateService';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { PLATFORM_SCOPED_RECORD } from '../../utils/permissions';
import Can from '../../components/Can';
import { ListEmptyState } from '../../components/ListEmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { DashboardTemplate, DashboardTemplateKind } from '../../types';
import { DASHBOARD_MODULES, MAIN_MODULE, MODULE_LABEL_KEY } from './modules';
import { moveItem } from './reorderItems';
import { widgetIcon } from './widgetTypes';
import { useDashboardDatasets } from './useDashboardDatasets';
import TemplateEditDialog from './TemplateEditDialog';

/** ชื่อ EN ใช้ title_i18n ก่อน แล้วถอยไป title รุ่นเก่า; ไม่มีทั้งคู่ = widget ใช้ชื่อ dataset */
const titleParts = (row: DashboardTemplate) => ({
  en: row.title_i18n?.en || row.title || '',
  th: row.title_i18n?.th || '',
});

export default function TemplateListPanel({ kind }: { kind: DashboardTemplateKind }) {
  const { t, lang } = useI18n();
  const { datasets, byId, loading: datasetsLoading, failed: datasetsFailed } = useDashboardDatasets();
  const modules = kind === 'bu_default' ? [MAIN_MODULE, ...DASHBOARD_MODULES] : [...DASHBOARD_MODULES];
  const [module, setModule] = useState<string>(kind === 'bu_default' ? MAIN_MODULE : 'procurement');
  const [items, setItems] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DashboardTemplate | 'new' | null>(null);
  const [version, setVersion] = useState<number | null>(null);

  // เฉพาะคำขอล่าสุดเท่านั้นที่เขียน state — สลับ module เร็ว ๆ แล้วคำตอบเก่าที่ช้ากว่าห้ามทับ
  const requestId = useRef(0);
  const moduleRef = useRef(module);
  moduleRef.current = module;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const rows = await dashboardTemplateService.list(kind, module);
      if (id !== requestId.current) return;
      setItems([...rows].sort((a, b) => a.order_index - b.order_index));
      if (kind === 'bu_default') {
        const v = await dashboardTemplateService.version();
        if (id !== requestId.current) return;
        setVersion(v);
      }
    } catch (err) {
      if (id !== requestId.current) return;
      toast.error(t('pages.dashboardTemplates.loadFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [kind, module, t]);
  useEffect(() => { void load(); }, [load]);

  const handleMove = async (index: number, dir: -1 | 1) => {
    const payload = moveItem(items, index, dir);
    if (payload.length === 0) return;
    setBusy(true);
    try {
      await dashboardTemplateService.reorder(kind, module, payload);
      // ผู้ใช้อาจสลับ module ระหว่างรอ — อย่า refresh ด้วย module เก่าทับรายการใหม่
      if (moduleRef.current === module) await load();
    } catch (err) {
      toast.error(t('pages.dashboardTemplates.reorderFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await dashboardTemplateService.remove(deleteId);
      toast.success(t('toast.deleted', { entity: t('entity.dashboardTemplate.title') }));
      setDeleteId(null);
      await load();
    } catch (err) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.dashboardTemplate.lower') }), {
        description: getErrorDetail(err, t),
      });
    }
  };

  const thCoverage = useMemo(() => {
    const titled = items.filter((it) => titleParts(it).en);
    return { done: titled.filter((it) => titleParts(it).th).length, total: titled.length };
  }, [items]);

  const nextOrderIndex = items.reduce((max, it) => Math.max(max, it.order_index), 0) + 10;

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="dt-module">{t('pages.dashboardTemplates.moduleLabel')}</Label>
                <Select value={module} onValueChange={setModule}>
                  <SelectTrigger id="dt-module" className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m} value={m}>{t(MODULE_LABEL_KEY[m])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {kind === 'bu_default' && version !== null && (
                <Badge variant="outline">{t('pages.dashboardTemplates.versionBadge', { version })}</Badge>
              )}
              {thCoverage.total > 0 && (
                <Badge
                  variant={thCoverage.done === thCoverage.total ? 'outline' : 'warning'}
                  className="gap-1"
                >
                  <Languages className="h-3 w-3" aria-hidden />
                  {t('pages.dashboardTemplates.thCoverage', thCoverage)}
                </Badge>
              )}
            </div>
            <Can permission="dashboard_template.create" clusterId={PLATFORM_SCOPED_RECORD}>
              <Button onClick={() => setEditing('new')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('pages.dashboardTemplates.addWidget')}
              </Button>
            </Can>
          </div>

          {loading && items.length === 0 ? (
            <TableSkeleton columns={kind === 'system' ? 6 : 5} />
          ) : items.length === 0 ? (
            <ListEmptyState
              searchTerm=""
              activeFilterCount={0}
              icon={LayoutDashboard}
              emptyTitle={t('pages.dashboardTemplates.empty')}
              emptyDescription=""
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('pages.dashboardTemplates.columnTitle')}</th>
                    <th className="px-3 py-2 font-medium">{t('pages.dashboardTemplates.columnDataset')}</th>
                    <th className="px-3 py-2 font-medium">{t('pages.dashboardTemplates.columnType')}</th>
                    {kind === 'system' && (
                      <th className="px-3 py-2 font-medium">{t('pages.dashboardTemplates.columnScope')}</th>
                    )}
                    <th className="px-3 py-2 font-medium">{t('pages.dashboardTemplates.columnStatus')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => {
                    const { en, th } = titleParts(row);
                    const ds = byId.get(row.dataset_id);
                    const primary = lang === 'th' ? th || en : en;
                    // บรรทัดรอง = อีกภาษาหนึ่ง ให้เห็นคำแปลคู่กันโดยไม่ต้องสลับภาษา UI
                    const secondary = lang === 'th' ? (th ? en : '') : th;
                    const Icon = widgetIcon(row.widget_type);
                    const allow = row.allow_business_unit ?? [];
                    const deny = row.deny_business_unit ?? [];
                    return (
                      <tr key={row.id} className={`border-b align-top last:border-0 ${row.is_active ? '' : 'text-muted-foreground'}`}>
                        <td className="px-3 py-2.5">
                          {primary ? (
                            <div className="font-medium">{primary}</div>
                          ) : (
                            <div>
                              {ds?.name ?? row.dataset_id}
                              <span className="ml-2 text-xs text-muted-foreground">({t('pages.dashboardTemplates.titleDefault')})</span>
                            </div>
                          )}
                          {primary && (secondary ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              <span className="mr-1.5 font-mono text-[10px] uppercase">{lang === 'th' ? 'en' : 'th'}</span>
                              {secondary}
                            </div>
                          ) : !th && (
                            <div className="mt-0.5 text-xs italic text-muted-foreground">{t('pages.dashboardTemplates.thMissing')}</div>
                          ))}
                        </td>
                        <td className="px-3 py-2.5">
                          {ds && <div>{ds.name}</div>}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{row.dataset_id}</span>
                            {!datasetsLoading && !datasetsFailed && !ds && (
                              <Badge variant="destructive">{t('pages.dashboardTemplates.datasetMissing')}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                            {row.widget_type}
                          </span>
                        </td>
                        {kind === 'system' && (
                          <td className="px-3 py-2.5">
                            {allow.length === 0 && deny.length === 0 ? (
                              <span className="text-muted-foreground">{t('pages.dashboardTemplates.scopeAll')}</span>
                            ) : (
                              <div className="space-y-0.5">
                                {allow.length > 0 && (
                                  <div title={allow.join(', ')}>{t('pages.dashboardTemplates.scopeOnly', { count: allow.length })}</div>
                                )}
                                {deny.length > 0 && (
                                  <div title={deny.join(', ')}>{t('pages.dashboardTemplates.scopeHidden', { count: deny.length })}</div>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <Badge variant={row.is_active ? 'success' : 'secondary'}>
                            {t(row.is_active ? 'common.status.active' : 'common.status.inactive')}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex justify-end gap-1">
                            <Can permission="dashboard_template.update" clusterId={PLATFORM_SCOPED_RECORD}>
                              <Button
                                variant="ghost" size="icon" disabled={busy || loading || i === 0}
                                aria-label={t('pages.dashboardTemplates.moveUp')}
                                onClick={() => handleMove(i, -1)}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" disabled={busy || loading || i === items.length - 1}
                                aria-label={t('pages.dashboardTemplates.moveDown')}
                                onClick={() => handleMove(i, 1)}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" disabled={loading}
                                aria-label={t('common.action.edit')}
                                onClick={() => setEditing(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Can>
                            <Can permission="dashboard_template.delete" clusterId={PLATFORM_SCOPED_RECORD}>
                              <Button
                                variant="ghost" size="icon" disabled={loading}
                                aria-label={t('common.action.delete')}
                                onClick={() => setDeleteId(row.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={t('pages.dashboardTemplates.deleteTitle')}
        description={t('pages.dashboardTemplates.deleteDescription')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <TemplateEditDialog
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        kind={kind}
        module={module}
        template={editing !== null && editing !== 'new' ? editing : null}
        datasets={datasets}
        byId={byId}
        nextOrderIndex={nextOrderIndex}
        onSaved={() => { setEditing(null); void load(); }}
      />
    </>
  );
}
