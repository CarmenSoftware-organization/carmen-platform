import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { BuSwitcher } from '../components/BuSwitcher';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import businessUnitService from '../services/businessUnitService';
import preconfigImportService from '../services/preconfigImportService';
import { parseApiError } from '../utils/errorParser';
import type { BusinessUnit, PreconfigCheckReport, PreconfigStepMeta } from '../types';
import { WorkbookDropzone } from './tenantImport/WorkbookDropzone';
import { FileCheckPanel } from './tenantImport/FileCheckPanel';

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
        setScreen('check');
      } catch (err) {
        toast.error(parseApiError(err).message);
      } finally {
        setBusy(false);
      }
    },
    [bu],
  );

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
                  setScreen('upload');
                }}
              />
            )}

            {screen === 'steps' && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Stepper arrives in the next task.
              </p>
            )}
          </CardContent>
        </Card>

        {process.env.NODE_ENV === 'development' && (
          <DevDebugSheet
            title="Tenant Data Import"
            endpoint="POST /api-system/tenant/preconfig-imports"
            data={{ bu, steps, report, fileName: file?.name, catalogError }}
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
          setBu(picked);
          setBuOpen(false);
          setFile(null);
          setReport(null);
          setScreen(picked ? 'upload' : 'pick-bu');
        }}
      />
    </Layout>
  );
}
