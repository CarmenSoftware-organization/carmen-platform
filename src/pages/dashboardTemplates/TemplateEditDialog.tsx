import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import dashboardTemplateService from '../../services/dashboardTemplateService';
import { getErrorDetail } from '../../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useI18n } from '../../hooks/useI18n';
import { BusinessUnitMultiSelect } from '../../components/BusinessUnitMultiSelect';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { DashboardDatasetInfo, DashboardTemplate, DashboardTemplateKind } from '../../types';
import { toWireModule } from './modules';
import DatasetParamFields from './DatasetParamFields';

export interface TemplateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DashboardTemplateKind;
  module: string;
  template: DashboardTemplate | null;
  datasets: DashboardDatasetInfo[];
  byId: Map<string, DashboardDatasetInfo>;
  nextOrderIndex: number;
  onSaved: () => void;
}

export default function TemplateEditDialog({
  open, onOpenChange, kind, module, template, datasets, byId, nextOrderIndex, onSaved,
}: TemplateEditDialogProps) {
  const { t } = useI18n();
  const [datasetId, setDatasetId] = useState('');
  const [widgetType, setWidgetType] = useState('');
  const [title, setTitle] = useState('');
  const [params, setParams] = useState<Record<string, string | number>>({});
  const [isActive, setIsActive] = useState(true);
  const [allowBu, setAllowBu] = useState<string[]>([]);
  const [denyBu, setDenyBu] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset ทุกครั้งที่เปิด — ค่าเริ่มมาจาก template ที่กำลังแก้ (ถ้ามี)
  useEffect(() => {
    if (!open) return;
    setDatasetId(template?.dataset_id ?? '');
    setWidgetType(template?.widget_type ?? '');
    setTitle(template?.title ?? '');
    setParams(template?.params ?? {});
    setIsActive(template?.is_active ?? true);
    setAllowBu(template?.allow_business_unit ?? []);
    setDenyBu(template?.deny_business_unit ?? []);
    setSaving(false);
    setError(null);
  }, [open, template]);

  const sortedDatasets = useMemo(
    () => [...datasets].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [datasets],
  );
  const dataset = datasetId ? byId.get(datasetId) : undefined;
  const renders = dataset?.supported_renders ?? [];

  const handleDatasetChange = (id: string) => {
    const ds = byId.get(id);
    const supported = ds?.supported_renders ?? [];
    setDatasetId(id);
    // widget type ที่ dataset ใหม่ไม่รองรับ → backend 422 จึงรีเซ็ตเป็นตัวแรกที่รองรับ
    setWidgetType((cur) => (supported.includes(cur) ? cur : supported[0] ?? ''));
    setParams(Object.fromEntries(
      (ds?.params ?? []).filter((p) => p.default !== undefined).map((p) => [p.name, p.default as string | number]),
    ));
  };

  const handleSave = async () => {
    if (!datasetId || !widgetType) return;
    setSaving(true);
    setError(null);
    const common = {
      dataset_id: datasetId,
      widget_type: widgetType,
      title: title.trim() || null,
      params: Object.keys(params).length ? params : null,
      is_active: isActive,
      ...(kind === 'system'
        ? { allow_business_unit: allowBu.length ? allowBu : null, deny_business_unit: denyBu.length ? denyBu : null }
        : {}),
    };
    try {
      if (template) {
        await dashboardTemplateService.update(template.id, {
          ...common,
          ...(template.doc_version != null ? { doc_version: template.doc_version } : {}),
        });
        toast.success(t('toast.saved'));
      } else {
        await dashboardTemplateService.create({
          ...common, kind, module: toWireModule(module), order_index: nextOrderIndex,
        });
        toast.success(t('toast.created', { entity: t('entity.dashboardTemplate.title') }));
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        onSaved();
        onOpenChange(false);
        return;
      }
      setError(t('pages.dashboardTemplates.saveFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t(template ? 'pages.dashboardTemplates.dialogEditTitle' : 'pages.dashboardTemplates.dialogCreateTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dt-dataset">{t('pages.dashboardTemplates.fieldDataset')}</Label>
            <Select value={datasetId || undefined} onValueChange={handleDatasetChange} disabled={saving}>
              <SelectTrigger id="dt-dataset">
                <SelectValue placeholder={t('pages.dashboardTemplates.fieldDatasetPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sortedDatasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} · {d.shape}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dt-widget-type">{t('pages.dashboardTemplates.fieldWidgetType')}</Label>
            <Select value={widgetType || undefined} onValueChange={setWidgetType} disabled={saving || !dataset}>
              <SelectTrigger id="dt-widget-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {renders.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dt-title">{t('pages.dashboardTemplates.fieldTitle')}</Label>
            <Input
              id="dt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('pages.dashboardTemplates.fieldTitlePlaceholder')}
              disabled={saving}
            />
          </div>

          {dataset && dataset.params.length > 0 && (
            <div className="space-y-2">
              <Label>{t('pages.dashboardTemplates.fieldParams')}</Label>
              <DatasetParamFields params={dataset.params} value={params} onChange={setParams} disabled={saving} />
            </div>
          )}

          {kind === 'system' && (
            <>
              <div className="space-y-2">
                <Label>{t('pages.dashboardTemplates.fieldAllowBu')}</Label>
                <p className="text-xs text-muted-foreground">{t('pages.dashboardTemplates.fieldAllowBuHint')}</p>
                <BusinessUnitMultiSelect keyBy="code" value={allowBu} onChange={setAllowBu} disabled={saving} />
              </div>
              <div className="space-y-2">
                <Label>{t('pages.dashboardTemplates.fieldDenyBu')}</Label>
                <BusinessUnitMultiSelect keyBy="code" value={denyBu} onChange={setDenyBu} disabled={saving} />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dt-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="dt-active">{t('pages.dashboardTemplates.fieldActive')}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !datasetId || !widgetType}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
