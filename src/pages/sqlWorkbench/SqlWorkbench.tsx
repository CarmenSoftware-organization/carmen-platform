import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { useAuth } from '../../context/AuthContext';
import sqlQueryService from '../../services/sqlQueryService';
import businessUnitService from '../../services/businessUnitService';
import { validateSqlSafety, classifyStatements } from '../../utils/sqlValidator';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import type { BusinessUnit, DbObjectsResponse, SqlExecuteResult } from '../../types';
import { SqlEditor } from './SqlEditor';
import { ResultPanel } from './ResultPanel';
import { DbObjectTree } from './DbObjectTree';
import { ConnectionBar } from './ConnectionBar';
import { BuSwitcher } from '../../components/BuSwitcher';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

// เก็บ TKey ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้
const QUERY_TYPES = [
  { value: 'view', labelKey: 'pages.sqlWorkbench.typeView' },
  { value: 'stored_procedure', labelKey: 'pages.sqlWorkbench.typeProcedure' },
  { value: 'function', labelKey: 'pages.sqlWorkbench.typeFunction' },
] as const satisfies readonly { value: string; labelKey: TKey }[];

type QueryType = 'view' | 'stored_procedure' | 'function';

type LoadedObject = {
  type: 'view' | 'procedure' | 'function';
  schema: string;
  name: string;
} | null;

export default function SqlWorkbench() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('sql_workbench.manage');

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buCode, setBuCode] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const [dbObjects, setDbObjects] = useState<DbObjectsResponse | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(false);

  const [formName, setFormName] = useState('');
  const [formSqlText, setFormSqlText] = useState('');
  const [formQueryType, setFormQueryType] = useState<QueryType>('view');
  const [loadedObject, setLoadedObject] = useState<LoadedObject>(null);
  const [loadingObjectKey, setLoadingObjectKey] = useState<string | null>(null);

  const [executeResult, setExecuteResult] = useState<SqlExecuteResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [confirmSql, setConfirmSql] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState(false);

  // Load the BU list once.
  useEffect(() => {
    let cancelled = false;
    businessUnitService
      .getAll({ perpage: -1 })
      .then((res) => {
        if (!cancelled) setBusinessUnits(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('pages.sqlWorkbench.loadBuFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Always holds the latest selected BU so async handlers can detect a BU switch
  // that happened mid-flight and discard their stale response.
  const buCodeRef = useRef(buCode);
  useEffect(() => {
    buCodeRef.current = buCode;
  }, [buCode]);

  // ⌘B / Ctrl+B toggles the BU switcher — the workbench's primary "jump to tenant".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSwitcherOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedBu = businessUnits.find((b) => b.code === buCode) ?? null;

  // Load db objects whenever the selected BU changes.
  const dbReqSeq = useRef(0);
  const loadDbObjects = useCallback(async (code: string) => {
    if (!code) return;
    const token = ++dbReqSeq.current;
    setDbLoading(true);
    setDbError(false);
    try {
      const data = await sqlQueryService.getDbObjects(code);
      if (token === dbReqSeq.current) setDbObjects(data);
    } catch {
      if (token === dbReqSeq.current) setDbError(true);
    } finally {
      if (token === dbReqSeq.current) setDbLoading(false);
    }
  }, []);

  // When the target BU changes, clear any loaded object / editor / result state so
  // nothing from the previous BU can drive Save/Drop against the new one, then load.
  useEffect(() => {
    setLoadedObject(null);
    setFormName('');
    setFormSqlText('');
    setFormQueryType('view');
    setExecuteResult(null);
    setExecuteError(null);
    setConfirmSql(null); // discard any pending destructive confirm from the previous BU
    setDropConfirm(false); // and any pending drop confirm
    if (buCode) loadDbObjects(buCode);
    else setDbObjects(null);
  }, [buCode, loadDbObjects]);

  const resetResult = () => {
    setExecuteResult(null);
    setExecuteError(null);
  };

  // Holds the in-flight Run request's AbortController so it can be aborted on unmount. This is
  // NOT a user-facing Cancel: aborting only stops the browser from waiting on the response — the
  // query keeps running on the tenant database until it completes or hits its own timeout (see
  // sqlQueryService.executeSql). The controller exists purely to avoid a leaked request /
  // state update after this page is navigated away from.
  const runAbortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      runAbortControllerRef.current?.abort();
    };
  }, []);

  // Re-entry guard: prevents a second run from starting while one is already in flight. The Run
  // button is disabled via `isRunning` while running (SqlEditor.tsx), but the Mod-Enter keymap
  // (SqlEditor.tsx runFromEditor) has no such check and calls onRun regardless — so without this
  // guard a second runSql() call would overwrite runAbortControllerRef with a new
  // AbortController, orphaning the first in-flight request. Aborting on unmount would then only
  // cancel the second run, leaving the first to resolve later and call
  // setExecuteResult/setExecuteError on an unmounted component. A ref (not `isRunning` state) is
  // required because the keymap callback closes over a value that can be stale.
  const runInFlightRef = useRef(false);

  const runSql = async (code: string, sqlToRun: string) => {
    if (runInFlightRef.current) return; // a run is already in flight — ignore the re-entrant trigger
    runInFlightRef.current = true;
    setIsRunning(true);
    resetResult();
    const controller = new AbortController();
    runAbortControllerRef.current = controller;
    try {
      const result = await sqlQueryService.executeSql(code, sqlToRun, controller.signal);
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale result
      setExecuteResult(result);
    } catch (e) {
      if (controller.signal.aborted) return; // aborted on unmount — nothing left to update
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale error
      setExecuteError(e instanceof Error ? e.message : t('pages.sqlWorkbench.executeFailed'));
    } finally {
      if (runAbortControllerRef.current === controller) runAbortControllerRef.current = null;
      if (!controller.signal.aborted) setIsRunning(false);
      runInFlightRef.current = false;
    }
  };

  const handleRun = async (sqlToRun: string) => {
    if (!buCode) {
      toast.error(t('pages.sqlWorkbench.selectBuFirst'));
      return;
    }
    try {
      validateSqlSafety(sqlToRun, { allowMultiple: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.invalidSql'));
      return;
    }
    if (classifyStatements(sqlToRun).destructive) {
      setConfirmSql(sqlToRun);
      return;
    }
    await runSql(buCode, sqlToRun);
  };

  const handleNew = () => {
    setFormName('');
    setFormSqlText('');
    setFormQueryType('view');
    setLoadedObject(null);
    resetResult();
  };

  const handlePickDbObject = async (obj: {
    type: 'view' | 'procedure' | 'function' | 'table';
    schema: string;
    name: string;
  }) => {
    if (!buCode) return;
    if (obj.type === 'table') {
      setFormSqlText(`SELECT * FROM ${obj.name} LIMIT 100;`);
      setLoadedObject(null);
      resetResult();
      return;
    }
    const code = buCode;
    const key = `${obj.type}:${obj.schema}.${obj.name}`;
    setLoadingObjectKey(key);
    try {
      const def = await sqlQueryService.getDefinition(code, obj);
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale definition
      setLoadedObject({ type: obj.type, schema: obj.schema, name: obj.name });
      setFormName(def.name);
      setFormSqlText(def.definition);
      setFormQueryType(
        def.type === 'view' ? 'view' : def.type === 'procedure' ? 'stored_procedure' : 'function',
      );
      resetResult();
      toast.success(`Loaded ${def.type}: ${def.schema}.${def.name}`);
    } catch (e) {
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale error
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.loadDefinitionFailed'));
    } finally {
      setLoadingObjectKey(null);
    }
  };

  const handleSave = async () => {
    if (!buCode) {
      toast.error(t('pages.sqlWorkbench.selectBuFirst'));
      return;
    }
    if (!formSqlText.trim()) {
      toast.error(t('pages.sqlWorkbench.enterSql'));
      return;
    }
    const stripped = formSqlText.trimStart();
    const startsWithCreate =
      /^create\s+(or\s+replace\s+)?(temp(orary)?\s+)?(materialized\s+)?(view|procedure|function)\b/i.test(
        stripped,
      );
    if (formQueryType === 'view' && !formName.trim() && !startsWithCreate) {
      toast.error(t('pages.sqlWorkbench.enterViewName'));
      return;
    }
    try {
      validateSqlSafety(formSqlText, { allowMultiple: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.invalidSql'), { duration: 8000 });
      return;
    }
    setIsSaving(true);
    try {
      const result = await sqlQueryService.saveDdl(buCode, {
        name: formName || undefined,
        sql_text: formSqlText,
        query_type: formQueryType,
      });
      toast.success(
        t('pages.sqlWorkbench.savedToast', {
          type: t(
            formQueryType === 'view'
              ? 'pages.sqlWorkbench.typeView'
              : formQueryType === 'function'
                ? 'pages.sqlWorkbench.typeFunction'
                : 'pages.sqlWorkbench.typeProcedure',
          ),
          name: result.name || t('pages.sqlWorkbench.unnamedObject'),
          schema: result.schema,
        }),
      );
      loadDbObjects(buCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.saveFailed'), { duration: 8000 });
    } finally {
      setIsSaving(false);
    }
  };

  const doDrop = async () => {
    if (!loadedObject || !buCode) return;
    setIsDropping(true);
    try {
      await sqlQueryService.dropObject(buCode, loadedObject);
      toast.success(t('pages.sqlWorkbench.droppedToast', { type: loadedObject.type, name: loadedObject.name }));
      handleNew();
      loadDbObjects(buCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pages.sqlWorkbench.dropFailed'));
    } finally {
      setIsDropping(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.sqlWorkbench.title')}
          subtitle={t('pages.sqlWorkbench.subtitle')}
          actions={
            <>
              {canManage && loadedObject && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setDropConfirm(true)}
                  disabled={isDropping}
                >
                  {isDropping ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 size-4" />
                  )}
                  {t('pages.sqlWorkbench.drop')}
                </Button>
              )}
              {canManage && (
                <Button size="sm" onClick={handleSave} disabled={isSaving || !buCode}>
                  {isSaving ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 size-4" />
                  )}
                  {t('pages.sqlWorkbench.save')}
                </Button>
              )}
            </>
          }
        />

        <ConnectionBar
          bu={selectedBu}
          canWrite={canManage}
          onSwitch={() => setSwitcherOpen(true)}
        />

        <BuSwitcher
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          businessUnits={businessUnits}
          currentCode={buCode}
          onSelect={setBuCode}
        />

        {confirmSql !== null &&
          (() => {
            const c = classifyStatements(confirmSql);
            return (
              <ConfirmDialog
                open
                onOpenChange={(o) => {
                  if (!o) setConfirmSql(null);
                }}
                title={t('pages.sqlWorkbench.destructiveTitle')}
                description={
                  t('pages.sqlWorkbench.destructiveDescription', {
                    keywords: c.destructiveKeywords.join(', '),
                    bu: selectedBu?.code ?? t('pages.sqlWorkbench.tenantFallback'),
                  }) + (c.unguardedWrite ? t('pages.sqlWorkbench.destructiveUnguarded') : '')
                }
                confirmText={t('pages.sqlWorkbench.runAnyway')}
                confirmVariant="destructive"
                onConfirm={async () => {
                  await runSql(buCode, confirmSql);
                  setConfirmSql(null);
                }}
              />
            );
          })()}

        {dropConfirm && loadedObject && (
          <ConfirmDialog
            open
            onOpenChange={(o) => {
              if (!o) setDropConfirm(false);
            }}
            title={t('pages.sqlWorkbench.dropTitle', { type: loadedObject.type })}
            description={t('pages.sqlWorkbench.dropDescription', {
              type: loadedObject.type,
              qualified: `${loadedObject.schema}.${loadedObject.name}`,
              bu: selectedBu?.code ?? t('pages.sqlWorkbench.tenantFallback'),
            })}
            confirmText={t('pages.sqlWorkbench.drop')}
            confirmVariant="destructive"
            onConfirm={async () => {
              await doDrop();
              setDropConfirm(false);
            }}
          />
        )}

        {!buCode ? (
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="text-muted-foreground hover:border-border/80 hover:text-foreground flex w-full items-center justify-center rounded-lg border border-dashed py-16 text-sm transition-colors"
          >
            {t('pages.sqlWorkbench.selectBuToBegin')}
          </button>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-lg border lg:max-h-[calc(100vh-220px)] lg:overflow-hidden">
              <DbObjectTree
                data={dbObjects}
                isLoading={dbLoading}
                isError={dbError}
                onRetry={() => loadDbObjects(buCode)}
                onSelect={handlePickDbObject}
                loadingKey={loadingObjectKey}
              />
            </aside>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="qd-object-name" className="mb-1 block text-xs font-semibold">
                    {t('pages.sqlWorkbench.objectName')}
                  </Label>
                  <Input
                    id="qd-object-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('pages.sqlWorkbench.objectNamePlaceholder')}
                  />
                </div>
                <div>
                  {/* ผูกกับ Select ด้านล่างผ่าน aria-labelledby ไม่ใช่ htmlFor หรือการห่อ */}
                  <Label id="qd-type-label" className="mb-1 block text-xs font-semibold">
                    {t('pages.sqlWorkbench.typeLabel')}
                  </Label>
                  <Select
                    value={formQueryType}
                    onValueChange={(v) => setFormQueryType(v as QueryType)}
                  >
                    <SelectTrigger aria-labelledby="qd-type-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_TYPES.map((qt) => (
                        <SelectItem key={qt.value} value={qt.value}>
                          {t(qt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-end">
                  {loadedObject && (
                    <p className="text-muted-foreground truncate text-xs">
                      {t('pages.sqlWorkbench.editingPrefix')}{' '}
                      <span className="text-foreground">
                        {loadedObject.name}
                      </span>{' '}
                      ({loadedObject.type})
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <Database className="text-muted-foreground size-4" />
                  <span className="text-sm font-semibold">{t('pages.sqlWorkbench.sqlEditor')}</span>
                </div>
                <SqlEditor
                  value={formSqlText}
                  onChange={setFormSqlText}
                  // Run executes arbitrary SQL (incl. DDL/DML) against the tenant DB, same as
                  // Save/Drop below — gate it on the same sql_workbench.manage permission rather
                  // than relying on the backend to reject it. The client cannot reliably tell
                  // SELECT apart from DML/DDL (sqlValidator.ts is explicitly UI-feedback-only,
                  // not a security boundary), so this gates the whole executor rather than
                  // pretending to allow read-only SELECT through a client-side parser. Omitting
                  // onRun makes SqlEditor hide the Run button entirely (mirrors Save/Drop below)
                  // and also disables the Ctrl/⌘+Enter shortcut, since runFromEditor no-ops when
                  // the callback ref is undefined.
                  onRun={canManage ? handleRun : undefined}
                  isRunning={isRunning}
                  schema={dbObjects ?? undefined}
                />
              </div>

              {(isRunning || executeResult || executeError) && (
                <ResultPanel
                  result={executeResult}
                  error={executeError}
                  isRunning={isRunning}
                  onClose={resetResult}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
