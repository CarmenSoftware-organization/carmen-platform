import { useMemo, useState, type ReactElement } from 'react';
import { Sprout, Loader2, RefreshCw, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Tooltip } from './ui/tooltip';
import { toast } from 'sonner';
import { handleSeedError } from '../utils/seedError';
import tenantSeedService from '../services/tenantSeedService';
import type { TenantSeedStatus, SeedProgressEvent } from '../types';
import { useI18n } from '../hooks/useI18n';

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
  const { t } = useI18n();
  const [status, setStatus] = useState<TenantSeedStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const disabledReason = !isSuperAdmin
    ? t('common.state.superAdminRequired')
    : !hasDbConnection
    ? t('common.state.configureDbPoolFirst')
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

  const toggleExpanded = (key: string) =>
    setExpandedKeys((prev) => {
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
      setExpandedKeys(new Set(s.sets.filter((x) => x.missing.length > 0).map((x) => x.key)));
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
      if (summary.created === 0) toast.info(t('components.tenantSeedCard.nothingToSeedUpToDate'));
      else
        toast.success(
          t('components.tenantSeedCard.createdRowsToast', {
            count: summary.created,
            buCode,
            skipped: summary.skipped,
          }),
        );
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
          <Sprout className="h-4 w-4" /> {t('components.tenantSeedCard.title')}
        </CardTitle>
        <CardDescription>
          {t('components.tenantSeedCard.description')}
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
              {loadingStatus
                ? t('common.busy.checking')
                : status
                ? t('common.action.recheckStatus')
                : t('common.action.checkStatus')}
            </Button>,
          )}

          {status?.all_seeded && <Badge variant="success">{t('components.tenantSeedCard.seeded')}</Badge>}
          {status && !status.all_seeded && (
            <Badge variant="secondary">{t('components.tenantSeedCard.missingCount', { count: totalMissing })}</Badge>
          )}
          {lastChecked && (
            <span className="text-xs text-muted-foreground">
              {t('common.state.lastChecked', { time: lastChecked })}
            </span>
          )}
        </div>

        {status && (
          <div className="space-y-2">
            {status.sets.map((s) => {
              const complete = s.missing.length === 0;
              const expanded = expandedKeys.has(s.key);
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedKeys.has(s.key)}
                        disabled={actionsDisabled || complete}
                        onChange={() => toggleSet(s.key)}
                      />
                      {s.label}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({s.present}/{s.defined} present, {s.missing.length} missing)
                      </span>
                    </label>
                    {complete ? (
                      <Badge variant="success">{t('components.tenantSeedCard.seeded')}</Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t('components.tenantSeedCard.missingCount', { count: s.missing.length })}
                      </Badge>
                    )}
                    {!complete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? t('components.tenantSeedCard.hideMissingRowsAria', { label: s.label })
                            : t('components.tenantSeedCard.showMissingRowsAria', { label: s.label })
                        }
                        onClick={() => toggleExpanded(s.key)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  {!complete && expanded && (
                    <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                      {s.missing.map((name) => (
                        <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {withTooltip(
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={actionsDisabled || selectedMissing === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                {selectedMissing === 0
                  ? t('components.tenantSeedCard.nothingToSeed')
                  : t('components.tenantSeedCard.seedRowsButton', { count: selectedMissing })}
              </Button>,
            )}
          </div>
        )}

        {seeding && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('components.tenantSeedCard.seedingEllipsis')}</span>
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
        title={t('components.tenantSeedCard.confirmTitle')}
        description={t('components.tenantSeedCard.confirmDescription', {
          count: selectedMissing,
          name: buName,
          code: buCode,
        })}
        confirmText={t('components.tenantSeedCard.seedButton')}
        onConfirm={runSeed}
      />
    </Card>
  );
};

export default TenantSeedCard;
