# Tenant Migrations on the BU Edit Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tenant Migrations" card to the Business Unit edit page that lets a super-admin check for pending tenant-DB schema migrations and apply them, scoped to one BU.

**Architecture:** A dedicated service (`tenantMigrationService.ts`) wraps the two backend endpoints; a self-contained presentational component (`TenantMigrationCard.tsx`) holds all status/deploy state and UI; `BusinessUnitEdit.tsx` renders it after the form (existing BUs only), passing `isSuperAdmin` and a `hasDbConnection` flag.

**Tech Stack:** React 18 + TypeScript, Axios (`src/services/api.ts`), shadcn/ui (`Card`, `Button`, `Badge`, `ConfirmDialog`, `Tooltip`), lucide-react, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-06-29-tenant-migration-bu-edit-design.md`

## Global Constraints

- **Super-admin only on the backend** (`security: bearer`, 403 = "disabled, missing token, or not a super-admin"). Frontend shows the card to anyone with edit access but **disables the action buttons with a tooltip** when `!isSuperAdmin` or `!hasDbConnection`.
- **Backend resolves the tenant DB from the BU's stored `db_connection`** — the frontend sends only `bu_id` in the path, never connection details.
- **Endpoints (verbatim):**
  - `GET  /api-system/tenant/migrations/${buId}/status`
  - `POST /api-system/tenant/migrations/${buId}/deploy`
- **Response envelope:** unwrap with `response.data.data ?? response.data` (swagger annotates the envelope as `StdResponseMetaDto`; the payload is the migration DTO).
- **Error mapping:** `403` → `toast.error('Migrations are disabled or require super-admin.')`; `409` → `toast.warning('A migration is already running for this BU. Try again shortly.')`; otherwise → `toast.error(parseApiError(err).message)`.
- **No new libraries**; never modify `src/components/ui/` primitives (the new card lives in `src/components/`).
- **No unit-test runner is configured** (Vitest pending). Per-task fast feedback: `bunx tsc --noEmit` (tsconfig.json present). UI behavior is verified manually via `bun start` against the dev backend (`.env.production` / `dev:prod`, which has these endpoints; local `:4000` did not respond during design).
- **No `doc_version` concern** — migration endpoints don't touch the BU record.

---

### Task 1: Types + dedicated service

**Files:**
- Modify: `src/types/index.ts` (add two interfaces after the `BusinessUnit` interface, ~line 151)
- Create: `src/services/tenantMigrationService.ts`

**Interfaces:**
- Consumes: `api` from `./api`.
- Produces:
  - `interface TenantMigrationStatus { bu_id; bu_code; has_pending; pending: string[]; up_to_date; raw }`
  - `interface TenantMigrationDeployResult { bu_id; bu_code; success; already_up_to_date; applied_migrations: string[]; raw }`
  - default export `tenantMigrationService` with `getStatus(buId: string): Promise<TenantMigrationStatus>` and `deploy(buId: string): Promise<TenantMigrationDeployResult>`.

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, immediately after the closing `}` of the `BusinessUnit` interface (the line with `doc_version?: number; // optimistic-lock token (read model)` then `}`), add:

```ts
// Tenant database migration (super-admin) — /api-system/tenant/migrations/:bu_id/*
export interface TenantMigrationStatus {
  bu_id: string;
  bu_code: string;
  has_pending: boolean;
  pending: string[];
  up_to_date: boolean;
  raw: string;
}

export interface TenantMigrationDeployResult {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
  raw: string;
}
```

- [ ] **Step 2: Create the service**

Create `src/services/tenantMigrationService.ts`:

```ts
import api from './api';
import type { TenantMigrationStatus, TenantMigrationDeployResult } from '../types';

// Tenant DB schema migrations for a single BU. Super-admin only (backend enforces
// it; the axios interceptor supplies the bearer token + x-app-id). The backend
// resolves the target tenant DB from the BU's stored db_connection, so we send
// only the bu_id. Responses are unwrapped tolerantly (envelope vs bare DTO).
const tenantMigrationService = {
  getStatus: async (buId: string): Promise<TenantMigrationStatus> => {
    const res = await api.get(`/api-system/tenant/migrations/${buId}/status`);
    return res.data.data ?? res.data;
  },
  deploy: async (buId: string): Promise<TenantMigrationDeployResult> => {
    const res = await api.post(`/api-system/tenant/migrations/${buId}/deploy`);
    return res.data.data ?? res.data;
  },
};

export default tenantMigrationService;
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/tenantMigrationService.ts
git commit -m "feat(business-units): add tenant migration types + service"
```

---

### Task 2: TenantMigrationCard component

**Files:**
- Create: `src/components/TenantMigrationCard.tsx`

**Interfaces:**
- Consumes: `tenantMigrationService` (Task 1), `TenantMigrationStatus` (Task 1), `parseApiError` from `../utils/errorParser`, ui primitives, sonner.
- Produces: default export `TenantMigrationCard` with props
  `{ buId: string; buCode: string; buName: string; hasDbConnection: boolean; isSuperAdmin: boolean }`.

- [ ] **Step 1: Write the component**

Create `src/components/TenantMigrationCard.tsx`:

```tsx
import { useState, type ReactElement } from 'react';
import { Database, Loader2, RefreshCw, Play } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { toast } from 'sonner';
import { parseApiError } from '../utils/errorParser';
import tenantMigrationService from '../services/tenantMigrationService';
import type { TenantMigrationStatus } from '../types';

interface TenantMigrationCardProps {
  buId: string;
  buCode: string;
  buName: string;
  hasDbConnection: boolean;
  isSuperAdmin: boolean;
}

const statusCode = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

const handleMigrationError = (err: unknown) => {
  const code = statusCode(err);
  if (code === 403) {
    toast.error('Migrations are disabled or require super-admin.');
  } else if (code === 409) {
    toast.warning('A migration is already running for this BU. Try again shortly.');
  } else {
    toast.error(parseApiError(err).message);
  }
};

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
    setDeploying(true);
    try {
      const result = await tenantMigrationService.deploy(buId);
      if (result.already_up_to_date || result.applied_migrations.length === 0) {
        toast.info('Already up to date.');
      } else {
        toast.success(`Applied ${result.applied_migrations.length} migration(s) to ${buCode}.`);
      }
      setConfirmOpen(false);
      await fetchStatus();
    } catch (err) {
      handleMigrationError(err);
      setConfirmOpen(false);
    } finally {
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
            <p className="text-sm font-medium">Pending migrations</p>
            <ul className="space-y-1">
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
        description={`Apply ${pending.length} pending migration(s) to ${buName} (${buCode})? This applies schema changes to the tenant database.  ${pending.join('  •  ')}`}
        confirmText="Apply migrations"
        confirmVariant="destructive"
        onConfirm={runDeploy}
      />
    </Card>
  );
};

export default TenantMigrationCard;
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TenantMigrationCard.tsx
git commit -m "feat(business-units): add TenantMigrationCard (status + deploy)"
```

---

### Task 3: Wire into BusinessUnitEdit

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx` (add two imports; pull `isSuperAdmin` from `useAuth`; render the card after the `</form>`, gated `!isNew`)

**Interfaces:**
- Consumes: `TenantMigrationCard` default export (Task 2), `useAuth` from `../context/AuthContext`.
- Produces: nothing.

- [ ] **Step 1: Add imports**

Near the top of `src/pages/BusinessUnitEdit.tsx`, with the other imports, add:

```tsx
import { useAuth } from '../context/AuthContext';
import TenantMigrationCard from '../components/TenantMigrationCard';
```

- [ ] **Step 2: Read `isSuperAdmin` from auth**

Just after the existing `const isNew = !id;` line (~line 184), add:

```tsx
  const { isSuperAdmin } = useAuth();
```

- [ ] **Step 3: Render the card after the form**

Find the closing `</form>` tag (~line 1492). Immediately after it, before the Branding card (`{!isNew && (` ... `<Card>` ... Branding), insert:

```tsx
        {/* Tenant database migrations (existing BU only; super-admin action) */}
        {!isNew && (
          <TenantMigrationCard
            buId={id!}
            buCode={formData.code}
            buName={formData.name}
            hasDbConnection={!!formData.db_connection?.trim()}
            isSuperAdmin={isSuperAdmin}
          />
        )}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `bun run dev:prod` (dev server against the dev backend, which has these endpoints), then open `http://localhost:3304/business-units/72195b8e-d0d0-4816-9937-4d3436deb122/edit` as a super-admin and confirm:
- The "Tenant Migrations" card appears below the form.
- "Check status" fetches status: either a green "Up to date" badge, or a "{n} pending" badge with the migration names listed.
- "Apply N migration(s)" opens a ConfirmDialog naming the BU and migrations → confirm → success toast → status re-fetches and flips to "Up to date".
- "Show raw output" toggles the raw CLI text.
- As a non-super-admin (or on a BU with no `db_connection`): the buttons are disabled and hovering shows the tooltip ("Super-admin required." / "Configure a database connection first.").
- Trigger 409 (deploy while one is running) → warning toast; 403 path → the disabled/super-admin error toast.

- [ ] **Step 6: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx
git commit -m "feat(business-units): render TenantMigrationCard on the edit page"
```

---

## Self-Review

**Spec coverage:**
- Status + Deploy only (no resolve / no 'all') → Tasks 1-2 implement exactly two service methods. ✓
- Dedicated service file → Task 1 (`tenantMigrationService.ts`). ✓
- New card after the form, existing-BU only, on-demand status → Task 2 (no auto-fetch) + Task 3 (`!isNew`, after `</form>`). ✓
- Visible-to-all, disabled+tooltip for non-super-admin / no-db_connection → Task 2 (`disabledReason`, `withTooltip`). ✓
- ConfirmDialog listing pending migrations → Task 2 (`description` includes `pending.join`). ✓
- Re-fetch status after deploy → Task 2 (`runDeploy` calls `fetchStatus`). ✓
- Error mapping 403/409/other → Task 2 (`handleMigrationError`). ✓
- Raw output display → Task 2 (`showRaw`). ✓
- Backend resolves DB from stored `db_connection`; only `bu_id` sent → Task 1 service. ✓
- No `doc_version` → not added anywhere. ✓

**Placeholder scan:** none — full code in every code step; commands carry expected results.

**Type consistency:** `TenantMigrationStatus` / `TenantMigrationDeployResult` (Task 1) match the component's imports and `result.applied_migrations` / `result.already_up_to_date` / `status.pending` / `status.up_to_date` / `status.has_pending` / `status.raw` usage (Task 2). Service method names `getStatus` / `deploy` match call sites. Props passed in Task 3 (`buId`, `buCode`, `buName`, `hasDbConnection`, `isSuperAdmin`) match the `TenantMigrationCardProps` defined in Task 2.
