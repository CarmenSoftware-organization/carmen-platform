import { useMemo, useState, type ReactElement } from 'react';
import { Sprout, Loader2, RefreshCw, Play } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Tooltip } from './ui/tooltip';
import { toast } from 'sonner';
import { handleSeedError } from '../utils/seedError';
import tenantSeedService from '../services/tenantSeedService';
import type { TenantSeedStatus, SeedProgressEvent } from '../types';

interface TenantSeedCardProps {
  buId: string;
  buCode: string;
  buName: string;
  hasDbConnection: boolean;
  isSuperAdmin: boolean;
}

export const TenantSeedCard = ({
  buId,
  buCode,
  buName,
  hasDbConnection,
  isSuperAdmin,
}: TenantSeedCardProps): ReactElement => {
  const [status, setStatus] = useState<TenantSeedStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const disabledReason = !isSuperAdmin
    ? 'Super-admin required.'
    : !hasDbConnection
    ? 'Configure a database connection first.'
    : null;
  const busy = loadingStatus || seeding;
  const actionsDisabled = disabledReason !== null || busy;

  const totalMissing = useMemo(
    () => (status ? status.sets.reduce((acc, s) => acc + s.missing.length, 0) : 0),
    [status],
  );

  const selectedMissing = useMemo(
    () =>
      status
        ? status.sets.reduce((acc, s) => (selectedKeys.has(s.key) ? acc + s.missing.length : acc), 0)
        : 0,
    [status, selectedKeys],
  );

  const toggleSet = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const s = await tenantSeedService.getStatus(buId);
      setStatus(s);
      setSelectedKeys(new Set(s.sets.filter((x) => x.missing.length > 0).map((x) => x.key)));
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setLastChecked(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    } catch (err) {
      handleSeedError(err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const runSeed = async () => {
    setConfirmOpen(false);
    setSeeding(true);
    setProgress({ done: 0, total: selectedMissing, current: null });
    setLogLines([]);
    try {
      const onEvent = (e: SeedProgressEvent) => {
        if (e.type === 'start') setProgress({ done: 0, total: e.total, current: null });
        else if (e.type === 'seeding') {
          setProgress({ done: e.index, total: e.total, current: e.row_type });
          setLogLines((prev) => [...prev, `${e.key}: ${e.row_type}`]);
        }
      };
      const summary = await tenantSeedService.deployStream(buId, onEvent, Array.from(selectedKeys));
      if (summary.created === 0) toast.info('Nothing to seed. Already up to date.');
      else toast.success(`Created ${summary.created} row(s) for ${buCode} (skipped ${summary.skipped}).`);
      await fetchStatus();
    } catch (err) {
      handleSeedError(err);
    } finally {
      setProgress(null);
      setSeeding(false);
    }
  };

  // Wrap a (possibly disabled) button so its tooltip still fires — a disabled
  // <button> is removed from the tab order, so wrap it in a focusable span.
  const withTooltip = (el: ReactElement): ReactElement =>
    disabledReason ? (
      <Tooltip content={disabledReason}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>{el}</span>
      </Tooltip>
    ) : (
      el
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sprout className="h-4 w-4" /> Tenant Seed Data
        </CardTitle>
        <CardDescription>
          Check and seed default master data (running codes) into this BU&apos;s tenant database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {withTooltip(
            <Button type="button" size="sm" variant="outline" onClick={fetchStatus} disabled={actionsDisabled}>
              {loadingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {loadingStatus ? 'Checking...' : status ? 'Re-check status' : 'Check status'}
            </Button>,
          )}

          {status?.all_seeded && <Badge variant="success">Seeded</Badge>}
          {status && !status.all_seeded && <Badge variant="secondary">{totalMissing} missing</Badge>}
          {lastChecked && <span className="text-xs text-muted-foreground">Last checked {lastChecked}</span>}
        </div>

        {status && !status.all_seeded && (
          <div className="space-y-2">
            {status.sets
              .filter((s) => s.missing.length > 0)
              .map((s) => (
                <div key={s.key} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedKeys.has(s.key)}
                      onChange={() => toggleSet(s.key)}
                    />
                    {s.label}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({s.present}/{s.defined} present, {s.missing.length} missing)
                    </span>
                  </label>
                  <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                    {s.missing.map((name) => (
                      <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {withTooltip(
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={actionsDisabled || selectedMissing === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                Seed {selectedMissing} row(s)
              </Button>,
            )}
          </div>
        )}

        {seeding && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Seeding…</span>
              <span className="text-muted-foreground">
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
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
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Seed tenant data"
        description={`Seed ${selectedMissing} default row(s) into ${buName} (${buCode})? This creates missing default master data in the tenant database. Existing rows are left unchanged.`}
        confirmText="Seed"
        onConfirm={runSeed}
      />
    </Card>
  );
};

export default TenantSeedCard;
