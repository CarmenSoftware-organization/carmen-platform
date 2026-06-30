import { useState, type ReactElement } from 'react';
import { Database, Loader2, RefreshCw, Play } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { toast } from 'sonner';
import { handleMigrationError } from '../utils/migrationError';
import tenantMigrationService from '../services/tenantMigrationService';
import type { TenantMigrationStatus, ProgressEvent } from '../types';

interface TenantMigrationCardProps {
  buId: string;
  buCode: string;
  buName: string;
  hasDbConnection: boolean;
  isSuperAdmin: boolean;
}

export const TenantMigrationCard = ({
  buId,
  buCode,
  buName,
  hasDbConnection,
  isSuperAdmin,
}: TenantMigrationCardProps) => {
  const [status, setStatus] = useState<TenantMigrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [progress, setProgress] = useState<{ applied: number; total: number; current: string | null } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const disabledReason = !isSuperAdmin
    ? 'Super-admin required.'
    : !hasDbConnection
    ? 'Configure a database connection first.'
    : null;
  const busy = loadingStatus || deploying;
  const actionsDisabled = disabledReason !== null || busy;

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const s = await tenantMigrationService.getStatus(buId);
      setStatus(s);
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setLastChecked(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    } catch (err) {
      handleMigrationError(err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const runDeploy = async () => {
    setConfirmOpen(false);
    setDeploying(true);
    setProgress({ applied: 0, total: pending.length, current: null });
    setLogLines([]);
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') setProgress({ applied: 0, total: e.total, current: null });
        else if (e.type === 'applying') {
          setProgress({ applied: e.index, total: e.total, current: e.name });
          setLogLines((prev) => [...prev, e.name]);
        }
      };
      const summary = await tenantMigrationService.deployStream(buId, onEvent);
      const applied = 'applied_migrations' in summary ? summary.applied_migrations : [];
      if (applied.length === 0) toast.info('Already up to date.');
      else toast.success(`Applied ${applied.length} migration(s) to ${buCode}.`);
      await fetchStatus();
    } catch (err) {
      handleMigrationError(err);
    } finally {
      setProgress(null);
      setDeploying(false);
    }
  };

  const pending = status?.pending ?? [];

  // Wrap a (possibly disabled) button so its tooltip still fires — Radix tooltips
  // don't fire over a disabled button, so the trigger wraps a focusable span.
  const withTooltip = (el: ReactElement): ReactElement =>
    disabledReason ? (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Focusable wrapper so the disabled button's tooltip is reachable by keyboard,
                not just hover (a disabled <button> is removed from the tab order). */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <span tabIndex={0}>{el}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      el
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Tenant Migrations
        </CardTitle>
        <CardDescription>
          Check and apply database schema migrations for this BU&apos;s tenant database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {withTooltip(
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={fetchStatus}
              disabled={actionsDisabled}
            >
              {loadingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {loadingStatus ? 'Checking...' : status ? 'Re-check status' : 'Check status'}
            </Button>,
          )}

          {status?.up_to_date && <Badge variant="success">Up to date</Badge>}
          {status?.has_pending && <Badge variant="secondary">{pending.length} pending</Badge>}
          {lastChecked && (
            <span className="text-xs text-muted-foreground">Last checked {lastChecked}</span>
          )}
        </div>

        {status?.has_pending && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Pending migrations <span className="text-muted-foreground">({pending.length})</span>
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
              {pending.map((name) => (
                <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                  {name}
                </li>
              ))}
            </ul>
            {withTooltip(
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={actionsDisabled}
              >
                <Play className="mr-2 h-4 w-4" />
                Apply {pending.length} migration(s)
              </Button>,
            )}
          </div>
        )}

        {deploying && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Applying migrations…</span>
              <span className="text-muted-foreground">
                {progress.applied} / {progress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                role="progressbar"
                aria-valuenow={progress.applied}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.applied / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.current && (
              <p className="break-all font-mono text-xs text-muted-foreground">{progress.current}</p>
            )}
            {logLines.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                {logLines.map((name, i) => (
                  <li key={`${name}-${i}`} className="break-all font-mono text-xs text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status?.raw && (
          <div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? 'Hide' : 'Show'} raw output
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-60 w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-xs">
                {status.raw}
              </pre>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply tenant migrations"
        description={`Apply ${pending.length} pending migration(s) to ${buName} (${buCode})? This applies schema changes to the tenant database and cannot be undone.`}
        confirmText="Apply migrations"
        confirmVariant="destructive"
        onConfirm={runDeploy}
      />
    </Card>
  );
};

export default TenantMigrationCard;
