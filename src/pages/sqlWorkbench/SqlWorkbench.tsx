import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
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
import { PaneDivider } from './PaneDivider';
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

/**
 * Share of the work column the result grid takes when nothing has been dragged. Even, not tilted
 * toward the rows: the frame is only ~440px on a laptop, and a grid that gives back two rows buys
 * an editor four lines. Uniform rows survive a short window far better than code does — and
 * whoever cares can drag once and have it remembered.
 */
const DEFAULT_RESULT_SHARE = 0.5;
const RESULT_SHARE_KEY = 'sqlWorkbench_resultShare';

function readStoredShare(): number {
  try {
    const raw = Number(localStorage.getItem(RESULT_SHARE_KEY));
    // A stored value outside the divider's own bounds is not a preference, it is corruption.
    return Number.isFinite(raw) && raw >= 0.15 && raw <= 0.85 ? raw : DEFAULT_RESULT_SHARE;
  } catch {
    return DEFAULT_RESULT_SHARE;
  }
}

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

  // Editor/result split, remembered per browser — the ratio someone settles on is about how they
  // work, not about the query they happen to be running.
  const splitRef = useRef<HTMLDivElement>(null);
  const [resultShare, setResultShare] = useState(readStoredShare);
  const handleShareChange = (next: number) => {
    setResultShare(next);
    try {
      localStorage.setItem(RESULT_SHARE_KEY, String(next));
    } catch {
      // Private mode or a full quota — the split still works for this session.
    }
  };

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
      {/* A workbench is a tool you sit inside, not a document you scroll: on desktop the frame is
          pinned to the viewport and only its three panes scroll, so the object tree, the SQL you
          are writing and the rows it returned are all on screen at once. Below `lg` the frame
          relaxes back to a normal stacked flow — a 390px column cannot usefully hold three panes. */}
      <div className="flex flex-col gap-4 lg:h-[calc(100dvh-13.5rem)] lg:min-h-[34rem]">
        <PageHeader
          title={t('pages.sqlWorkbench.title')}
          subtitle={t('pages.sqlWorkbench.subtitle')}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-xs">
          <ConnectionBar
            bu={selectedBu}
            canWrite={canManage}
            onSwitch={() => setSwitcherOpen(true)}
          />

          {!buCode ? (
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="text-muted-foreground hover:text-foreground flex min-h-0 flex-1 items-center justify-center px-6 py-16 text-sm transition-colors"
            >
              {t('pages.sqlWorkbench.selectBuToBegin')}
            </button>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside className="flex max-h-[22rem] shrink-0 flex-col overflow-hidden border-b lg:max-h-none lg:w-72 lg:border-r lg:border-b-0">
                <DbObjectTree
                  data={dbObjects}
                  isLoading={dbLoading}
                  isError={dbError}
                  onRetry={() => loadDbObjects(buCode)}
                  onSelect={handlePickDbObject}
                  loadingKey={loadingObjectKey}
                />
              </aside>

              {/* `min-w-0` is load-bearing, not tidiness: a flex item defaults to
                  `min-width: auto`, so a result grid 3500px wide stretches this column to match
                  and the frame's `overflow-hidden` simply cuts the far columns off — no
                  scrollbar, no way to reach them. The chain has to hold all the way down to the
                  grid's own scroller. */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* The object strip: name, type and the two buttons that write them to the
                    database, on one line. These are save-time concerns, not query-time ones — as a
                    three-column card at the top of the pane they were the first thing the eye hit
                    on a page whose everyday job is running a SELECT, and they sat a screen-width
                    away from the Save button they configure. */}
                <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-3 py-2">
                  <Label htmlFor="qd-object-name" className="text-muted-foreground text-xs">
                    {t('pages.sqlWorkbench.objectName')}
                  </Label>
                  <Input
                    id="qd-object-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('pages.sqlWorkbench.objectNamePlaceholder')}
                    className="h-7 w-52 font-mono text-xs"
                  />
                  {/* ผูกกับ Select ผ่าน aria-labelledby ไม่ใช่ htmlFor หรือการห่อ */}
                  <Label id="qd-type-label" className="sr-only">
                    {t('pages.sqlWorkbench.typeLabel')}
                  </Label>
                  <Select
                    value={formQueryType}
                    onValueChange={(v) => setFormQueryType(v as QueryType)}
                  >
                    <SelectTrigger aria-labelledby="qd-type-label" className="h-7 w-40 text-xs">
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

                  <div className="ml-auto flex items-center gap-2">
                    {loadedObject && (
                      <p className="text-muted-foreground hidden min-w-0 truncate text-xs sm:block">
                        {t('pages.sqlWorkbench.editingPrefix')}{' '}
                        <span className="text-foreground font-mono">{loadedObject.name}</span>{' '}
                        ({loadedObject.type})
                      </p>
                    )}
                    {canManage && loadedObject && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-7"
                        onClick={() => setDropConfirm(true)}
                        disabled={isDropping}
                      >
                        {isDropping ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1 size-3.5" />
                        )}
                        {t('pages.sqlWorkbench.drop')}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1 size-3.5" />
                        )}
                        {t('pages.sqlWorkbench.save')}
                      </Button>
                    )}
                  </div>
                </div>

                <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <SqlEditor
                    value={formSqlText}
                    onChange={setFormSqlText}
                    // Run executes arbitrary SQL (incl. DDL/DML) against the tenant DB, same as
                    // Save/Drop above — gate it on the same sql_workbench.manage permission
                    // rather than relying on the backend to reject it. The client cannot reliably
                    // tell SELECT apart from DML/DDL (sqlValidator.ts is explicitly
                    // UI-feedback-only, not a security boundary), so this gates the whole
                    // executor rather than pretending to allow read-only SELECT through a
                    // client-side parser. Omitting onRun makes SqlEditor hide the Run button
                    // entirely (mirrors Save/Drop above) and also disables the Ctrl/⌘+Enter
                    // shortcut, since runFromEditor no-ops when the callback ref is undefined.
                    onRun={canManage ? handleRun : undefined}
                    isRunning={isRunning}
                    schema={dbObjects ?? undefined}
                    grow={1 - resultShare}
                  />

                  <PaneDivider
                    value={resultShare}
                    onChange={handleShareChange}
                    regionRef={splitRef}
                    defaultValue={DEFAULT_RESULT_SHARE}
                  />

                  {/* Always mounted, never conditional: the result pane holds its share of the
                      column whether or not a query has run, so pressing Run resizes nothing and
                      the rows land where the eye is already looking. */}
                  <ResultPanel
                    result={executeResult}
                    error={executeError}
                    isRunning={isRunning}
                    onClose={resetResult}
                    grow={resultShare}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

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
      </div>
    </Layout>
  );
}
