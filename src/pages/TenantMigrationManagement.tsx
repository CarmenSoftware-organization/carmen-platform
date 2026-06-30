// src/pages/TenantMigrationManagement.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import businessUnitService from '../services/businessUnitService';
import { getErrorDetail } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { Search, X, Download, Code, Copy, Check, Database, RefreshCw, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessUnit, TenantMigrationStatus, ProgressEvent, BatchDeploySummary } from '../types';
import type { ColumnDef } from '@tanstack/react-table';
import tenantMigrationService from '../services/tenantMigrationService';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { handleMigrationError } from '../utils/migrationError';
import { mapWithConcurrency } from '../utils/concurrent';

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

const STATUS_BADGE: Record<RowStatus, { variant: 'success' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  up_to_date: { variant: 'success', label: 'Up to date' },
  pending: { variant: 'secondary', label: 'Pending' },
  unknown: { variant: 'outline', label: 'Unknown' },
  error: { variant: 'destructive', label: 'Error' },
};

// Wrap a (possibly disabled) button so its tooltip still fires — Radix tooltips
// don't fire over a disabled button, so the trigger wraps a focusable span.
export const withTooltip = (el: ReactElement, reason: string | null): ReactElement =>
  reason ? (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <span tabIndex={0}>{el}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const [copied, setCopied] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [applyTarget, setApplyTarget] = useState<BusinessUnit | null>(null);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: 0, total: e.total, current: null } } }));
        } else if (e.type === 'applying') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: e.index, total: e.total, current: e.name } } }));
        }
      };
      const result = await tenantMigrationService.deployStream(bu.id, onEvent);
      const applied = 'applied_migrations' in result ? result.applied_migrations : [];
      if (applied.length === 0) toast.info('Already up to date.');
      else toast.success(`Applied ${applied.length} migration(s) to ${bu.code}.`);
      setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined } }));
      await checkOne(bu);
    } catch (err) {
      handleMigrationError(err);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined, errorMsg: getErrorDetail(err) },
      }));
    }
  }, [checkOne]);

  const deployAll = useCallback(async () => {
    setConfirmAll(false);
    setBatch({ applied: 0, total: 0, current: null, buCode: null, log: [] });
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
      const result = await tenantMigrationService.deployAllStream(onEvent);
      if (result && 'succeeded' in result) {
        const s = result as BatchDeploySummary;
        const msg = `Deployed: ${s.succeeded} ok, ${s.failed} failed.`;
        if (s.failed > 0) toast.warning(msg);
        else toast.success(msg);
      } else {
        toast.success('Deploy completed.');
      }
    } catch (err) {
      handleMigrationError(err);
    } finally {
      setBatch(null);
    }
  }, []);

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
          toast.warning(`Showing ${arr.length} of ${data.paginate.total} business units — increase the page size to see all.`);
        }
        setError('');
      } catch (err) {
        setError('Failed to load business units: ' + getErrorDetail(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopyJson = (d: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(d, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = useMemo(() => {
    const acc = { up_to_date: 0, pending: 0, unknown: 0, error: 0 };
    for (const bu of bus) acc[rowStatusOf(rowState[bu.id])]++;
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
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        const st = rowStatusOf(rs);
        const badge = STATUS_BADGE[st];
        return (
          <div className="space-y-1">
            <Badge variant={badge.variant}>
              {st === 'pending' ? `${rs?.status?.pending.length ?? 0} pending` : badge.label}
            </Badge>
            {rs?.deploying && rs.progress && (
              <div className="break-all font-mono text-xs text-muted-foreground">
                Applying {rs.progress.applied}/{rs.progress.total}
                {rs.progress.current ? ` · ${rs.progress.current}` : ''}
              </div>
            )}
            {rs?.errorMsg && <div className="break-all text-xs text-destructive">{rs.errorMsg}</div>}
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
        return <span className="text-muted-foreground">{rs?.status ? rs.status.pending.length : '–'}</span>;
      },
    },
    {
      id: 'last_checked',
      header: 'Last checked',
      enableSorting: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        return <span className="text-xs text-muted-foreground">{rs?.lastChecked ?? '–'}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-40', cellClassName: 'text-right' },
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tenant Migrations</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              Check and apply database schema migrations across all business units
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Summary:</span>
          <Badge variant="success">Up to date {summary.up_to_date}</Badge>
          <Badge variant="secondary">Pending {summary.pending}</Badge>
          <Badge variant="outline">Unknown {summary.unknown}</Badge>
          {summary.error > 0 && <Badge variant="destructive">Error {summary.error}</Badge>}
          {totalRows > bus.length && (
            <Badge variant="destructive">Showing {bus.length} of {totalRows}</Badge>
          )}
        </div>

        {batch && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Deploying all BUs… {batch.buCode ? `(${batch.buCode})` : ''}</span>
                <span className="text-muted-foreground">{batch.applied} / {batch.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-valuenow={batch.applied}
                  aria-valuemin={0}
                  aria-valuemax={batch.total}
                  className="h-full bg-primary transition-all"
                  style={{ width: `${batch.total ? (batch.applied / batch.total) * 100 : 0}%` }}
                />
              </div>
              {batch.current && <p className="break-all font-mono text-xs text-muted-foreground">{batch.current}</p>}
              {batch.log.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                  {batch.log.map((l, i) => (
                    <li key={`${l}-${i}`} className="break-all font-mono text-xs text-muted-foreground">{l}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search business units..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search business units"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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
                <TableSkeleton columns={5} rows={6} />
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

      {import.meta.env.DEV && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">GET /api-system/business-units</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default TenantMigrationManagement;
