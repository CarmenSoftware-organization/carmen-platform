// src/pages/TenantSeedManagement.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import businessUnitService from '../services/businessUnitService';
import tenantSeedService from '../services/tenantSeedService';
import { getErrorDetail } from '../utils/errorParser';
import { handleSeedError } from '../utils/seedError';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { mapWithConcurrency } from '../utils/concurrent';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Tooltip } from '../components/ui/tooltip';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { SearchInput } from '../components/SearchInput';
import { withTooltip } from './TenantMigrationManagement';
import { SeedFleetSummary } from './tenantSeed/SeedFleetSummary';
import { SeedSetPickerDialog, type SeedSetOption } from './tenantSeed/SeedSetPickerDialog';
import {
  type SeedRowState,
  type SeedRowStatus,
  hasDb,
  missingCount,
  pickMissing,
  seedRowStatusOf,
  SEED_STATUS_RANK,
  summarizeFleet,
  nowTime,
} from './tenantSeed/seedRowState';
import { Download, Database, RefreshCw, Loader2, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import type { BusinessUnit, SeedDeploySummary, SeedProgressEvent } from '../types';
import { useI18n } from '../hooks/useI18n';

interface SeedBatch {
  index: number;
  total: number;
  buId: string | null;
  buCode: string | null;
}

// Icon-only row action; same contract as TenantMigrationManagement's iconAction
// (aria-label = label, tooltip falls back to the disabled reason, focusable span
// around a disabled button so the tooltip still fires).
const iconAction = ({
  label,
  icon,
  onClick,
  disabled,
  reason,
  variant = 'outline',
}: {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  disabled: boolean;
  reason: string | null;
  variant?: 'outline' | 'default';
}): ReactElement => {
  const btn = (
    <Button variant={variant} size="icon" className="h-8 w-8" aria-label={label} onClick={onClick} disabled={disabled}>
      {icon}
    </Button>
  );
  return (
    <Tooltip content={reason || label}>
      {disabled ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <span tabIndex={0} className="inline-flex">
          {btn}
        </span>
      ) : (
        btn
      )}
    </Tooltip>
  );
};

const BADGE_VARIANT: Record<SeedRowStatus, 'success' | 'warning' | 'secondary' | 'destructive' | 'outline'> = {
  seeded: 'success',
  missing: 'warning',
  no_db: 'secondary',
  error: 'destructive',
  unknown: 'outline',
};

const TenantSeedManagement: React.FC = () => {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  // Status checks are reads (the route already requires tenant_seed.read); only
  // seed / seed-all writes to the BU schema.
  const canApply = hasPermission('tenant_seed.apply');
  const navigate = useNavigate();
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowState, setRowState] = useState<Record<string, SeedRowState>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [lastStatusResponse, setLastStatusResponse] = useState<unknown>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [batch, setBatch] = useState<SeedBatch | null>(null);
  const [seedTarget, setSeedTarget] = useState<BusinessUnit | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // bu.id -> AbortController of its in-flight seed stream. Aborting only stops the browser
  // listening (see tenantSeedService.deployStream). Also the re-entry guard for seedOne.
  const activeStreamControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Set on unmount: every async path checks it before touching state or starting the next BU.
  const cancelledRef = useRef(false);
  useEffect(() => {
    // Reset on (re)mount: StrictMode runs this cleanup once in dev before remounting, and a
    // flag left at true would silently drop every state update for the life of the page.
    cancelledRef.current = false;
    const controllers = activeStreamControllersRef.current;
    return () => {
      cancelledRef.current = true;
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const applyReason = !canApply
    ? t('common.state.permissionRequired', { permission: 'tenant_seed.apply' })
    : null;
  const batchRunning = batch !== null;
  const anyBusy =
    checkingAll || batchRunning || Object.values(rowState).some((r) => r.checking || r.seeding);

  const checkableBus = useMemo(() => bus.filter(hasDb), [bus]);

  // Fetch one BU's status into its row. Never rejects; returns whether it succeeded.
  const checkRow = useCallback(async (bu: BusinessUnit, notify: boolean): Promise<boolean> => {
    setRowState((prev) => ({
      ...prev,
      [bu.id]: { ...prev[bu.id], checking: true, seeding: prev[bu.id]?.seeding ?? false },
    }));
    try {
      const status = await tenantSeedService.getStatus(bu.id);
      if (cancelledRef.current) return true;
      setLastStatusResponse(status);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], status, checking: false, lastChecked: nowTime(), errorMsg: undefined },
      }));
      return true;
    } catch (err) {
      if (cancelledRef.current) return false;
      if (notify) handleSeedError(err, t);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err, t), lastChecked: nowTime() },
      }));
      return false;
    }
  }, [t]);

  const checkOne = useCallback((bu: BusinessUnit) => {
    void checkRow(bu, true);
  }, [checkRow]);

  const checkAll = useCallback(async () => {
    setCheckingAll(true);
    let failed = 0;
    try {
      await mapWithConcurrency(
        checkableBus,
        4,
        (bu) => checkRow(bu, false),
        (_bu, _i, ok) => {
          if (!ok) failed++;
        },
      );
    } finally {
      if (!cancelledRef.current) setCheckingAll(false);
    }
    if (cancelledRef.current) return;
    const ok = checkableBus.length - failed;
    if (failed > 0) toast.warning(t('pages.tenantSeed.checkAllPartial', { ok, failed }));
    else toast.success(t('pages.tenantSeed.checkAllDone', { count: ok }));
  }, [checkableBus, checkRow, t]);

  // Run one BU's seed stream, updating its row. Rejects on failure (row already carries
  // the error); callers decide how to report it.
  const runSeed = useCallback(async (bu: BusinessUnit, keys: string[], total: number): Promise<SeedDeploySummary> => {
    const controller = new AbortController();
    activeStreamControllersRef.current.set(bu.id, controller);
    setRowState((prev) => ({
      ...prev,
      [bu.id]: {
        ...prev[bu.id],
        checking: prev[bu.id]?.checking ?? false,
        seeding: true,
        progress: { done: 0, total, current: null },
        errorMsg: undefined,
      },
    }));
    try {
      const onEvent = (e: SeedProgressEvent) => {
        if (cancelledRef.current) return;
        if (e.type === 'start') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { done: 0, total: e.total, current: null } } }));
        } else if (e.type === 'seeding') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { done: e.index, total: e.total, current: e.key } } }));
        }
      };
      const summary = await tenantSeedService.deployStream(bu.id, onEvent, keys, controller.signal);
      if (!cancelledRef.current) {
        setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], seeding: false, progress: undefined } }));
      }
      return summary;
    } catch (err) {
      if (!cancelledRef.current) {
        setRowState((prev) => ({
          ...prev,
          [bu.id]: { ...prev[bu.id], seeding: false, progress: undefined, errorMsg: getErrorDetail(err, t), lastChecked: nowTime() },
        }));
      }
      throw err;
    } finally {
      if (activeStreamControllersRef.current.get(bu.id) === controller) activeStreamControllersRef.current.delete(bu.id);
    }
  }, [t]);

  const seedOne = useCallback(async (bu: BusinessUnit, selected: string[]) => {
    if (!canApply) return;
    if (activeStreamControllersRef.current.has(bu.id)) return;
    setSeedTarget(null);
    const { keys, total } = pickMissing(rowState[bu.id]?.status, selected);
    if (keys.length === 0) return;
    try {
      const summary = await runSeed(bu, keys, total);
      if (summary.created > 0) toast.success(t('pages.tenantSeed.seededOne', { count: summary.created, code: bu.code }));
      else toast.info(t('pages.tenantSeed.nothingCreated', { code: bu.code }));
      await checkRow(bu, false);
    } catch (err) {
      if (cancelledRef.current) return;
      handleSeedError(err, t);
    }
  }, [checkRow, canApply, rowState, runSeed, t]);

  const seedAll = useCallback(async (selected: string[]) => {
    if (!canApply) return;
    if (batch !== null) return;
    setConfirmAll(false);
    // Snapshot keys now: rowState changes as each BU is re-checked. Each BU gets only the
    // selected sets it is actually missing; a BU missing none of them is left out entirely.
    const plan = bus
      .filter((bu) => seedRowStatusOf(bu, rowState[bu.id]) === 'missing')
      .map((bu) => ({ bu, ...pickMissing(rowState[bu.id]?.status, selected) }))
      .filter((p) => p.keys.length > 0);
    if (plan.length === 0) {
      toast.info(t('pages.tenantSeed.nothingSelectedToSeed'));
      return;
    }
    let ok = 0;
    let failed = 0;
    try {
      for (let i = 0; i < plan.length; i++) {
        if (cancelledRef.current) return;
        const { bu, keys, total } = plan[i];
        setBatch({ index: i + 1, total: plan.length, buId: bu.id, buCode: bu.code });
        try {
          await runSeed(bu, keys, total);
          await checkRow(bu, false);
          ok++;
        } catch {
          if (cancelledRef.current) return;
          failed++; // error already recorded on the row by runSeed; keep going
        }
      }
    } finally {
      if (!cancelledRef.current) setBatch(null);
    }
    if (failed > 0) toast.warning(t('pages.tenantSeed.seedAllPartial', { ok, failed }));
    else toast.success(t('pages.tenantSeed.seedAllDone', { count: ok }));
  }, [batch, bus, checkRow, canApply, rowState, runSeed, t]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: 1000, sort: 'code:asc' });
        if (cancelledRef.current) return;
        setRawResponse(data);
        const items = (data.data || data) as BusinessUnit[];
        const arr = Array.isArray(items) ? items : [];
        setBus(arr);
        setTotalRows(data.paginate?.total ?? arr.length);
        setError('');
      } catch (err) {
        if (cancelledRef.current) return;
        setBus([]);
        setError(t('pages.tenantSeed.loadBuFailed', { detail: getErrorDetail(err, t) }));
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
  }, [t]);

  const counts = useMemo(() => summarizeFleet(bus, rowState), [bus, rowState]);
  const fleetChecked = counts.seeded + counts.missing + counts.error > 0;
  const nothingToSeed = fleetChecked && counts.missing === 0;
  const seedAllReason =
    applyReason ??
    (nothingToSeed
      ? t('pages.tenantSeed.nothingToSeed')
      : !fleetChecked
        ? t('pages.tenantSeed.seedUncheckedHint')
        : null);

  const statusText = useCallback((st: SeedRowStatus, rs?: SeedRowState): string => {
    switch (st) {
      case 'seeded': return t('pages.tenantSeed.statusSeeded');
      case 'missing': return t('pages.tenantSeed.statusMissing', { count: missingCount(rs?.status) });
      case 'no_db': return t('pages.tenantSeed.statusNoDb');
      case 'error': return t('pages.tenantSeed.statusError');
      default: return t('pages.tenantSeed.statusNotChecked');
    }
  }, [t]);

  const setsSummary = (rs?: SeedRowState): string =>
    rs?.status
      ? rs.status.sets
          .filter((s) => s.missing.length > 0)
          .map((s) => `${s.key} ${s.present}/${s.defined}`)
          .join(', ')
      : '';

  const handleExport = () => {
    const rows = bus.map((bu) => {
      const rs = rowState[bu.id];
      return {
        code: bu.code,
        name: bu.name,
        status: seedRowStatusOf(bu, rs),
        missing: missingCount(rs?.status),
        sets: setsSummary(rs),
        last_checked: rs?.lastChecked ?? '',
        error: rs?.errorMsg ?? '',
      };
    });
    const csv = generateCSV(rows, [
      { key: 'code', label: t('common.field.code') },
      { key: 'name', label: t('common.field.name') },
      { key: 'status', label: t('common.status.label') },
      { key: 'missing', label: t('pages.tenantSeed.columnMissingCsv') },
      { key: 'sets', label: t('pages.tenantSeed.columnSets') },
      { key: 'last_checked', label: t('pages.tenantSeed.columnLastChecked') },
      { key: 'error', label: t('pages.tenantSeed.columnErrorCsv') },
    ]);
    downloadCSV(csv, `tenant-seeds-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.field.code'),
      meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: t('common.field.name'), cell: ({ row }) => <span className="whitespace-nowrap">{row.original.name}</span> },
    {
      id: 'status',
      header: t('common.status.label'),
      // accessorFn only enables sorting — keep ranks out of the global search.
      accessorFn: (row) => SEED_STATUS_RANK[seedRowStatusOf(row, rowState[row.id])],
      enableGlobalFilter: false,
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const st = seedRowStatusOf(bu, rs);
        const badge = <Badge variant={BADGE_VARIANT[st]}>{statusText(st, rs)}</Badge>;
        return (
          <div className="space-y-1">
            {st === 'no_db' ? <Tooltip content={t('pages.tenantSeed.noDbReason')}>{badge}</Tooltip> : badge}
            {rs?.seeding && rs.progress && (
              <div role="status" aria-live="polite" className="break-all font-mono text-xs text-muted-foreground">
                {t('pages.tenantSeed.seedingProgress', { done: rs.progress.done, total: rs.progress.total })}
                {rs.progress.current ? ` · ${rs.progress.current}` : ''}
              </div>
            )}
            {rs?.errorMsg && (
              <div role="alert" className="break-all text-xs text-destructive">
                {rs.errorMsg}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'sets',
      header: t('pages.tenantSeed.columnSets'),
      accessorFn: (row) => missingCount(rowState[row.id]?.status),
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        const missingSets = rs?.status?.sets.filter((s) => s.missing.length > 0) ?? [];
        if (missingSets.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {missingSets.map((s) => (
              <span key={s.key} className="rounded border px-1.5 py-0.5 font-mono text-[11px]" title={s.label}>
                {s.key} {s.present}/{s.defined}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'last_checked',
      header: t('pages.tenantSeed.columnLastChecked'),
      accessorFn: (row) => rowState[row.id]?.lastChecked ?? '',
      enableGlobalFilter: false,
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{rowState[row.original.id]?.lastChecked ?? '-'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-24', cellClassName: 'text-right p-0' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const st = seedRowStatusOf(bu, rs);
        if (st === 'no_db') return null;
        const busy = !!rs?.checking || !!rs?.seeding;
        const readDisabled = busy || batchRunning || checkingAll;
        const writeDisabled = !!applyReason || busy || batchRunning || checkingAll;
        return (
          <div className="flex items-center justify-end gap-1.5">
            {iconAction({
              label: t('pages.tenantSeed.check'),
              icon: rs?.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />,
              onClick: () => checkOne(bu),
              disabled: readDisabled,
              reason: null,
            })}
            {st === 'missing' &&
              iconAction({
                label: t('pages.tenantSeed.seed'),
                icon: rs?.seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />,
                onClick: () => setSeedTarget(bu),
                disabled: writeDisabled,
                reason: applyReason,
                variant: 'default',
              })}
          </div>
        );
      },
    },
  ], [rowState, applyReason, checkOne, batchRunning, checkingAll, statusText, t]);

  const batchProgress = batch?.buId ? rowState[batch.buId]?.progress : undefined;

  const seedTargetOptions = useMemo<SeedSetOption[]>(() => {
    const status = seedTarget ? rowState[seedTarget.id]?.status : undefined;
    return (status?.sets ?? [])
      .filter((s) => s.missing.length > 0)
      .map((s) => ({ key: s.key, label: s.label, count: s.missing.length, items: s.missing }));
  }, [seedTarget, rowState]);

  // Fleet mode: one option per set, aggregated over every BU currently missing it.
  const fleetOptions = useMemo<SeedSetOption[]>(() => {
    const byKey = new Map<string, SeedSetOption>();
    for (const bu of bus) {
      if (seedRowStatusOf(bu, rowState[bu.id]) !== 'missing') continue;
      for (const s of rowState[bu.id]?.status?.sets ?? []) {
        if (s.missing.length === 0) continue;
        const o = byKey.get(s.key) ?? { key: s.key, label: s.label, count: 0, buCount: 0, items: [] };
        o.count += s.missing.length;
        o.buCount = (o.buCount ?? 0) + 1;
        o.items.push(`${bu.code} · ${s.missing.length}`);
        byKey.set(s.key, o);
      }
    }
    return Array.from(byKey.values());
  }, [bus, rowState]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title={t('pages.tenantSeed.title')} subtitle={t('pages.tenantSeed.subtitle')} />

        <SeedFleetSummary
          counts={counts}
          checkable={checkableBus.length}
          actions={
            <>
              {withTooltip(
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkAll}
                  disabled={anyBusy || checkableBus.length === 0}
                >
                  {checkingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {checkingAll ? t('pages.tenantSeed.checking') : t('pages.tenantSeed.checkAll')}
                </Button>,
                null,
              )}
              {withTooltip(
                <Button
                  variant={counts.missing > 0 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConfirmAll(true)}
                  disabled={!!seedAllReason || anyBusy}
                >
                  {batchRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sprout className="mr-2 h-4 w-4" />}
                  {counts.missing > 0
                    ? t('pages.tenantSeed.seedMissing', { count: counts.missing })
                    : t('pages.tenantSeed.seedAll')}
                </Button>,
                seedAllReason,
              )}
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || bus.length === 0 || anyBusy}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
            </>
          }
        />

        {batch && (
          <div role="status" aria-live="polite" className="rounded-md border bg-card px-4 py-2 font-mono text-xs text-muted-foreground">
            {t('pages.tenantSeed.batchProgress', { index: batch.index, total: batch.total, code: batch.buCode ?? '' })}
            {batchProgress?.current ? ` — ${batchProgress.current} (${batchProgress.done}/${batchProgress.total})` : ''}
          </div>
        )}

        {totalRows > bus.length && (
          <p className="text-warning text-xs">
            {t('pages.tenantSeed.showingPartial', { shown: bus.length, total: totalRows })}
          </p>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={setSearchTerm}
                placeholder={t('pages.tenantSeed.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
                {error}
              </div>
            )}

            {!error && bus.length === 0 && !loading ? (
              <EmptyState
                icon={Database}
                title={t('pages.tenantSeed.emptyTitle')}
                description={t('pages.tenantSeed.emptyDescription')}
                action={<Button variant="outline" size="sm" onClick={() => navigate('/business-units')}>{t('pages.tenantSeed.goToBusinessUnits')}</Button>}
              />
            ) : !error ? (
              loading && bus.length === 0 ? (
                <TableSkeleton columns={columns.length + 1} rows={6} />
              ) : (
                <DataTable
                  columns={columns}
                  data={bus}
                  tableLayout="auto"
                  globalFilter={searchTerm}
                  onGlobalFilterChange={setSearchTerm}
                  pageSize={25}
                  defaultSort={{ id: 'code', desc: false }}
                />
              )
            ) : null}
          </CardContent>
        </Card>
      </div>

      <SeedSetPickerDialog
        open={seedTarget !== null}
        onOpenChange={(open) => { if (!open) setSeedTarget(null); }}
        title={t('pages.tenantSeed.seedTitle')}
        description={seedTarget ? t('pages.tenantSeed.seedDescription', { name: seedTarget.name, code: seedTarget.code }) : ''}
        options={seedTargetOptions}
        onConfirm={(keys) => { if (seedTarget) void seedOne(seedTarget, keys); }}
      />

      <SeedSetPickerDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('pages.tenantSeed.seedAllTitle')}
        description={t('pages.tenantSeed.seedAllDescription', { count: counts.missing })}
        options={fleetOptions}
        onConfirm={(keys) => { void seedAll(keys); }}
      />

      <DevDebugSheet
        title="API Response"
        tabs={[
          { key: 'bus', label: 'Business Units', data: rawResponse, endpoint: 'GET /api-system/business-units' },
          { key: 'status', label: 'Last seed status', data: lastStatusResponse, endpoint: 'GET /api-system/tenant/seeds/:bu_id/status' },
        ]}
      />
    </Layout>
  );
};

export default TenantSeedManagement;
