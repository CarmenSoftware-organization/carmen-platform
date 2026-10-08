import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, FileText, Download, History, Loader2, Upload } from "lucide-react";
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
import { useRowActivityTrail } from '../components/activityTrail/useRowActivityTrail';
import { AUDIT_RECORDING_STARTED_ON_PHASE_2 } from '../components/activityTrail/constants';
import { PLATFORM_SCOPED_RECORD } from '../utils/permissions';
import { auditColumns } from '../components/auditColumns';
import { useI18n } from '../hooks/useI18n';
import { pickLocalized, secondaryLocalized, withPlainEn } from '../utils/localized';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';
import type { TKey } from '../i18n/types';
import { readStoredPerpage } from '../utils/pageRange';
import ReportTemplateImportDialog from './reportTemplates/ReportTemplateImportDialog';
import {
  CALCULATION_METHODS,
  CALCULATION_METHOD_KEYS,
  CalculationMethodBadges,
  buildCalculationMethodWhere,
  readCalculationMethodFilter,
  type CalculationMethodFilterValue,
} from './reportTemplates/calculationMethods';
import { fetchFullTemplates, buildBackup, backupFileName, downloadJSON } from '../utils/reportTemplateBackup';

/**
 * ค่า enum ของ API → คีย์ป้าย ผูกเป็นตารางตายตัวไม่ใช่ t(`...${v}`) เพราะชุดค่าปิดแล้ว
 * และการต่อสตริงเป็นคีย์จะทำให้คีย์ที่หายไปเงียบจนถึง runtime
 */
const SOURCE_TYPE_KEYS: Record<'view' | 'function' | 'procedure', TKey> = {
  view: 'pages.reportTemplates.sourceTypeView',
  function: 'pages.reportTemplates.sourceTypeFunction',
  procedure: 'pages.reportTemplates.sourceTypeProcedure',
};
const TEMPLATE_TYPE_KEYS: Record<'form' | 'list', TKey> = {
  form: 'pages.reportTemplates.templateTypeForm',
  list: 'pages.reportTemplates.templateTypeList',
};

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const ReportTemplateManagement: React.FC = () => {
  const navigate = useNavigate();
  const activityTrail = useRowActivityTrail();
  const { t, lang } = useI18n();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<ReportTemplate[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ done: number; total: number } | null>(null);

  const runBackup = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setBackupProgress({ done: 0, total: ids.length });
    try {
      const { ok, failed } = await fetchFullTemplates(ids, (done, total) => setBackupProgress({ done, total }));
      if (ok.length === 0) {
        toast.error(t('pages.reportTemplates.backup.failed'));
        return;
      }
      downloadJSON(buildBackup(ok), backupFileName(ok));
      if (failed > 0) toast.warning(t('pages.reportTemplates.backup.partial', { count: ok.length, failed }));
      else if (ok.length === 1) toast.success(t('pages.reportTemplates.backup.doneOne'));
      else toast.success(t('pages.reportTemplates.backup.done', { count: ok.length }));
    } finally {
      setBackupProgress(null);
    }
  }, [t]);

  const clearSelection = useCallback(() => {
    setSelectedTemplates([]);
    setSelectionResetKey((k) => k + 1);
  }, []);

  const storedSearch = localStorage.getItem('search_report_templates') || '';
  const storedFilters = getStoredJSON<string[]>('filters_report_templates', []);
  const storedSourceTypes = getStoredJSON<string[]>('filters_report_templates_source_type', []);
  const storedTemplateTypes = getStoredJSON<string[]>('filters_report_templates_template_type', []);
  const storedCalcMethods = readCalculationMethodFilter(
    getStoredJSON<unknown>('filters_report_templates_calculation_method', []),
  );
  const storedPage = Number(localStorage.getItem('page_report_templates')) || 1;
  // Bumped from `sort_report_templates` to force-reset users who had the old
  // `created_at:desc` default persisted; the new default is name ascending (A→Z).
  const storedSort = localStorage.getItem('sort_report_templates_v2') || 'name:asc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string[]>(storedSourceTypes);
  const [templateTypeFilter, setTemplateTypeFilter] = useState<string[]>(storedTemplateTypes);
  const [calcMethodFilter, setCalcMethodFilter] = useState<CalculationMethodFilterValue[]>(storedCalcMethods);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const buildAdvance = (
    filters: string[],
    sourceTypes: string[],
    templateTypes: string[],
    calcMethods: CalculationMethodFilterValue[],
  ) => {
    const where: Record<string, unknown> = {};
    if (filters.length === 1) {
      where.is_active = filters[0] === 'true';
    }
    if (sourceTypes.length === 1) {
      where.source_type = sourceTypes[0];
    } else if (sourceTypes.length > 1) {
      where.source_type = { in: sourceTypes };
    }
    if (templateTypes.length === 1) {
      where.template_type = templateTypes[0];
    } else if (templateTypes.length > 1) {
      where.template_type = { in: templateTypes };
    }
    const calcWhere = buildCalculationMethodWhere(calcMethods);
    if (calcWhere) Object.assign(where, calcWhere);
    where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: readStoredPerpage('perpage_report_templates', 10),
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters, storedSourceTypes, storedTemplateTypes, storedCalcMethods),
    filter: {},
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchTemplates = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const response: any = await reportTemplateService.getAll(params);
      setRawResponse(response);
      const inner = response.data?.data ?? response.data ?? response;
      const items = Array.isArray(inner) ? inner : (inner?.data ?? []);
      const pagInfo = inner?.paginate ?? response.data?.paginate ?? response.paginate;
      setTemplates(Array.isArray(items) ? items : []);
      setTotalRows(pagInfo?.total ?? items.length);
      setError('');
    } catch (err: unknown) {
      setError(t('pages.reportTemplates.loadFailed', { detail: getErrorDetail(err, t) }));
      devLog('Error fetching report templates:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTemplates(paginate);
  }, [fetchTemplates, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_report_templates', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_report_templates', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_report_templates', String(perpage));
    localStorage.setItem('page_report_templates', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_report_templates', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next, sourceTypeFilter, templateTypeFilter, calcMethodFilter), filter: {} }));
  };

  const handleSourceTypeFilter = (type: string) => {
    const next = sourceTypeFilter.includes(type)
      ? sourceTypeFilter.filter((s) => s !== type)
      : [...sourceTypeFilter, type];
    setSourceTypeFilter(next);
    localStorage.setItem('filters_report_templates_source_type', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next, templateTypeFilter, calcMethodFilter), filter: {} }));
  };

  const handleTemplateTypeFilter = (type: string) => {
    const next = templateTypeFilter.includes(type)
      ? templateTypeFilter.filter((s) => s !== type)
      : [...templateTypeFilter, type];
    setTemplateTypeFilter(next);
    localStorage.setItem('filters_report_templates_template_type', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, sourceTypeFilter, next, calcMethodFilter), filter: {} }));
  };

  const handleCalcMethodFilter = (value: CalculationMethodFilterValue) => {
    const next = calcMethodFilter.includes(value)
      ? calcMethodFilter.filter((s) => s !== value)
      : [...calcMethodFilter, value];
    setCalcMethodFilter(next);
    localStorage.setItem('filters_report_templates_calculation_method', JSON.stringify(next));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, sourceTypeFilter, templateTypeFilter, next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setSourceTypeFilter([]);
    setTemplateTypeFilter([]);
    setCalcMethodFilter([]);
    localStorage.setItem('filters_report_templates', JSON.stringify([]));
    localStorage.setItem('filters_report_templates_source_type', JSON.stringify([]));
    localStorage.setItem('filters_report_templates_template_type', JSON.stringify([]));
    localStorage.setItem('filters_report_templates_calculation_method', JSON.stringify([]));
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], [], [], []), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (sourceTypeFilter.length > 0 ? 1 : 0) + (templateTypeFilter.length > 0 ? 1 : 0) + (calcMethodFilter.length > 0 ? 1 : 0);

  const calcMethodLabel = (v: CalculationMethodFilterValue) =>
    v === 'restricted' ? t('pages.reportTemplates.calculationMethodRestricted') : t(CALCULATION_METHOD_KEYS[v]);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_report_templates_v2', sort);
    localStorage.setItem('page_report_templates', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await reportTemplateService.delete(deleteId);
      toast.success(t('toast.deleted', { entity: t('entity.reportTemplate.title') }));
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error(t('toast.deleteFailed', { entity: t('entity.reportTemplate.lower') }), {
        description: getErrorDetail(err, t),
      });
    }
  };

  const handleExport = () => {
    const rows = templates.map((tpl) => ({
      ...tpl,
      name_th: tpl.name_i18n?.th ?? '',
      description_th: tpl.description_i18n?.th ?? '',
      calculation_methods_csv: (tpl.calculation_methods ?? []).length
        ? CALCULATION_METHODS.filter((m) => tpl.calculation_methods?.includes(m)).map((m) => t(CALCULATION_METHOD_KEYS[m])).join(', ')
        : t('pages.reportTemplates.calculationMethodAll'),
      ...auditCsvFields(normalizeAudit(tpl)),
    }));
    const csv = generateCSV(rows, [
      { key: 'name', label: t('common.field.name') },
      { key: 'description', label: t('common.field.description') },
      { key: 'name_th', label: t('pages.reportTemplates.csvNameTh') },
      { key: 'description_th', label: t('pages.reportTemplates.csvDescriptionTh') },
      { key: 'report_group', label: t('pages.reportTemplates.columnReportGroup') },
      { key: 'calculation_methods_csv', label: t('pages.reportTemplates.columnCalculationMethod') },
      { key: 'is_standard', label: t('pages.reportTemplates.columnStandard') },
      { key: 'is_active', label: t('common.status.label') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `report-templates-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<ReportTemplate, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: t('common.field.name'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <Link
            to={`/report-templates/${row.original.id}/edit`}
            className="text-primary hover:underline whitespace-nowrap"
            title={row.original.name}
          >
            {pickLocalized(withPlainEn(row.original.name_i18n, row.original.name), row.original.name, lang)}
          </Link>
          {secondaryLocalized(withPlainEn(row.original.name_i18n, row.original.name), lang) && (
            <span className="text-xs text-muted-foreground">
              {secondaryLocalized(withPlainEn(row.original.name_i18n, row.original.name), lang)}
            </span>
          )}
          {pickLocalized(withPlainEn(row.original.description_i18n, row.original.description), row.original.description, lang) && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[320px]"
              title={pickLocalized(withPlainEn(row.original.description_i18n, row.original.description), row.original.description, lang)}
            >
              {pickLocalized(withPlainEn(row.original.description_i18n, row.original.description), row.original.description, lang)}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'template_type',
      header: t('pages.reportTemplates.columnTemplateType'),
      cell: ({ row }) => (
        <Badge variant="outline">{t(TEMPLATE_TYPE_KEYS[row.original.template_type ?? 'list'])}</Badge>
      ),
    },
    {
      accessorKey: 'report_group',
      header: t('pages.reportTemplates.columnReportGroup'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{row.original.report_group}</Badge>
          {row.original.template_type === 'form' && row.original.is_default && (
            <Badge variant="default">{t('common.label.default')}</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'calculation_methods',
      header: t('pages.reportTemplates.columnCalculationMethod'),
      enableSorting: false,
      cell: ({ row }) => <CalculationMethodBadges methods={row.original.calculation_methods} />,
    },
    {
      accessorKey: 'is_standard',
      header: t('pages.reportTemplates.columnStandard'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_standard ? 'default' : 'secondary'}>
          {row.original.is_standard ? t('pages.reportTemplates.standard') : t('common.option.custom')}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    ...auditColumns<ReportTemplate>({ t }),
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.action.rowActions', { name: row.original.name })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="report_template.update">
              <DropdownMenuItem onClick={() => navigate(`/report-templates/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="activity_log.read" clusterId={PLATFORM_SCOPED_RECORD}>
              {/* onSelect ไม่ใช่ onClick — ให้เมนูปิดเสร็จก่อนแผ่นเปิด ไม่งั้น focus trap
                  ของ Radix สองชั้นจะชนกัน */}
              <DropdownMenuItem
                onSelect={() => activityTrail.openFor(row.original.id)}
                className="cursor-pointer"
              >
                <History className="mr-2 h-4 w-4" />
                {t('pages.activityTrail.buttonLabel')}
              </DropdownMenuItem>
            </Can>
            <Can permission="report_template.read">
              <DropdownMenuItem onSelect={() => runBackup([row.original.id])} className="cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                {t('pages.reportTemplates.backup.download')}
              </DropdownMenuItem>
            </Can>
            <Can permission="report_template.delete">
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete, runBackup, t, lang, activityTrail]);

  // Selection is current-page only: discard whenever the result set changes.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, paginate.page, paginate.perpage, paginate.search, paginate.sort, paginate.advance]);

  const handleBackupAll = async () => {
    if (backupProgress) return;
    // ตั้ง busy ก่อนวนรวบ id — ปุ่มถูก disable และกดซ้ำไม่ได้ระหว่างรวบรายการ (total 0 = กำลังรวบรายการ)
    setBackupProgress({ done: 0, total: 0 });
    const ids: string[] = [];
    try {
      for (let page = 1; ; page += 1) {
        const res: any = await reportTemplateService.getAll({ ...paginate, page, perpage: 100 });
        const inner = res.data?.data ?? res.data ?? res;
        const items: ReportTemplate[] = Array.isArray(inner) ? inner : (inner?.data ?? []);
        ids.push(...items.map((r) => r.id));
        const total = (inner?.paginate ?? res.data?.paginate ?? res.paginate)?.total ?? ids.length;
        if (items.length === 0 || ids.length >= total) break;
      }
    } catch (err: unknown) {
      toast.error(`${t('pages.reportTemplates.backup.failed')}: ${getErrorDetail(err, t)}`);
      setBackupProgress(null);
      return;
    }
    if (ids.length === 0) {
      setBackupProgress(null);
      return;
    }
    await runBackup(ids);
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('breadcrumb.reportTemplates')}
          subtitle={t('pages.reportTemplates.subtitle')}
          actions={
            <>
              <Can permission="report_template.create">
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('pages.reportTemplates.importDialog.button')}
                </Button>
              </Can>
              <Can permission="report_template.read">
                <Button variant="outline" size="sm" onClick={handleBackupAll} disabled={!!backupProgress || loading || totalRows === 0}>
                  {backupProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {backupProgress
                    ? backupProgress.total === 0
                      ? t('pages.reportTemplates.backup.listing')
                      : t('pages.reportTemplates.backup.progress', backupProgress)
                    : t('pages.reportTemplates.backup.downloadAll')}
                </Button>
              </Can>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || templates.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="report_template.create">
                <Button onClick={() => navigate('/report-templates/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.reportTemplates.addTemplate')}</span>
                  <span className="sm:hidden">{t('common.action.add')}</span>
                </Button>
              </Can>
            </>
          }
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder={t('pages.reportTemplates.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    {t('common.label.filters')}
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>{t('common.label.filters')}</SheetTitle>
                    <SheetDescription>{t('pages.reportTemplates.filtersDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('common.status.label')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant={statusFilter.includes("true") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("true")}
                        >
                          {t('common.status.active')}
                        </Button>
                        <Button
                          variant={statusFilter.includes("false") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("false")}
                        >
                          {t('common.status.inactive')}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('pages.reportTemplates.sourceTypeLabel')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(['view', 'function', 'procedure'] as const).map((v) => (
                          <Button
                            key={v}
                            variant={sourceTypeFilter.includes(v) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleSourceTypeFilter(v)}
                          >
                            {t(SOURCE_TYPE_KEYS[v])}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('pages.reportTemplates.templateTypeLabel')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(['form', 'list'] as const).map((v) => (
                          <Button
                            key={v}
                            variant={templateTypeFilter.includes(v) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleTemplateTypeFilter(v)}
                          >
                            {t(TEMPLATE_TYPE_KEYS[v])}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('pages.reportTemplates.calculationMethodLabel')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {([...CALCULATION_METHODS, 'restricted'] as const).map((v) => (
                          <Button
                            key={v}
                            variant={calcMethodFilter.includes(v) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleCalcMethodFilter(v)}
                          >
                            {calcMethodLabel(v)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
                        {t('common.action.clearAllFilters')}
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {statusFilter.map((s) => (
                  <Badge key={`status-${s}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === "true" ? t('common.status.active') : t('common.status.inactive')}
                    <button
                      onClick={() => handleStatusFilter(s)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.reportTemplates.removeFilterAria', {
                        label: s === "true" ? t('common.status.active') : t('common.status.inactive'),
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {sourceTypeFilter.map((v) => (
                  <Badge key={`source-${v}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {t(SOURCE_TYPE_KEYS[v as keyof typeof SOURCE_TYPE_KEYS])}
                    <button
                      onClick={() => handleSourceTypeFilter(v)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.reportTemplates.removeFilterAria', {
                        label: t(SOURCE_TYPE_KEYS[v as keyof typeof SOURCE_TYPE_KEYS]),
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {templateTypeFilter.map((v) => (
                  <Badge key={`template-type-${v}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {t(TEMPLATE_TYPE_KEYS[v as keyof typeof TEMPLATE_TYPE_KEYS])}
                    <button
                      onClick={() => handleTemplateTypeFilter(v)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.reportTemplates.removeFilterAria', {
                        label: t(TEMPLATE_TYPE_KEYS[v as keyof typeof TEMPLATE_TYPE_KEYS]),
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {calcMethodFilter.map((v) => (
                  <Badge key={`calc-method-${v}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {calcMethodLabel(v)}
                    <button
                      onClick={() => handleCalcMethodFilter(v)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.reportTemplates.removeFilterAria', { label: calcMethodLabel(v) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {t('common.action.clearAll')}
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && templates.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={FileText}
                emptyTitle={t('pages.reportTemplates.emptyTitle')}
                emptyDescription={t('pages.reportTemplates.emptyDescription')}
                addAction={
                  <Can permission="report_template.create">
                    <Button size="sm" onClick={() => navigate('/report-templates/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.reportTemplates.addTemplate')}
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <>
              {selectedTemplates.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="text-sm font-medium">{t('common.state.nSelected', { count: selectedTemplates.length })}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!!backupProgress} onClick={() => runBackup(selectedTemplates.map((r) => r.id))}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('pages.reportTemplates.backup.downloadSelected', { count: selectedTemplates.length })}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearSelection}>{t('common.action.clear')}</Button>
                  </div>
                </div>
              )}
              <div className="relative">
                {loading && templates.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 2} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.reportTemplates.loadingAria')}>
                    <div className="text-muted-foreground">{t('pages.reportTemplates.loadingText')}</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={templates}
                  serverSide
                  tableLayout="auto"
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={handleSortChange}
                  defaultSort={{ id: 'name', desc: false }}
                  enableRowSelection
                  getRowId={(row) => row.id}
                  onSelectionChange={setSelectedTemplates}
                  selectionResetKey={selectionResetKey}
                  getRowSelectionLabel={(r) => r.name}
                />
                </>
                )}
              </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ReportTemplateImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => fetchTemplates(paginate)} />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={t('pages.reportTemplates.deleteTitle')}
        description={t('pages.reportTemplates.deleteDescription')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <ActivityTrailSheet

        entityType="report_template"

        recordingStartedOn={AUDIT_RECORDING_STARTED_ON_PHASE_2}

        {...activityTrail.sheetProps}

      />


      <DevDebugSheet title="API Response" endpoint="GET /api-system/report-templates" data={rawResponse} />
    </Layout>
  );
};

export default ReportTemplateManagement;
