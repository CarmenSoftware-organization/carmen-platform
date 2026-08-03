import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { BuSwitcher } from '../components/BuSwitcher';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import businessUnitService from '../services/businessUnitService';
import preconfigImportService from '../services/preconfigImportService';
import { parseApiError } from '../utils/errorParser';
import type {
  BusinessUnit,
  PreconfigCheckReport,
  PreconfigImportSummary,
  PreconfigStepMeta,
} from '../types';
import { WorkbookDropzone } from './tenantImport/WorkbookDropzone';
import { FileCheckPanel } from './tenantImport/FileCheckPanel';
import { StepRail } from './tenantImport/StepRail';
import { StepPanel, type StepState } from './tenantImport/StepPanel';

type Screen = 'pick-bu' | 'upload' | 'check' | 'steps';

export default function TenantImportWizard() {
  const [screen, setScreen] = useState<Screen>('pick-bu');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buOpen, setBuOpen] = useState(false);
  const [bu, setBu] = useState<BusinessUnit | null>(null);
  const [steps, setSteps] = useState<PreconfigStepMeta[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PreconfigCheckReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [activeId, setActiveId] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      // Independent settle: a rejected step catalog (e.g. `data_import.manage` not yet
      // seeded in this environment) must not take the BU list down with it — the user
      // can still pick a BU even while the catalog fetch fails.
      const [listResult, catalogResult] = await Promise.allSettled([
        businessUnitService.getAll({ perpage: 200 }),
        preconfigImportService.getSteps(),
      ]);

      if (listResult.status === 'fulfilled') {
        setBusinessUnits(listResult.value.data ?? []);
      } else {
        toast.error(parseApiError(listResult.reason).message);
      }

      if (catalogResult.status === 'fulfilled') {
        setSteps(catalogResult.value);
      } else {
        const message = parseApiError(catalogResult.reason).message;
        toast.error(message);
        setCatalogError(message);
      }
    })();
  }, []);

  const handleFile = useCallback(
    async (picked: File) => {
      if (!bu) return;
      setBusy(true);
      try {
        const result = await preconfigImportService.check(bu.id, picked);
        setFile(picked);
        setReport(result);
        // A freshly-checked workbook starts every step over — any preview/summary from a
        // previously loaded file must not leak into this run.
        setStates({});
        setActiveId('');
        setScreen('check');
      } catch (err) {
        toast.error(parseApiError(err).message);
      } finally {
        setBusy(false);
      }
    },
    [bu],
  );

  // Only steps whose sheet is usable enter the rail.
  const readySteps = useMemo(() => {
    if (!report) return [];
    const ok = new Set(report.steps.filter((s) => s.status === 'ready').map((s) => s.step_id));
    return steps.filter((s) => ok.has(s.id));
  }, [report, steps]);

  const patch = useCallback((id: string, next: Partial<StepState>) => {
    setStates((prev) => {
      const current: StepState = prev[id] ?? { status: 'pending', options: {} };
      return { ...prev, [id]: { ...current, ...next } };
    });
  }, []);

  const runPreview = useCallback(
    async (id: string) => {
      if (!bu || !file) return;
      patch(id, { status: 'previewing', error: undefined });
      try {
        const result = await preconfigImportService.preview(bu.id, id, file, states[id]?.options ?? {});
        patch(id, { status: 'previewed', preview: result, rowCount: result.total_rows });
      } catch (err) {
        const message = parseApiError(err).message;
        patch(id, { status: 'error', error: message });
        toast.error(message);
      }
    },
    [bu, file, patch, states],
  );

  const runImport = useCallback(
    async (id: string) => {
      if (!bu || !file) return;
      // Only one step may stream an import at a time — starting a second one here would
      // interleave two NDJSON responses onto the same `states` map and abort the first
      // reader mid-stream. Block instead of silently cancelling the other step's run.
      const anotherRunning = Object.entries(states).some(([sid, s]) => sid !== id && s.status === 'importing');
      if (anotherRunning) {
        toast.error('Another step is still importing — wait for it to finish before starting this one.');
        return;
      }
      if (states[id]?.status === 'importing') return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      patch(id, { status: 'importing', error: undefined, progress: undefined });
      try {
        const summary = await preconfigImportService.importStream(
          bu.id,
          id,
          file,
          states[id]?.options ?? {},
          (event) => {
            if (event.type === 'start') patch(id, { progress: { index: 0, total: event.total } });
            if (event.type === 'progress') patch(id, { progress: { index: event.index, total: event.total } });
          },
          controller.signal,
        );
        patch(id, { status: summary.failed > 0 ? 'error' : 'completed', summary });
        toast.success(`${id}: ${summary.inserted} inserted, ${summary.skipped} skipped`);
      } catch (err) {
        const message = parseApiError(err).message;
        patch(id, { status: 'error', error: message });
        toast.error(message);
      }
    },
    [bu, file, patch, states],
  );

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (screen === 'steps' && !activeId && readySteps.length > 0) setActiveId(readySteps[0].id);
  }, [screen, activeId, readySteps]);

  // A run is "in progress" once a file is loaded and at least one step has been touched
  // but not every touched step has finished.
  const runInProgress = useMemo(() => {
    const touched = Object.values(states);
    if (!file || touched.length === 0) return false;
    return touched.some((s) => s.status !== 'completed' && s.status !== 'skipped');
  }, [file, states]);

  useUnsavedChanges(runInProgress);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Tenant Data Import"
          subtitle="Load Preconfig.xlsx master data into a business unit's database"
          actions={
            <Button variant="outline" onClick={() => setBuOpen(true)}>
              {bu ? `BU: ${bu.code}` : 'Select business unit'}
            </Button>
          }
        />

        <Card>
          <CardContent className="space-y-4 pt-6">
            {screen === 'pick-bu' && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pick the business unit that will receive the data.
                </p>
                <Button onClick={() => setBuOpen(true)}>Select business unit</Button>
              </div>
            )}

            {screen === 'upload' && (
              <>
                {catalogError ? (
                  <div
                    className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The import step catalog could not be loaded ({catalogError}). The wizard cannot
                      proceed until this is fixed — this usually means the platform permission for
                      Preconfig imports has not been granted yet.
                    </span>
                  </div>
                ) : busy ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking workbook…
                  </div>
                ) : (
                  <WorkbookDropzone onFile={handleFile} />
                )}
              </>
            )}

            {screen === 'check' && report && (
              <FileCheckPanel
                report={report}
                steps={steps}
                onContinue={() => setScreen('steps')}
                onReset={() => {
                  setFile(null);
                  setReport(null);
                  setStates({});
                  setActiveId('');
                  setScreen('upload');
                }}
              />
            )}

            {screen === 'steps' && readySteps.length > 0 && activeId && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                  <StepRail steps={readySteps} states={states} activeId={activeId} onSelect={setActiveId} />
                  <StepPanel
                    step={readySteps.find((s) => s.id === activeId) as PreconfigStepMeta}
                    state={states[activeId] ?? { status: 'pending', options: {} }}
                    onPreview={() => runPreview(activeId)}
                    onImport={() => runImport(activeId)}
                    onOptionsChange={(options) => patch(activeId, { options, preview: undefined, status: 'pending' })}
                  />
                </div>

                <div className="rounded-md border p-3 text-sm">
                  <p className="mb-2 font-medium">Run summary</p>
                  {readySteps.filter((s) => states[s.id]?.summary).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No step has been imported yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {readySteps
                        .filter((s) => states[s.id]?.summary)
                        .map((s) => {
                          const sum = states[s.id].summary as PreconfigImportSummary;
                          return (
                            <li key={s.id} className="flex flex-wrap items-center gap-2">
                              <span className="min-w-40">{s.display_name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                +{sum.inserted} · ~{sum.updated} · skip {sum.skipped} · fail {sum.failed}
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => runImport(s.id)}>
                                Re-run
                              </Button>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {process.env.NODE_ENV === 'development' && (
          <DevDebugSheet
            title="Tenant Data Import"
            endpoint="POST /api-system/tenant/preconfig-imports"
            data={{ bu, steps, report, fileName: file?.name, catalogError, states, activeId }}
          />
        )}
      </div>

      <BuSwitcher
        open={buOpen}
        onOpenChange={setBuOpen}
        businessUnits={businessUnits}
        currentCode={bu?.code ?? ''}
        onSelect={(code) => {
          const picked = businessUnits.find((b) => b.code === code) ?? null;
          abortRef.current?.abort();
          setBu(picked);
          setBuOpen(false);
          setFile(null);
          setReport(null);
          setStates({});
          setActiveId('');
          setScreen(picked ? 'upload' : 'pick-bu');
        }}
      />
    </Layout>
  );
}
