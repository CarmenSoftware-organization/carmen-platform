// src/pages/PlatformMigrationManagement.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Database, RefreshCw, Loader2, Play, Wrench, ChevronDown, ChevronRight, ScanSearch, Sprout,
} from 'lucide-react';
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
import businessUnitService from '../services/businessUnitService';
import { BuSwitcher } from '../components/BuSwitcher';
import { OpRow } from './platformMigration/OpRow';
import { RunConsole } from './platformMigration/RunConsole';
import { useRunLog, splitRaw } from './platformMigration/runLog';
import { cn } from '../lib/utils';
import { migrationStatusCode } from '../utils/migrationError';
import { devLog, parseApiError } from '../utils/errorParser';
import { useI18n } from '../hooks/useI18n';
import type { TFunction } from '../i18n/types';
import type {
  BusinessUnit,
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
const errorText = (err: unknown, t: TFunction): string => {
  const code = migrationStatusCode(err);
  if (code === 403) return t('pages.platformMigration.disabledOrSuperAdmin');
  if (code === 409) return t('pages.platformMigration.alreadyRunning');
  return parseApiError(err).message;
};

const notifyError = (err: unknown, t: TFunction): void => {
  const message = errorText(err, t);
  if (migrationStatusCode(err) === 409) toast.warning(message);
  else toast.error(message);
};

const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** ชื่อโฟลเดอร์ migration ที่ backend ยอมรับ — ตัวเลข timestamp ตามด้วยชื่อ */
const MIGRATION_NAME_RE = /^[0-9]{6,}_[A-Za-z0-9_-]+$/;

/**
 * op ที่ไม่ให้กดจากคอนโซลนี้ — backend ยังมีในทะเบียนและยังเรียกจากที่อื่นได้
 *
 * `check-seat-pool-view` เป็นตัวเดียวในกลุ่ม check ที่เขียนแถวจริงบนใบอนุญาตของลูกค้า
 * (ใน transaction ที่ย้อนกลับเสมอ แต่ระหว่างรันมันล็อกแถวไว้จริง) กรองที่นี่แล้วปุ่มหายไป
 * โดยไม่ต้องรอ backend deploy — ถ้าวันหนึ่ง backend ถอดมันออกจาก catalog เอง บรรทัดนี้กลายเป็น
 * no-op ไม่ใช่ของพัง
 */
const HIDDEN_OPS = new Set(['check-seat-pool-view']);

/**
 * op นี้ต้องถาม BU ก่อนรันไหม — ตัดสินจากพารามิเตอร์ที่ทะเบียนประกาศ ไม่ใช่จาก id ของ op
 * ถ้าวันหนึ่งมี op ตัวที่สองที่ทำงานราย BU มันจะได้ dialog เองโดยไม่ต้องแก้ไฟล์นี้
 */
const buParamOf = (op: PlatformSeedOp): string | null =>
  op.params?.find((p) => p.type === 'uuid' && /(^|_)bu(_|$)/.test(p.name))?.name ?? null;

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
  const [confirmOp, setConfirmOp] = useState<PlatformSeedOp | null>(null);

  // op ที่ต้องเลือก BU ก่อน: pickBuFor คือตัวที่ dialog กำลังถามให้ · pickedBus คือคำตอบที่รอยืนยัน
  // (เลือกได้หลายตัว แล้วรันไล่ทีละตัว — ดู runOpBatch)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [pickBuFor, setPickBuFor] = useState<PlatformSeedOp | null>(null);
  const [pickedBus, setPickedBus] = useState<BusinessUnit[]>([]);
  const buLoadedRef = useRef(false);

  // สมุดบันทึกเล่มเดียวของทั้งหน้า — deploy, resolve และทุก op เขียนลงที่นี่
  const { runs, startRun, appendLines, finishRun, clearRuns } = useRunLog();

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
      const ops = (await platformSeedService.getCatalog()).filter((o) => !HIDDEN_OPS.has(o.id));
      setCatalog(ops);
      setCatalogError(null);

      // โหลดรายชื่อ BU เฉพาะเมื่อทะเบียนบอกว่ามี op ที่ต้องถาม และโหลดครั้งเดียวต่อการเปิดหน้า —
      // fetchStatus ถูกเรียกซ้ำหลังทุกการรัน การดึง BU 200 รายการทุกครั้งเป็นการเสียเปล่า
      if (!buLoadedRef.current && ops.some((o) => buParamOf(o))) {
        buLoadedRef.current = true;
        try {
          setBusinessUnits((await businessUnitService.getAll({ perpage: 200 })).data ?? []);
        } catch (err) {
          // ไม่ทำให้ทั้งหน้าพัง — op อื่นยังกดได้ ส่วนตัวที่ต้องเลือก BU จะบอกเองตอนกดว่าไม่มีให้เลือก
          buLoadedRef.current = false;
          devLog('platformSeed:businessUnits', err);
        }
      }
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
    const runId = startRun('deploy', t('pages.platformMigration.deployButton'));
    appendLines(runId, ['$ prisma migrate deploy']);
    try {
      const result = await platformMigrationService.deploy();
      const applied = result.applied_migrations ?? [];
      const raw = splitRaw(result.raw);
      // ถ้า backend ไม่ได้คืน stdout ดิบมา ยังเหลือรายชื่อ migration ที่ลงไปให้อ่านได้
      appendLines(runId, raw.length > 0 ? raw : applied.map((name) => `Applied ${name}`));
      if (result.already_up_to_date || applied.length === 0) {
        appendLines(runId, [t('pages.platformMigration.deployNothing')]);
        toast.info(t('pages.platformMigration.deployNothing'));
      } else {
        const done = t('pages.platformMigration.deploySuccess', { count: applied.length });
        appendLines(runId, [done]);
        toast.success(done);
      }
      finishRun(runId, 'success', 0);
      await fetchStatus(false);
    } catch (err) {
      appendLines(runId, [errorText(err, t)]);
      finishRun(runId, 'failed');
      notifyError(err, t);
    } finally {
      setDeploying(false);
    }
  }, [appendLines, fetchStatus, finishRun, startRun, t]);

  const handleResolve = useCallback(async (): Promise<void> => {
    const name = migrationName.trim();
    setResolving(true);
    const runId = startRun('resolve', `${t('pages.platformMigration.resolveButton')} ${name}`);
    appendLines(runId, [`$ prisma migrate resolve --${resolveAction} ${name}`]);
    try {
      const result = await platformMigrationService.resolve(name, resolveAction);
      appendLines(runId, splitRaw(result.raw));
      const done = t('pages.platformMigration.resolveSuccess', { name });
      appendLines(runId, [done]);
      finishRun(runId, 'success', 0);
      toast.success(done);
      setMigrationName('');
      await fetchStatus(false);
    } catch (err) {
      appendLines(runId, [errorText(err, t)]);
      finishRun(runId, 'failed');
      notifyError(err, t);
    } finally {
      setResolving(false);
    }
  }, [appendLines, fetchStatus, finishRun, migrationName, resolveAction, startRun, t]);

  /**
   * รัน op หนึ่งตัวกับ BU หนึ่งตัว (หรือไม่มี BU เลย) แล้วคืนผลให้ผู้เรียก
   *
   * ตัวนี้ไม่ toast และไม่ fetchStatus เอง เพราะถูกเรียกวนในชุดได้ — ห้าตัวที่รันติดกันต้องได้
   * ข้อความสรุปใบเดียว ไม่ใช่ห้าใบซ้อนกัน หน้าที่นั้นเป็นของ runOpBatch
   */
  const runOnce = useCallback(async (
    op: PlatformSeedOp,
    bu?: BusinessUnit | null,
  ): Promise<{ ok: boolean; exitCode?: number }> => {
    const opLabel = t(`pages.platformMigration.ops.${opKey(op.id)}.label` as never);
    // ป้ายในสมุดต้องบอกด้วยว่ารันกับ BU ไหน — สมุดเก็บหลายรายการ ถ้าเห็นแต่ชื่อ op เหมือนกันสามแถว
    // ก็แยกไม่ออกว่าแถวไหนของ BU ใด
    const buParam = buParamOf(op);
    const runId = startRun(op.group, bu ? `${opLabel} · ${bu.code}` : opLabel);
    try {
      const params = buParam && bu ? { [buParam]: bu.id } : undefined;
      const result = await platformSeedService.runStream(op.id, (e: SeedRunEvent) => {
        if (e.type === 'start') appendLines(runId, [`$ ${e.command}`]);
        if (e.type === 'log') appendLines(runId, [e.line]);
      }, params);
      finishRun(runId, result.success ? 'success' : 'failed', result.exit_code);
      return { ok: result.success, exitCode: result.exit_code };
    } catch (err) {
      appendLines(runId, [errorText(err, t)]);
      finishRun(runId, 'failed');
      // ตัวที่ throw คือตัวที่ล้มก่อนได้ exit code (เช่น 401/422) — บอกรายตัวที่นี่ เพราะข้อความ
      // สรุปท้ายชุดบอกได้แค่จำนวน ไม่ได้บอกว่าพังเพราะอะไร
      notifyError(err, t);
      return { ok: false };
    }
  }, [appendLines, finishRun, startRun, t]);

  /**
   * รัน op กับ BU ที่เลือกไว้ ไล่ทีละตัวตามลำดับ
   *
   * เรียงกันไม่ใช่ขนาน: ปลายทางเป็นสคริปต์ prisma ที่เขียนฐานข้อมูลเดียวกัน ยิงพร้อมกันห้าเส้น
   * คือการเชิญ deadlock มาเอง และ log ที่สตรีมสลับกันก็อ่านไม่ออก
   *
   * ตัวที่ล้มไม่หยุดทั้งชุด — เจตนา: ผู้ใช้เลือกมาห้า BU เพราะอยากให้ครบห้า การหยุดที่ตัวที่สอง
   * ทิ้งงานค้างสามตัวโดยไม่มีใครรู้ ผลรายตัวยังแยกดูได้จากคอนโซล
   */
  const runOpBatch = useCallback(async (op: PlatformSeedOp, bus: BusinessUnit[]): Promise<void> => {
    setRunningOp(op.id);
    try {
      // ไม่มี BU = op ที่ไม่ได้ทำงานราย BU — รันรอบเดียวโดยไม่ส่ง param
      const targets: (BusinessUnit | null)[] = bus.length > 0 ? bus : [null];
      const results: { ok: boolean; exitCode?: number }[] = [];
      for (const bu of targets) {
        results.push(await runOnce(op, bu));
      }

      const okCount = results.filter((r) => r.ok).length;
      const failed = results.length - okCount;
      if (results.length === 1) {
        const only = results[0];
        if (only.ok) toast.success(t('pages.platformMigration.opSucceeded'));
        else if (only.exitCode !== undefined) {
          toast.error(t('pages.platformMigration.opFailed', { code: only.exitCode }));
        }
      } else if (failed === 0) {
        toast.success(t('pages.platformMigration.opBatchSucceeded', { count: okCount }));
      } else if (okCount === 0) {
        toast.error(t('pages.platformMigration.opBatchFailed', { count: failed }));
      } else {
        toast.warning(t('pages.platformMigration.opBatchPartial', { ok: okCount, failed }));
      }

      await fetchStatus(false);
    } finally {
      setRunningOp(null);
    }
  }, [fetchStatus, runOnce, t]);

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
            {/* สถานะกับปุ่มที่แก้มันอยู่ในกรอบเดียวกัน — เดิมแยกสองการ์ด ผู้อ่านจึงเห็นอาการ
                ในใบหนึ่งแล้วต้องเชื่อมเองว่าปุ่มในใบถัดไปคือยาของมัน ขอบซ้ายสีบอกสถานะจากระยะ
                ที่อ่านตัวหนังสือไม่ทัน: อำพัน = มีของค้าง, เขียว = ตามแล้ว, เทา = ไม่รู้ */}
            <Card
              className={cn(
                'border-l-4',
                loadError !== null
                  ? 'border-l-muted-foreground/30'
                  : hasPending
                    ? 'border-l-warning bg-warning/5'
                    : upToDate
                      ? 'border-l-success'
                      : 'border-l-muted-foreground/30',
              )}
            >
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Database className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {t('pages.platformMigration.statusTitle')}
                      </span>
                      {lastChecked && !loadError && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          · {t('pages.platformMigration.lastChecked', { time: lastChecked })}
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-semibold tracking-tight">
                      {loadError !== null || (!hasPending && !upToDate)
                        ? t('pages.platformMigration.statusUnknown')
                        : hasPending
                          ? t('pages.platformMigration.pendingCount', { count: pending.length })
                          : t('pages.platformMigration.upToDate')}
                    </p>
                    {loadError === null && (
                      <p className="text-muted-foreground text-sm">
                        {hasPending
                          ? t('pages.platformMigration.statePending')
                          : upToDate
                            ? t('pages.platformMigration.stateUpToDate')
                            : t('pages.platformMigration.stateUnknown')}
                      </p>
                    )}
                  </div>
                  {/* ปุ่มเดียวที่หน้านี้มีให้กดเมื่อมีของค้าง — เด่นเมื่อมีงานให้ทำ เงียบลงเมื่อไม่มี */}
                  <Button
                    variant={hasPending ? 'default' : 'outline'}
                    className="shrink-0 self-start"
                    onClick={() => setConfirmDeploy(true)}
                    disabled={busy || loadError !== null}
                  >
                    {deploying
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Play className="mr-2 h-4 w-4" />}
                    {t('pages.platformMigration.deployButton')}
                  </Button>
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
                      <ul className="space-y-1 border-t pt-3">
                        {pending.map((name) => (
                          <li key={name} className="font-mono text-xs break-all sm:text-sm">
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
                  const isSeed = group === 'seed';
                  return (
                    /* ขอบซ้ายอำพันติดเฉพาะการ์ดที่เขียนจริง — เดิมทั้งสองใบหน้าตาเหมือนกันเป๊ะ
                       ทั้งที่ใบหนึ่งแตะข้อมูลของทุก cluster ส่วนอีกใบอ่านอย่างเดียว
                       ทำเครื่องหมายที่ของอันตราย ไม่ใช่ที่ของปลอดภัย */
                    <Card key={group} className={isSeed ? 'border-l-4 border-l-warning' : undefined}>
                      <CardContent className="space-y-2 pt-6">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isSeed
                              ? <Sprout className="text-muted-foreground h-4 w-4 shrink-0" />
                              : <ScanSearch className="text-muted-foreground h-4 w-4 shrink-0" />}
                            <h2 className="text-sm font-semibold">
                              {isSeed
                                ? t('pages.platformMigration.seedsTitle')
                                : t('pages.platformMigration.checksTitle')}
                            </h2>
                            {isSeed && (
                              <Badge variant="warning">
                                {t('pages.platformMigration.seedsWrites')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {isSeed
                              ? t('pages.platformMigration.seedsDescription')
                              : t('pages.platformMigration.checksDescription')}
                          </p>
                        </div>
                        <div>
                          {ops.map((op) => (
                            <OpRow
                              key={op.id}
                              op={op}
                              tone={group}
                              label={t(`pages.platformMigration.ops.${opKey(op.id)}.label` as never)}
                              desc={t(`pages.platformMigration.ops.${opKey(op.id)}.desc` as never)}
                              disabled={busy || loadError !== null}
                              needsInput={buParamOf(op) !== null}
                              onRun={() => {
                                // op ที่ต้องการ BU ถามก่อนเสมอ แม้จะเป็น readonly — ไม่มีค่า
                                // ที่จะรันด้วยได้เลยถ้าไม่ถาม
                                if (buParamOf(op)) {
                                  setPickedBus([]);
                                  setPickBuFor(op);
                                } else if (op.readonly) {
                                  void runOpBatch(op, []);
                                } else {
                                  setConfirmOp(op);
                                }
                              }}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}

            {/* คอนโซลอยู่นอกกิ่ง catalogError โดยตั้งใจ — ทะเบียน seed โหลดไม่ขึ้นไม่ได้แปลว่า
                deploy/resolve ใช้ไม่ได้ ผลของสองปุ่มนั้นยังต้องมีที่ลง */}
            <RunConsole runs={runs} running={busy} onClear={clearRuns} />
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
        onOpenChange={(open) => {
          if (!open) {
            setConfirmOp(null);
            setPickedBus([]);
          }
        }}
        title={t('pages.platformMigration.opConfirmTitle')}
        description={
          // หนึ่ง BU ยังใช้ข้อความเดิมที่บอกชื่อเต็ม — ชื่อบอกได้ว่าเลือกถูกตัวไหม ซึ่งรายชื่อรหัส
          // ยาว ๆ ของหลายตัวทำแทนไม่ได้ พอเกินหนึ่งจึงเปลี่ยนเป็นจำนวน + รายการรหัส
          pickedBus.length === 1
            ? t('pages.platformMigration.opConfirmWriteBu', {
              code: pickedBus[0].code,
              name: pickedBus[0].name,
            })
            : pickedBus.length > 1
              ? t('pages.platformMigration.opConfirmWriteBus', {
                count: pickedBus.length,
                codes: pickedBus.map((b) => b.code).join(', '),
              })
              : t('pages.platformMigration.opConfirmWrite')
        }
        confirmText={t('pages.platformMigration.opRun')}
        confirmVariant="destructive"
        onConfirm={async () => {
          const op = confirmOp;
          const bus = pickedBus;
          setConfirmOp(null);
          setPickedBus([]);
          if (op) await runOpBatch(op, bus);
        }}
      />

      {/* เลือก BU ก่อนรัน op ที่ทำงานราย BU — ใช้ตัวเดียวกับ SQL Workbench และหน้านำเข้าข้อมูล
          ผู้ใช้จึงเจอวิธีเลือก BU แบบเดิมทุกที่ */}
      <BuSwitcher
        open={pickBuFor !== null}
        onOpenChange={(open) => { if (!open) setPickBuFor(null); }}
        businessUnits={businessUnits}
        currentCode=""
        multiple
        // โหมด multiple ไม่เรียก onSelect — prop ยังบังคับตาม type ของคอมโพเนนต์ที่หน้าอื่นใช้
        onSelect={() => {}}
        onSelectMany={(codes) => {
          const op = pickBuFor;
          const byCode = new Map(businessUnits.map((b) => [b.code, b]));
          const bus = codes.map((c) => byCode.get(c)).filter((b): b is BusinessUnit => Boolean(b));
          setPickBuFor(null);
          if (!op || bus.length === 0) return;
          setPickedBus(bus);
          if (op.readonly) {
            void runOpBatch(op, bus);
          } else {
            setConfirmOp(op);
          }
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
