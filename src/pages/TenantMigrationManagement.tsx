// src/pages/TenantMigrationManagement.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import businessUnitService from '../services/businessUnitService';
import { getErrorDetail } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { Tooltip } from '../components/ui/tooltip';
import { Download, Database, RefreshCw, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import type { BusinessUnit, TenantMigrationStatus, ProgressEvent, BatchDeploySummary } from '../types';
import type { ColumnDef } from '@tanstack/react-table';
import tenantMigrationService from '../services/tenantMigrationService';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { handleMigrationError } from '../utils/migrationError';
import { mapWithConcurrency } from '../utils/concurrent';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { FleetSync } from './tenantMigration/FleetSync';
import { DeployConsole } from './tenantMigration/DeployConsole';

type RowStatus = 'unknown' | 'up_to_date' | 'pending' | 'error';

export interface RowState {
  status?: TenantMigrationStatus;
  checking: boolean;
  deploying: boolean;
  progress?: { applied: number; total: number; current: string | null };
  lastChecked?: string;
  errorMsg?: string;
}

export interface BatchProgress {
  applied: number;
  total: number;
  current: string | null;
  buCode: string | null;
  log: string[];
}

// Key used in activeStreamControllersRef for the batch "Deploy all" stream (distinct from any
// real bu.id, which is always a UUID).
const ALL_BU_STREAM_KEY = '__all__';

export const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const rowStatusOf = (rs?: RowState): RowStatus => {
  if (!rs) return 'unknown';
  if (rs.errorMsg) return 'error';
  if (!rs.status) return 'unknown';
  if (rs.status.up_to_date) return 'up_to_date';
  if (rs.status.has_pending) return 'pending';
  return 'unknown';
};

// Wrap a (possibly disabled) button so its tooltip still fires — Fluent UI tooltips
// don't fire over a disabled button, so the trigger wraps a focusable span.
export const withTooltip = (el: ReactElement, reason: string | null): ReactElement =>
  reason ? (
    <Tooltip content={reason}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>{el}</span>
    </Tooltip>
  ) : (
    el
  );

const TenantMigrationManagement: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [applyTarget, setApplyTarget] = useState<BusinessUnit | null>(null);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tracks in-flight deploy stream requests so they can be aborted on unmount/navigation
  // (bu.id -> its AbortController for a per-row Apply; ALL_BU_STREAM_KEY for Deploy all). This
  // is NOT a user-facing Cancel: aborting only stops the browser from listening — the
  // micro-business handler is explicitly designed to keep running `prisma migrate deploy` to
  // completion after a client disconnect (see tenantMigrationService.ts `_streamDeploy` doc
  // comment for the backend evidence). The controller exists purely to avoid a leaked fetch /
  // stale state update after this page is navigated away from, and doubles as the source of
  // truth for the re-entry guards in applyOne/deployAll below.
  const activeStreamControllersRef = useRef<Map<string, AbortController>>(new Map());
  useEffect(() => {
    const controllers = activeStreamControllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const disabledReason = !isSuperAdmin ? 'Super-admin required.' : null;

  const batchRunning = batch !== null;

  const anyBusy =
    checkingAll ||
    batchRunning ||
    Object.values(rowState).some((r) => r.checking || r.deploying);

  const checkOne = useCallback(async (bu: BusinessUnit) => {
    setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], checking: true, deploying: prev[bu.id]?.deploying ?? false } }));
    try {
      const status = await tenantMigrationService.getStatus(bu.id);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], status, checking: false, lastChecked: nowTime(), errorMsg: undefined },
      }));
    } catch (err) {
      handleMigrationError(err);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err), lastChecked: nowTime() },
      }));
    }
  }, []);

  const checkAll = useCallback(async () => {
    setCheckingAll(true);
    setRowState((prev) => {
      const next = { ...prev };
      for (const bu of bus) next[bu.id] = { ...next[bu.id], checking: true, deploying: next[bu.id]?.deploying ?? false };
      return next;
    });
    try {
      await mapWithConcurrency(
        bus,
        4,
        (bu) => tenantMigrationService.getStatus(bu.id),
        (bu, _i, result, err) => {
          setRowState((prev) => ({
            ...prev,
            [bu.id]: err
              ? { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err), lastChecked: nowTime() }
              : { ...prev[bu.id], status: result, checking: false, lastChecked: nowTime(), errorMsg: undefined },
          }));
        },
      );
    } finally {
      setCheckingAll(false);
      setRowState((prev) => {
        const next = { ...prev };
        for (const bu of bus) if (next[bu.id]?.checking) next[bu.id] = { ...next[bu.id], checking: false };
        return next;
      });
    }
  }, [bus]);

  const applyOne = useCallback(async (bu: BusinessUnit) => {
    // Defence-in-depth: mirrors the disabled={!!disabledReason} state on the Apply button.
    // The button is disabled for non-super-admins today, but that's UI-layer only — fail
    // closed here too so a future refactor that renders the button enabled can't mutate.
    if (!isSuperAdmin) return;
    // Re-entry guard: a ref (not rowState, which can be stale in this closure) so a second
    // trigger for the same BU while one is already streaming is ignored rather than orphaning
    // the first controller's map entry.
    if (activeStreamControllersRef.current.has(bu.id)) return;
    setApplyTarget(null);
    setRowState((prev) => ({
      ...prev,
      [bu.id]: {
        ...prev[bu.id],
        deploying: true,
        progress: { applied: 0, total: prev[bu.id]?.status?.pending.length ?? 0, current: null },
        errorMsg: undefined,
      },
    }));
    const controller = new AbortController();
    activeStreamControllersRef.current.set(bu.id, controller);
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: 0, total: e.total, current: null } } }));
        } else if (e.type === 'applying') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: e.index, total: e.total, current: e.name } } }));
        }
      };
      const result = await tenantMigrationService.deployStream(bu.id, onEvent, controller.signal);
      const applied = 'applied_migrations' in result ? result.applied_migrations : [];
      if (applied.length === 0) toast.info('Already up to date.');
      else toast.success(`Applied ${applied.length} migration(s) to ${bu.code}.`);
      setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined } }));
      await checkOne(bu);
    } catch (err) {
      // Aborted on unmount — the migration itself keeps running server-side (see
      // tenantMigrationService.ts), but this page is gone, so there's nothing left to update.
      if (controller.signal.aborted) return;
      handleMigrationError(err);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined, errorMsg: getErrorDetail(err) },
      }));
    } finally {
      if (activeStreamControllersRef.current.get(bu.id) === controller) activeStreamControllersRef.current.delete(bu.id);
    }
  }, [checkOne, isSuperAdmin]);

  const deployAll = useCallback(async () => {
    // Defence-in-depth: mirrors the disabled={!!disabledReason} state on the Deploy all
    // button. The button is disabled for non-super-admins today, but that's UI-layer only —
    // fail closed here too so a future refactor that renders the button enabled can't mutate.
    if (!isSuperAdmin) return;
    // Re-entry guard: batchRunning already disables the "Deploy all" button while a batch is in
    // flight, but this ref-backed check is the source of truth (mirrors applyOne) so a second
    // trigger can't orphan the first controller's map entry.
    if (activeStreamControllersRef.current.has(ALL_BU_STREAM_KEY)) return;
    setConfirmAll(false);
    setBatch({ applied: 0, total: 0, current: null, buCode: null, log: [] });
    const controller = new AbortController();
    activeStreamControllersRef.current.set(ALL_BU_STREAM_KEY, controller);
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') {
          setBatch((b) => (b ? { ...b, total: e.total, buCode: e.bu_code, applied: 0, current: null } : b));
        } else if (e.type === 'applying') {
          setBatch((b) => (b ? { ...b, applied: e.index, total: e.total, current: e.name, buCode: e.bu_code } : b));
        } else if (e.type === 'bu-complete') {
          const line = `${e.bu_code}: ${e.error ? 'failed' : e.already_up_to_date ? 'up to date' : `applied ${e.applied.length}`}`;
          setBatch((b) => (b ? { ...b, log: [...b.log, line] } : b));
          setRowState((prev) => ({
            ...prev,
            [e.bu_id]: e.error
              ? { ...prev[e.bu_id], checking: false, deploying: false, progress: undefined, errorMsg: e.error, lastChecked: nowTime() }
              : {
                  ...prev[e.bu_id],
                  checking: false,
                  deploying: false,
                  progress: undefined,
                  errorMsg: undefined,
                  lastChecked: nowTime(),
                  status: { bu_id: e.bu_id, bu_code: e.bu_code, has_pending: false, pending: [], up_to_date: true, raw: '' },
                },
          }));
        } else if (e.type === 'log') {
          setBatch((b) => (b ? { ...b, log: [...b.log, e.message] } : b));
        }
      };
      const result = await tenantMigrationService.deployAllStream(onEvent, controller.signal);
      if (result && 'succeeded' in result) {
        const s = result as BatchDeploySummary;
        const msg = `Deployed: ${s.succeeded} ok, ${s.failed} failed.`;
        if (s.failed > 0) toast.warning(msg);
        else toast.success(msg);
      } else {
        toast.success('Deploy completed.');
      }
    } catch (err) {
      // Aborted on unmount — the BU currently mid-migration keeps running to completion
      // server-side (see tenantMigrationService.ts); this page is gone either way.
      if (controller.signal.aborted) return;
      handleMigrationError(err);
    } finally {
      activeStreamControllersRef.current.delete(ALL_BU_STREAM_KEY);
      if (!controller.signal.aborted) setBatch(null);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: 1000, sort: 'code:asc' });
        setRawResponse(data);
        const items = (data.data || data) as BusinessUnit[];
        const arr = Array.isArray(items) ? items : [];
        setBus(arr);
        setTotalRows(data.paginate?.total ?? arr.length);
        if (typeof data.paginate?.total === 'number' && data.paginate.total > arr.length) {
          toast.warning(`Showing ${arr.length} of ${data.paginate.total} business units. Increase the page size to see all.`);
        }
        setError('');
      } catch (err) {
        setError('Failed to load business units: ' + getErrorDetail(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const acc = { up_to_date: 0, pending: 0, unknown: 0, error: 0, pendingMigrations: 0 };
    for (const bu of bus) {
      acc[rowStatusOf(rowState[bu.id])]++;
      acc.pendingMigrations += rowState[bu.id]?.status?.pending?.length ?? 0;
    }
    return acc;
  }, [bus, rowState]);

  const handleExport = () => {
    const rows = bus.map((bu) => {
      const rs = rowState[bu.id];
      return {
        code: bu.code,
        name: bu.name,
        status: rowStatusOf(rs),
        pending: rs?.status?.pending?.length ?? 0,
        last_checked: rs?.lastChecked ?? '',
      };
    });
    const csv = generateCSV(rows, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
      { key: 'pending', label: 'Pending' },
      { key: 'last_checked', label: 'Last Checked' },
    ]);
    downloadCSV(csv, `tenant-migrations-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span>{row.original.name}</span> },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        const st = rowStatusOf(rs);
        const pending = rs?.status?.pending.length ?? 0;
        // Mirrors TenantMigrationCard's variant mapping (up_to_date -> success, has_pending
        // -> secondary) so the two surfaces render the same status consistently; error/unknown
        // have no analog there, so destructive/outline follow the app-wide Badge convention.
        const variant = {
          up_to_date: 'success',
          pending: 'secondary',
          error: 'destructive',
          unknown: 'outline',
        }[st] as 'success' | 'secondary' | 'destructive' | 'outline';
        const text =
          st === 'pending' ? `${pending} behind`
          : st === 'up_to_date' ? 'In sync'
          : st === 'error' ? 'Error'
          : 'Not checked';
        return (
          <div className="space-y-1">
            <Badge variant={variant}>{text}</Badge>
            {rs?.deploying && rs.progress && (
              <div role="status" aria-live="polite" className="break-all font-mono text-xs text-muted-foreground">
                Applying {rs.progress.applied}/{rs.progress.total}
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
      id: 'pending',
      header: 'Pending',
      enableSorting: false,
      meta: { cellClassName: 'text-center' },
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        return <span className="text-muted-foreground">{rs?.status ? rs.status.pending.length : '-'}</span>;
      },
    },
    {
      id: 'last_checked',
      header: 'Last checked',
      enableSorting: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        return <span className="text-xs text-muted-foreground">{rs?.lastChecked ?? '-'}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-40', cellClassName: 'text-right p-0' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const busy = !!rs?.checking || !!rs?.deploying;
        return (
          <div className="flex items-center justify-end gap-2">
            {withTooltip(
              <Button variant="outline" size="sm" onClick={() => checkOne(bu)} disabled={!!disabledReason || busy || batchRunning}>
                {rs?.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Check
              </Button>,
              disabledReason,
            )}
            {rs?.status?.has_pending &&
              withTooltip(
                <Button variant="destructive" size="sm" onClick={() => setApplyTarget(bu)} disabled={!!disabledReason || busy || batchRunning}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Apply
                </Button>,
                disabledReason,
              )}
          </div>
        );
      },
    },
  ], [rowState, disabledReason, checkOne, batchRunning]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Tenant migrations"
          subtitle="Check which tenant databases are behind on schema migrations, and roll them out."
        />

        <FleetSync
          total={bus.length}
          summary={summary}
          actions={
            <>
              {withTooltip(
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkAll}
                  disabled={!!disabledReason || anyBusy || bus.length === 0}
                >
                  {checkingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {checkingAll ? 'Checking...' : 'Check all'}
                </Button>,
                disabledReason,
              )}
              {withTooltip(
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAll(true)}
                  disabled={!!disabledReason || anyBusy || bus.length === 0}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Deploy all
                </Button>,
                disabledReason,
              )}
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || bus.length === 0 || anyBusy}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </>
          }
        />

        {totalRows > bus.length && (
          <p className="text-warning text-xs">
            Showing {bus.length} of {totalRows} business units. Increase the page size to see all.
          </p>
        )}

        <DeployConsole batch={batch} />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={setSearchTerm}
                placeholder="Search business units..."
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
                title="No business units"
                description="Create a business unit first to manage its tenant migrations."
                action={<Button variant="outline" size="sm" onClick={() => navigate('/business-units')}>Go to Business Units</Button>}
              />
            ) : !error ? (
              loading && bus.length === 0 ? (
                <TableSkeleton columns={columns.length + 1} rows={6} />
              ) : (
                <DataTable
                  columns={columns}
                  data={bus}
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

      <ConfirmDialog
        open={applyTarget !== null}
        onOpenChange={(open) => { if (!open) setApplyTarget(null); }}
        title="Apply tenant migrations"
        description={
          applyTarget
            ? `Apply ${rowState[applyTarget.id]?.status?.pending.length ?? 0} pending migration(s) to ${applyTarget.name} (${applyTarget.code})? This applies schema changes to the tenant database and cannot be undone.`
            : ''
        }
        confirmText="Apply migrations"
        confirmVariant="destructive"
        onConfirm={() => (applyTarget ? applyOne(applyTarget) : undefined)}
      />

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Deploy migrations to all BUs"
        description={`Apply all pending migrations to every business unit (${bus.length} total)? This applies schema changes to every tenant database and cannot be undone.`}
        confirmText="Deploy all"
        confirmVariant="destructive"
        onConfirm={deployAll}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/business-units" data={rawResponse} />
    </Layout>
  );
};

export default TenantMigrationManagement;
