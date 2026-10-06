import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Rocket, Square } from 'lucide-react';
import dashboardTemplateService from '../../services/dashboardTemplateService';
import { fetchAllBusinessUnits } from '../../utils/fetchAllBusinessUnits';
import { mapWithConcurrency } from '../../utils/concurrent';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { useAuth } from '../../context/AuthContext';
import { PLATFORM_SCOPED_RECORD } from '../../utils/permissions';
import Can from '../../components/Can';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import type { BusinessUnit, DashboardDeployMode } from '../../types';
import { DEPLOY_BADGE, STATUS_LABEL_KEY, deployRowStatusOf, type DeployRowState } from './deployRowState';
import OverwriteConfirmDialog from './OverwriteConfirmDialog';

const CHECK_PREFIX = 'check:';

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

export default function DeployPanel() {
  const { t, lang } = useI18n();
  const { hasPermission } = useAuth();
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rowState, setRowState] = useState<Record<string, DeployRowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<DashboardDeployMode>('skip_customized');
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelledRef = useRef(false);
  const stopRef = useRef(false);
  // deploy ใช้ key = bu.code · เช็คสถานะใช้ `check:<code>` — handleStop ยกเลิกเฉพาะ deploy
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    cancelledRef.current = false;
    const controllers = controllersRef.current;
    return () => {
      cancelledRef.current = true;
      stopRef.current = true;
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  const patchRow = useCallback((code: string, partial: Partial<DeployRowState>) => {
    if (cancelledRef.current) return;
    setRowState((prev) => {
      const base: DeployRowState = prev[code] ?? { checking: false, deploying: false };
      return { ...prev, [code]: { ...base, ...partial } };
    });
  }, []);

  const checkRow = useCallback(async (bu: BusinessUnit) => {
    const key = CHECK_PREFIX + bu.code;
    const controller = new AbortController();
    controllersRef.current.get(key)?.abort();
    controllersRef.current.set(key, controller);
    patchRow(bu.code, { checking: true });
    try {
      const status = await dashboardTemplateService.deployStatus(bu.code, controller.signal);
      patchRow(bu.code, { status, checking: false });
    } catch (err) {
      if (axios.isCancel(err)) return;
      patchRow(bu.code, { checking: false, outcome: { kind: 'error', message: getErrorDetail(err, t) } });
    } finally {
      if (controllersRef.current.get(key) === controller) controllersRef.current.delete(key);
    }
  }, [patchRow, t]);

  const refreshAll = useCallback(async (list: BusinessUnit[]) => {
    const v = await dashboardTemplateService.version();
    if (cancelledRef.current) return;
    setVersion(v);
    // refresh ใหม่ล้างผลรอบก่อน (รวม error เดิม) — สถานะที่ได้ใหม่คือความจริงล่าสุด
    setRowState((prev) => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, { ...r, outcome: undefined }])));
    await mapWithConcurrency(list, 4, (bu) => checkRow(bu));
  }, [checkRow]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchAllBusinessUnits({ sort: 'code:asc', label: 'DashboardDeploy.bus' });
        if (cancelledRef.current) return;
        setBus(list);
        setLoading(false);
        await refreshAll(list);
      } catch (err) {
        if (cancelledRef.current) return;
        setLoading(false);
        toast.error(t('pages.dashboardTemplates.loadFailed', { detail: getErrorDetail(err, t) }));
      }
    })();
    // โหลดครั้งเดียวตอน mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customizedCount = bus.filter(
    (b) => selected.has(b.code) && deployRowStatusOf(rowState[b.code]) === 'customized',
  ).length;

  const selectOutdated = () =>
    setSelected(new Set(bus.filter((b) => ['outdated', 'never'].includes(deployRowStatusOf(rowState[b.code]))).map((b) => b.code)));

  const toggleOne = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });

  const allSelected = bus.length > 0 && selected.size === bus.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bus.map((b) => b.code)));

  const runDeploy = async () => {
    const targets = bus.filter((b) => selected.has(b.code));
    stopRef.current = false;
    setRunning(true);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    let conflict = false;
    let rejectedDetail: string | null = null;
    await mapWithConcurrency(targets, 3, async (bu) => {
      if (stopRef.current || cancelledRef.current) return;
      const controller = new AbortController();
      controllersRef.current.set(bu.code, controller);
      patchRow(bu.code, { deploying: true, outcome: undefined });
      try {
        const res = await dashboardTemplateService.deploy(bu.code, mode, version, controller.signal);
        if (res.result === 'deployed') ok++;
        else skipped++;
        patchRow(bu.code, {
          outcome: res.result === 'deployed' ? { kind: 'deployed', count: res.count ?? 0 } : { kind: 'skipped' },
        });
        void checkRow(bu);
      } catch (err) {
        if (axios.isCancel(err)) return;
        const status = statusOf(err);
        // 409 = default เปลี่ยนระหว่างรอบ · 422 = backend ปฏิเสธชุด default ว่าง — ทั้งสองหยุดทั้งรอบ
        if (status === 409) {
          conflict = true;
          stopRef.current = true;
        } else if (status === 422) {
          rejectedDetail ??= getErrorDetail(err, t);
          stopRef.current = true;
        }
        failed++;
        patchRow(bu.code, { outcome: { kind: 'error', message: getErrorDetail(err, t) } });
      } finally {
        controllersRef.current.delete(bu.code);
        patchRow(bu.code, { deploying: false });
      }
    });
    if (cancelledRef.current) return;
    setRunning(false);
    if (conflict) toast.error(t('pages.dashboardTemplates.deployConflict'));
    else if (rejectedDetail) toast.error(rejectedDetail);
    else if (failed > 0) toast.warning(t('pages.dashboardTemplates.deployPartial', { ok, skipped, failed }));
    else if (ok === 0) toast.info(t('pages.dashboardTemplates.deployDone', { ok, skipped }));
    else toast.success(t('pages.dashboardTemplates.deployDone', { ok, skipped }));
  };

  const handleDeployClick = () => {
    if (mode === 'overwrite' && customizedCount > 0) setConfirmOpen(true);
    else void runDeploy();
  };

  const handleStop = () => {
    stopRef.current = true;
    controllersRef.current.forEach((c, key) => { if (!key.startsWith(CHECK_PREFIX)) c.abort(); });
  };

  const formatAt = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  };

  if (!hasPermission('dashboard_template.deploy', { clusterId: PLATFORM_SCOPED_RECORD })) return null;

  const busyAny = running || bus.some((b) => rowState[b.code]?.checking);

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">{t('pages.dashboardTemplates.deployHint', { version })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void refreshAll(bus)} disabled={running || loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busyAny && !running ? 'animate-spin' : ''}`} />
              {t('pages.dashboardTemplates.refreshStatus')}
            </Button>
            <Can permission="dashboard_template.deploy" clusterId={PLATFORM_SCOPED_RECORD}>
              <Button variant="outline" size="sm" onClick={selectOutdated} disabled={running}>
                {t('pages.dashboardTemplates.selectOutdated')}
              </Button>
              <fieldset className="flex flex-wrap items-center gap-3 text-sm" disabled={running}>
                <legend className="sr-only">{t('pages.dashboardTemplates.modeLabel')}</legend>
                <span className="text-muted-foreground">{t('pages.dashboardTemplates.modeLabel')}</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="dt-deploy-mode" checked={mode === 'skip_customized'} onChange={() => setMode('skip_customized')} />
                  {t('pages.dashboardTemplates.modeSkip')}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="dt-deploy-mode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
                  {t('pages.dashboardTemplates.modeOverwrite')}
                </label>
              </fieldset>
              {running ? (
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <Square className="mr-2 h-4 w-4" />
                  {t('pages.dashboardTemplates.stop')}
                </Button>
              ) : (
                <Button size="sm" onClick={handleDeployClick} disabled={selected.size === 0}>
                  <Rocket className="mr-2 h-4 w-4" />
                  {t('pages.dashboardTemplates.deployButton', { count: selected.size })}
                </Button>
              )}
            </Can>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label={t('pages.dashboardTemplates.columnBu')}
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={running || bus.length === 0}
                  />
                </TableHead>
                <TableHead>{t('pages.dashboardTemplates.columnBu')}</TableHead>
                <TableHead>{t('pages.dashboardTemplates.columnDeployStatus')}</TableHead>
                <TableHead>{t('pages.dashboardTemplates.columnDeployedVersion')}</TableHead>
                <TableHead>{t('pages.dashboardTemplates.columnDeployedAt')}</TableHead>
                <TableHead>{t('pages.dashboardTemplates.columnCustomizedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}><Loader2 className="h-4 w-4 animate-spin" /></TableCell>
                </TableRow>
              )}
              {bus.map((bu) => {
                const row = rowState[bu.code];
                const s = deployRowStatusOf(row);
                return (
                  <TableRow key={bu.code}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={bu.code}
                        checked={selected.has(bu.code)}
                        onChange={() => toggleOne(bu.code)}
                        disabled={running}
                      />
                    </TableCell>
                    <TableCell>{bu.code} — {bu.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={DEPLOY_BADGE[s]}>{t(STATUS_LABEL_KEY[s])}</Badge>
                        {(row?.checking || row?.deploying) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      </div>
                      {row?.outcome?.kind === 'deployed' && (
                        <p role="status" className="text-xs text-muted-foreground">
                          {t('pages.dashboardTemplates.rowDeployed', { count: row.outcome.count })}
                        </p>
                      )}
                      {row?.outcome?.kind === 'skipped' && (
                        <p role="status" className="text-xs text-muted-foreground">{t('pages.dashboardTemplates.rowSkipped')}</p>
                      )}
                      {row?.outcome?.kind === 'error' && (
                        <p role="alert" className="text-xs text-destructive">{row.outcome.message}</p>
                      )}
                    </TableCell>
                    <TableCell>{row?.status?.deployed_version ?? '—'}</TableCell>
                    <TableCell>{formatAt(row?.status?.deployed_at)}</TableCell>
                    <TableCell>{formatAt(row?.status?.customized_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Can permission="dashboard_template.deploy" clusterId={PLATFORM_SCOPED_RECORD}>
        <OverwriteConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          customizedCount={customizedCount}
          selectedCount={selected.size}
          onConfirm={() => { setConfirmOpen(false); void runDeploy(); }}
        />
      </Can>
    </>
  );
}
