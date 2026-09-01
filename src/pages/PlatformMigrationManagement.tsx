// src/pages/PlatformMigrationManagement.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Database, RefreshCw, Loader2, Play, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { FetchErrorState } from '../components/FetchErrorState';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import platformMigrationService from '../services/platformMigrationService';
import platformSeedService from '../services/platformSeedService';
import { OpRow } from './platformMigration/OpRow';
import { RunConsole } from './platformMigration/RunConsole';
import { migrationStatusCode } from '../utils/migrationError';
import { parseApiError } from '../utils/errorParser';
import { useI18n } from '../hooks/useI18n';
import type { TFunction } from '../i18n/types';
import type {
  PlatformMigrationStatus,
  PlatformMigrationResolveAction,
  PlatformSeedOp,
  SeedRunEvent,
} from '../types';

/**
 * แปลง error ของ platform-migration API เป็น toast ตามความหมายจริงของรหัส
 * ล้อ handleMigrationError ของฝั่ง tenant แต่ใช้คีย์ข้อความคนละชุด เพราะ 403 ที่นี่
 * เกิดได้จาก env PLATFORM_MIGRATION_API_ENABLED ปิดอยู่ ไม่ใช่แค่เรื่องสิทธิ์ผู้ใช้
 */
const notifyError = (err: unknown, t: TFunction): void => {
  const code = migrationStatusCode(err);
  if (code === 403) {
    toast.error(t('pages.platformMigration.disabledOrSuperAdmin'));
  } else if (code === 409) {
    toast.warning(t('pages.platformMigration.alreadyRunning'));
  } else {
    toast.error(parseApiError(err).message);
  }
};

const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** ชื่อโฟลเดอร์ migration ที่ backend ยอมรับ — ตัวเลข timestamp ตามด้วยชื่อ */
const MIGRATION_NAME_RE = /^[0-9]{6,}_[A-Za-z0-9_-]+$/;

/**
 * `seed-permission` -> `seedPermission` — คีย์ i18n ของ op ตั้งจาก id เพื่อไม่ต้องมีตารางแมปคู่ขนาน
 * ที่จะเพี้ยนจากทะเบียนฝั่ง backend ได้เงียบ ๆ
 */
const opKey = (id: string): string => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** output ดิบจาก prisma ที่ backend sanitize แล้ว — ยุบไว้เพราะยาวและมีค่าเฉพาะตอนสอบสวน */
const RawOutput: React.FC<{ raw?: string; label: string }> = ({ raw, label }) => {
  const [open, setOpen] = useState(false);
  if (!raw) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-[10px] sm:text-xs font-mono whitespace-pre-wrap break-words">
          {raw}
        </pre>
      )}
    </div>
  );
};

export const PlatformMigrationManagement: React.FC = () => {
  const { t } = useI18n();

  const [status, setStatus] = useState<PlatformMigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [migrationName, setMigrationName] = useState('');
  const [resolveAction, setResolveAction] = useState<PlatformMigrationResolveAction>('applied');
  const [resolving, setResolving] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);

  const [catalog, setCatalog] = useState<PlatformSeedOp[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [runningOp, setRunningOp] = useState<string | null>(null);
  const [runLines, setRunLines] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<{ success: boolean; exit_code: number } | null>(null);
  const [confirmOp, setConfirmOp] = useState<PlatformSeedOp | null>(null);

  const fetchStatus = useCallback(async (isRefresh: boolean): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await platformMigrationService.getStatus();
      setStatus(data);
      setLastChecked(nowTime());
      setLoadError(null);
    } catch (err) {
      // 403 ที่นี่คือสถานะถาวรของหน้า (API ปิด หรือไม่ใช่ super-admin) ไม่ใช่ความล้มเหลวชั่วคราว
      // จึงต้องอ่านออกจากตัวหน้าเอง ไม่ใช่ toast ที่หายไปใน 4 วินาที
      const code = migrationStatusCode(err);
      setLoadError(
        code === 403
          ? t('pages.platformMigration.disabledOrSuperAdmin')
          : parseApiError(err).message,
      );
      if (isRefresh) notifyError(err, t);
    }
    // แยก try ของตัวเอง — catalog พังต้องไม่ทำให้ทั้งหน้าพัง สถานะ migration ยังอ่านได้อยู่
    try {
      setCatalog(await platformSeedService.getCatalog());
      setCatalogError(null);
    } catch (err) {
      // นำหน้าด้วยข้อความที่แปลแล้ว แต่คงรายละเอียดดิบไว้ — ผู้อ่านหน้านี้คือ super-admin ที่
      // "Cannot GET /api-system/platform/seeds/catalog" บอกได้ทันทีว่า backend ยังไม่ deploy
      // Localized prefix, raw detail kept: the reader is a super-admin for whom the raw 404
      // immediately says "the backend has not shipped yet".
      setCatalogError(
        `${t('pages.platformMigration.catalogLoadFailed')}: ${parseApiError(err).message}`,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchStatus(false);
  }, [fetchStatus]);

  const handleDeploy = useCallback(async (): Promise<void> => {
    setDeploying(true);
    try {
      const result = await platformMigrationService.deploy();
      const applied = result.applied_migrations ?? [];
      if (result.already_up_to_date || applied.length === 0) {
        toast.info(t('pages.platformMigration.deployNothing'));
      } else {
        toast.success(t('pages.platformMigration.deploySuccess', { count: applied.length }));
      }
      await fetchStatus(false);
    } catch (err) {
      notifyError(err, t);
    } finally {
      setDeploying(false);
    }
  }, [fetchStatus, t]);

  const handleResolve = useCallback(async (): Promise<void> => {
    setResolving(true);
    try {
      await platformMigrationService.resolve(migrationName.trim(), resolveAction);
      toast.success(t('pages.platformMigration.resolveSuccess', { name: migrationName.trim() }));
      setMigrationName('');
      await fetchStatus(false);
    } catch (err) {
      notifyError(err, t);
    } finally {
      setResolving(false);
    }
  }, [fetchStatus, migrationName, resolveAction, t]);

  const runOp = useCallback(async (op: PlatformSeedOp): Promise<void> => {
    setRunningOp(op.id);
    setRunLines([]);
    setRunResult(null);
    try {
      const result = await platformSeedService.runStream(op.id, (e: SeedRunEvent) => {
        if (e.type === 'start') setRunLines((prev) => [...prev, `$ ${e.command}`]);
        if (e.type === 'log') setRunLines((prev) => [...prev, e.line]);
      });
      setRunResult(result);
      if (result.success) {
        toast.success(t('pages.platformMigration.opSucceeded'));
      } else {
        toast.error(t('pages.platformMigration.opFailed', { code: result.exit_code }));
      }
      await fetchStatus(false);
    } catch (err) {
      setRunResult({ success: false, exit_code: -1 });
      notifyError(err, t);
    } finally {
      setRunningOp(null);
    }
  }, [fetchStatus, t]);

  const pending = status?.pending ?? [];
  const hasPending = status?.has_pending === true;
  const upToDate = status?.up_to_date === true;
  const busy = deploying || resolving || runningOp !== null;
  const resolveNameValid = MIGRATION_NAME_RE.test(migrationName.trim());

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.platformMigration.title')}
          subtitle={t('pages.platformMigration.subtitle')}
          actions={
            <Button
              variant="outline"
              onClick={() => void fetchStatus(true)}
              disabled={refreshing || busy}
            >
              {refreshing
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RefreshCw className="mr-2 h-4 w-4" />}
              {t('pages.platformMigration.refresh')}
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* สถานะ */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground shrink-0" />
                  <h2 className="text-sm font-semibold">{t('pages.platformMigration.statusTitle')}</h2>
                  {loadError ? null : hasPending ? (
                    <Badge variant="warning">
                      {t('pages.platformMigration.pendingCount', { count: pending.length })}
                    </Badge>
                  ) : upToDate ? (
                    <Badge variant="success">{t('pages.platformMigration.upToDate')}</Badge>
                  ) : (
                    <Badge variant="secondary">{t('pages.platformMigration.statusUnknown')}</Badge>
                  )}
                  {lastChecked && !loadError && (
                    <span className="text-xs text-muted-foreground">
                      {t('pages.platformMigration.lastChecked', { time: lastChecked })}
                    </span>
                  )}
                </div>

                {loadError ? (
                  <FetchErrorState
                    message={loadError}
                    onRetry={() => void fetchStatus(true)}
                    className="justify-start"
                  />
                ) : (
                  <>
                    {pending.length > 0 && (
                      <ul className="space-y-1">
                        {pending.map((name) => (
                          <li key={name} className="text-xs sm:text-sm font-mono break-all">
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <RawOutput raw={status?.raw} label={t('pages.platformMigration.rawOutput')} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Deploy */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h2 className="text-sm font-semibold">{t('pages.platformMigration.deployTitle')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t('pages.platformMigration.deployDescription')}
                  </p>
                </div>
                <Button
                  onClick={() => setConfirmDeploy(true)}
                  disabled={busy || loadError !== null}
                >
                  {deploying
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Play className="mr-2 h-4 w-4" />}
                  {t('pages.platformMigration.deployButton')}
                </Button>
              </CardContent>
            </Card>

            {/* Resolve — ยุบไว้เป็นค่าเริ่มต้น */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                <button
                  type="button"
                  onClick={() => setResolveOpen((v) => !v)}
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={resolveOpen}
                >
                  {resolveOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold">{t('pages.platformMigration.resolveTitle')}</span>
                </button>

                {resolveOpen && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('pages.platformMigration.resolveDescription')}
                    </p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="migration-name">
                          {t('pages.platformMigration.migrationNameLabel')}
                        </Label>
                        <Input
                          id="migration-name"
                          value={migrationName}
                          onChange={(e) => setMigrationName(e.target.value)}
                          placeholder={t('pages.platformMigration.migrationNamePlaceholder')}
                          className="font-mono text-xs"
                        />
                        {migrationName.trim() !== '' && !resolveNameValid && (
                          <p className="text-xs text-destructive">
                            {t('pages.platformMigration.migrationNameInvalid')}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resolve-action">
                          {t('pages.platformMigration.actionLabel')}
                        </Label>
                        <Select
                          value={resolveAction}
                          onValueChange={(v) => setResolveAction(v as PlatformMigrationResolveAction)}
                        >
                          <SelectTrigger id="resolve-action">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="applied">
                              {t('pages.platformMigration.actionApplied')}
                            </SelectItem>
                            <SelectItem value="rolled-back">
                              {t('pages.platformMigration.actionRolledBack')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmResolve(true)}
                      disabled={busy || !resolveNameValid || loadError !== null}
                    >
                      {resolving
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Wrench className="mr-2 h-4 w-4" />}
                      {t('pages.platformMigration.resolveButton')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {catalogError ? (
              <Card>
                <CardContent className="pt-6">
                  <FetchErrorState
                    message={catalogError}
                    onRetry={() => void fetchStatus(true)}
                    className="justify-start"
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {(['seed', 'check'] as const).map((group) => {
                  const ops = catalog.filter((o) => o.group === group);
                  if (ops.length === 0) return null;
                  return (
                    <Card key={group}>
                      <CardContent className="space-y-2 pt-6">
                        <div>
                          <h2 className="text-sm font-semibold">
                            {group === 'seed'
                              ? t('pages.platformMigration.seedsTitle')
                              : t('pages.platformMigration.checksTitle')}
                          </h2>
                          <p className="text-muted-foreground text-sm">
                            {group === 'seed'
                              ? t('pages.platformMigration.seedsDescription')
                              : t('pages.platformMigration.checksDescription')}
                          </p>
                        </div>
                        <div>
                          {ops.map((op) => (
                            <OpRow
                              key={op.id}
                              op={op}
                              label={t(`pages.platformMigration.ops.${opKey(op.id)}.label` as never)}
                              desc={t(`pages.platformMigration.ops.${opKey(op.id)}.desc` as never)}
                              disabled={busy || loadError !== null}
                              onRun={() => (op.readonly ? void runOp(op) : setConfirmOp(op))}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                <RunConsole
                  opLabel={
                    runningOp
                      ? t(`pages.platformMigration.ops.${opKey(runningOp)}.label` as never)
                      : runResult
                        ? t('pages.platformMigration.consoleLastRun')
                        : null
                  }
                  lines={runLines}
                  running={runningOp !== null}
                  result={runResult}
                />
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeploy}
        onOpenChange={setConfirmDeploy}
        title={t('pages.platformMigration.deployConfirmTitle')}
        description={t('pages.platformMigration.deployConfirmDescription')}
        confirmText={t('pages.platformMigration.deployButton')}
        onConfirm={handleDeploy}
      />

      <ConfirmDialog
        open={confirmResolve}
        onOpenChange={setConfirmResolve}
        title={t('pages.platformMigration.resolveConfirmTitle')}
        description={t('pages.platformMigration.resolveConfirmDescription', {
          name: migrationName.trim(),
          action: resolveAction === 'applied'
            ? t('pages.platformMigration.actionApplied')
            : t('pages.platformMigration.actionRolledBack'),
        })}
        confirmText={t('pages.platformMigration.resolveButton')}
        confirmVariant="destructive"
        onConfirm={handleResolve}
      />

      <ConfirmDialog
        open={confirmOp !== null}
        onOpenChange={(open) => !open && setConfirmOp(null)}
        title={t('pages.platformMigration.opConfirmTitle')}
        description={
          confirmOp?.id === 'check-seat-pool-view'
            ? t('pages.platformMigration.opConfirmSeatPool')
            : t('pages.platformMigration.opConfirmWrite')
        }
        confirmText={t('pages.platformMigration.opRun')}
        confirmVariant="destructive"
        onConfirm={async () => {
          const op = confirmOp;
          setConfirmOp(null);
          if (op) await runOp(op);
        }}
      />

      <DevDebugSheet
        title="Platform Migrations — raw"
        endpoint="/api-system/platform/migrations/status"
        data={status}
      />
    </Layout>
  );
};

export default PlatformMigrationManagement;
