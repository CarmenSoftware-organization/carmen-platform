# Tenant Migration Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single page listing all Business Units with their tenant-migration status, letting a super-admin check (one or all) and apply migrations (per-BU or to all BUs) on demand.

**Architecture:** A new `TenantMigrationManagement` page owns all per-row migration state centrally in a `rowState` map so the "Check all" and "Deploy all" batch actions can coordinate across rows and flip badges live. It loads every BU once and renders them in a client-side `DataTable` (client search/sort/pagination). Status is on-demand (never auto-fetched). Per-BU and all-BU deploys reuse the existing NDJSON streaming service; a small concurrency helper caps the "Check all" fan-out; a shared error helper (extracted from the existing `TenantMigrationCard`) maps 403/409/other to toasts.

**Tech Stack:** React 19 + TypeScript, Vite, TanStack Table v8 (`DataTable` wrapper), shadcn/ui, sonner toasts, Vitest + React Testing Library.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-30-tenant-migration-overview-design.md` — read it before starting.
- Never modify `src/components/ui/` primitives.
- Never use `alert()` / `window.confirm()` — use `toast.*` and `<ConfirmDialog>`.
- Never add a `#` row-index column — `DataTable` adds one itself.
- Status badges use `<Badge variant="success" | "secondary" | "outline" | "destructive">` — never raw green Tailwind.
- Wrap column defs in `useMemo` with correct deps.
- Wrap all debug-only code in `import.meta.env.DEV` (the repo's Management pages use this, not `process.env.NODE_ENV`).
- Catch blocks surface errors to the user (`toast`/inline) — migration calls use the shared `handleMigrationError`.
- No new external libraries.
- Tests: co-locate `*.test.ts(x)` beside source; explicit `vitest` imports (no globals); assert behavior, not snapshots.
- `doc_version` is **not** involved (migrations don't touch the BU record).
- Run the full suite with `bun run test` (one-shot).

---

## File Structure

- **Create** `src/utils/concurrent.ts` — `mapWithConcurrency` (caps "Check all" fan-out).
- **Create** `src/utils/concurrent.test.ts` — unit tests.
- **Create** `src/utils/migrationError.ts` — `handleMigrationError` + `migrationStatusCode` (extracted from the card).
- **Create** `src/utils/migrationError.test.ts` — unit tests.
- **Modify** `src/components/TenantMigrationCard.tsx` — import the shared helper instead of its private copy (no behavior change).
- **Modify** `src/services/tenantMigrationService.ts` — factor the NDJSON reader into a private `streamDeploy`, add `deployAllStream`.
- **Modify** `src/services/tenantMigrationService.test.ts` — add `deployAllStream` tests.
- **Create** `src/pages/TenantMigrationManagement.tsx` — the page (built across Tasks 4–7).
- **Create** `src/pages/TenantMigrationManagement.test.tsx` — page tests (built across Tasks 4–7).
- **Modify** `src/App.tsx` — add the route.
- **Modify** `src/components/Layout.tsx` — add the nav item.

---

### Task 1: `mapWithConcurrency` utility

**Files:**
- Create: `src/utils/concurrent.ts`
- Test: `src/utils/concurrent.test.ts`

**Interfaces:**
- Produces: `mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onSettled?: (item: T, index: number, result: R | undefined, error: unknown) => void): Promise<void>` — runs `fn` over `items` with at most `limit` in flight; calls `onSettled` as each settles; never rejects (per-item errors go to `onSettled`).

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/concurrent.test.ts
import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrent';

describe('mapWithConcurrency', () => {
  it('runs at most `limit` tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    await mapWithConcurrency(items, 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it('calls onSettled with the result for each item', async () => {
    const seen: Array<[number, number | undefined, unknown]> = [];
    await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (n) => n * 10,
      (item, _i, res, err) => seen.push([item, res, err]),
    );
    seen.sort((a, b) => a[0] - b[0]);
    expect(seen).toEqual([[1, 10, undefined], [2, 20, undefined], [3, 30, undefined]]);
  });

  it('surfaces per-item errors via onSettled without rejecting the run', async () => {
    const errors: unknown[] = [];
    await expect(
      mapWithConcurrency(
        [1, 2],
        2,
        async (n) => {
          if (n === 2) throw new Error('boom');
          return n;
        },
        (_item, _i, _res, err) => {
          if (err) errors.push(err);
        },
      ),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, async (n) => n)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/utils/concurrent.test.ts`
Expected: FAIL — `mapWithConcurrency` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/concurrent.ts

/**
 * Run `fn` over `items` with at most `limit` promises in flight. Calls `onSettled`
 * as each item settles (so a UI can update that row immediately). Never rejects —
 * a per-item failure is passed to `onSettled(item, index, undefined, error)`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (item: T, index: number, result: R | undefined, error: unknown) => void,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const result = await fn(items[i], i);
        onSettled?.(items[i], i, result, undefined);
      } catch (err) {
        onSettled?.(items[i], i, undefined, err);
      }
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/utils/concurrent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/concurrent.ts src/utils/concurrent.test.ts
git commit -m "feat(utils): mapWithConcurrency helper for bounded fan-out"
```

---

### Task 2: Shared migration-error helper (extract from the card)

**Files:**
- Create: `src/utils/migrationError.ts`
- Test: `src/utils/migrationError.test.ts`
- Modify: `src/components/TenantMigrationCard.tsx` (lines 9–33 area — remove the private copy, import the shared one)

**Interfaces:**
- Produces: `migrationStatusCode(err: unknown): number | undefined`, `handleMigrationError(err: unknown): void` — 403 → error toast "Migrations are disabled or require super-admin."; 409 → warning toast "A migration is already running. Try again shortly."; else → `toast.error(parseApiError(err).message)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/migrationError.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { handleMigrationError, migrationStatusCode } from './migrationError';
import { toast } from 'sonner';

describe('migrationError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('403 → super-admin error toast', () => {
    handleMigrationError({ response: { status: 403 } });
    expect(toast.error).toHaveBeenCalledWith('Migrations are disabled or require super-admin.');
  });

  it('409 → already-running warning toast', () => {
    handleMigrationError({ response: { status: 409 } });
    expect(toast.warning).toHaveBeenCalledWith('A migration is already running. Try again shortly.');
  });

  it('other status → error toast with a message', () => {
    handleMigrationError({ message: 'boom' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('migrationStatusCode reads response.status', () => {
    expect(migrationStatusCode({ response: { status: 500 } })).toBe(500);
    expect(migrationStatusCode({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/utils/migrationError.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

```ts
// src/utils/migrationError.ts
import { toast } from 'sonner';
import { parseApiError } from './errorParser';

export const migrationStatusCode = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

/** Map a tenant-migration API error to the canonical toast. */
export const handleMigrationError = (err: unknown): void => {
  const code = migrationStatusCode(err);
  if (code === 403) {
    toast.error('Migrations are disabled or require super-admin.');
  } else if (code === 409) {
    toast.warning('A migration is already running. Try again shortly.');
  } else {
    toast.error(parseApiError(err).message);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/utils/migrationError.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor the card to use the shared helper**

In `src/components/TenantMigrationCard.tsx`, delete the private `statusCode` and `handleMigrationError` definitions (the `const statusCode = …` and `const handleMigrationError = …` blocks, roughly lines 21–33), and remove the now-unused `parseApiError` import. Add the import:

```ts
import { handleMigrationError } from '../utils/migrationError';
```

Leave every call site (`handleMigrationError(err)`) unchanged. (The 409 wording loses the "for this BU" suffix — acceptable; no test asserts the message.)

- [ ] **Step 6: Run the card + util tests to verify no regression**

Run: `bun run test -- src/components/TenantMigrationCard.test.tsx src/utils/migrationError.test.ts`
Expected: PASS (card 3 tests + util 4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/utils/migrationError.ts src/utils/migrationError.test.ts src/components/TenantMigrationCard.tsx
git commit -m "refactor(tenant-migration): extract shared handleMigrationError helper"
```

---

### Task 3: `deployAllStream` service method

**Files:**
- Modify: `src/services/tenantMigrationService.ts`
- Test: `src/services/tenantMigrationService.test.ts`

**Interfaces:**
- Consumes: existing `ProgressEvent`, `DeploySummary`, `BatchDeploySummary` types.
- Produces: `tenantMigrationService.deployAllStream(onEvent: (e: ProgressEvent) => void): Promise<DeploySummary>` — POSTs `/api-system/tenant/migrations/all/deploy/stream`, parses NDJSON `ProgressEvent`s, resolves with the terminal `done` summary (a `BatchDeploySummary`). Shares the NDJSON reader with `deployStream`.

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

Add this `describe` block to `src/services/tenantMigrationService.test.ts` (it reuses the `streamFrom` / `okStream` / `makeLocalStorage` helpers already defined at the top of that file):

```ts
describe('tenantMigrationService.deployAllStream', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("POSTs the all-BU stream endpoint and parses per-BU + batch events", async () => {
    const events: ProgressEvent[] = [
      { type: 'start', bu_id: 'all', bu_code: 'ALL', total: 2 },
      { type: 'bu-complete', bu_id: 'b1', bu_code: 'B1', success: true, applied: ['m1'], already_up_to_date: false },
      { type: 'bu-complete', bu_id: 'b2', bu_code: 'B2', success: true, applied: [], already_up_to_date: true },
      { type: 'done', success: true, summary: { total: 2, succeeded: 2, failed: 0, results: [] } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson]) as never);

    const seen: ProgressEvent[] = [];
    const summary = await tenantMigrationService.deployAllStream((e) => seen.push(e));

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/migrations/all/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'all', bu_code: 'ALL', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'batch failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantMigrationService.deployAllStream(() => {})).rejects.toThrow(/batch failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/services/tenantMigrationService.test.ts`
Expected: FAIL — `deployAllStream` is not a function.

- [ ] **Step 3: Refactor the reader + add the method**

In `src/services/tenantMigrationService.ts`, replace the `deployStream` method with a shared private `streamDeploy` and two public wrappers. The NDJSON reader body is unchanged — only the target `buId` becomes a parameter (`'all'` for the batch case). Update the imports to include `DeploySummary` (already imported) — no new types needed.

```ts
  /**
   * Shared NDJSON streamer. `buId` is a real BU id for a single deploy, or 'all'
   * for the batch deploy of every BU. Uses fetch (not EventSource) so it can send
   * the bearer token + x-app-id. Rejects on a pre-stream HTTP error or a terminal
   * error event; resolves with the terminal `done` summary.
   */
  _streamDeploy: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
  ): Promise<DeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/migrations/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Deploy stream failed (${res.status})`);
    }

    if (!res.body) throw new Error('Deploy stream: response body is null');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: DeploySummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as ProgressEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') summary = event.summary;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer); // flush any trailing line

    if (!summary) throw new Error('Deploy stream ended without a result');
    return summary;
  },

  /** Stream a single-BU deploy as NDJSON ProgressEvents. */
  deployStream: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
  ): Promise<DeploySummary> => tenantMigrationService._streamDeploy(buId, onEvent),

  /** Stream a deploy of ALL BUs (bu_id='all') as NDJSON ProgressEvents. */
  deployAllStream: async (
    onEvent: (e: ProgressEvent) => void,
  ): Promise<DeploySummary> => tenantMigrationService._streamDeploy('all', onEvent),
```

> Note: `deployStream`/`deployAllStream` call `tenantMigrationService._streamDeploy(...)` by name (the object is referenced after definition at call time, so the self-reference is safe). Keep `getStatus` and `deploy` exactly as they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/services/tenantMigrationService.test.ts`
Expected: PASS — the original `deployStream` tests (4) plus the new `deployAllStream` tests (2).

- [ ] **Step 5: Commit**

```bash
git add src/services/tenantMigrationService.ts src/services/tenantMigrationService.test.ts
git commit -m "feat(tenant-migration): deployAllStream service method (bu_id=all)"
```

---

### Task 4: Page scaffold — load BUs + client-side table + summary + CSV + debug

**Files:**
- Create: `src/pages/TenantMigrationManagement.tsx`
- Test: `src/pages/TenantMigrationManagement.test.tsx`

**Interfaces:**
- Consumes: `businessUnitService.getAll`, `generateCSV`/`downloadCSV`, `DataTable`, `EmptyState`, `TableSkeleton`, `useAuth`, `mapWithConcurrency` (later tasks), `handleMigrationError` (later tasks).
- Produces (module-internal, used by Tasks 5–7): `RowState`, `BatchProgress` types; `rowStatusOf(rs?: RowState): RowStatus`; `nowTime(): string`; `withTooltip(el, reason)`; component state `bus`, `rowState`, `searchTerm`. Default export `TenantMigrationManagement`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/TenantMigrationManagement.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/KeyboardShortcuts', () => ({ useGlobalShortcuts: () => {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/businessUnitService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deployStream: vi.fn(), deployAllStream: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import TenantMigrationManagement from './TenantMigrationManagement';
import businessUnitService from '../services/businessUnitService';
import tenantMigrationService from '../services/tenantMigrationService';
import { useAuth } from '../context/AuthContext';

const BUS = [
  { id: 'b1', code: 'BU01', name: 'Hotel One', is_active: true },
  { id: 'b2', code: 'BU02', name: 'Hotel Two', is_active: true },
];

const renderPage = () => render(<MemoryRouter><TenantMigrationManagement /></MemoryRouter>);

describe('TenantMigrationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
    vi.mocked(businessUnitService.getAll).mockResolvedValue({ data: BUS } as never);
  });

  it('renders a row per BU with Unknown status and does NOT fetch status on load', async () => {
    renderPage();
    expect(await screen.findByText('BU01')).toBeInTheDocument();
    expect(screen.getByText('Hotel Two')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(2);
    expect(tenantMigrationService.getStatus).not.toHaveBeenCalled();
  });

  it('shows an Export button once BUs are loaded', async () => {
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the page scaffold**

```tsx
// src/pages/TenantMigrationManagement.tsx
import React, { useState, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import businessUnitService from '../services/businessUnitService';
import { getErrorDetail } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { Search, X, Download, Code, Copy, Check, Database } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessUnit, TenantMigrationStatus } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

type RowStatus = 'unknown' | 'up_to_date' | 'pending' | 'error';

export interface RowState {
  status?: TenantMigrationStatus;
  checking: boolean;
  deploying: boolean;
  progress?: { applied: number; total: number; current: string | null };
  lastChecked?: string;
  errorMsg?: string;
}

export interface BatchProgress {
  applied: number;
  total: number;
  current: string | null;
  buCode: string | null;
  log: string[];
}

const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const rowStatusOf = (rs?: RowState): RowStatus => {
  if (!rs) return 'unknown';
  if (rs.errorMsg) return 'error';
  if (!rs.status) return 'unknown';
  if (rs.status.up_to_date) return 'up_to_date';
  if (rs.status.has_pending) return 'pending';
  return 'unknown';
};

const STATUS_BADGE: Record<RowStatus, { variant: 'success' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  up_to_date: { variant: 'success', label: 'Up to date' },
  pending: { variant: 'secondary', label: 'Pending' },
  unknown: { variant: 'outline', label: 'Unknown' },
  error: { variant: 'destructive', label: 'Error' },
};

// Wrap a (possibly disabled) button so its tooltip still fires — Radix tooltips
// don't fire over a disabled button, so the trigger wraps a focusable span.
const withTooltip = (el: ReactElement, reason: string | null): ReactElement =>
  reason ? (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <span tabIndex={0}>{el}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    el
  );

const TenantMigrationManagement: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const disabledReason = !isSuperAdmin ? 'Super-admin required.' : null;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: 1000, sort: 'code:asc' });
        setRawResponse(data);
        const items = (data.data || data) as BusinessUnit[];
        setBus(Array.isArray(items) ? items : []);
        setError('');
      } catch (err) {
        setError('Failed to load business units: ' + getErrorDetail(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopyJson = (d: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(d, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = useMemo(() => {
    const acc = { up_to_date: 0, pending: 0, unknown: 0, error: 0 };
    for (const bu of bus) acc[rowStatusOf(rowState[bu.id])]++;
    return acc;
  }, [bus, rowState]);

  const handleExport = () => {
    const rows = bus.map((bu) => {
      const rs = rowState[bu.id];
      return {
        code: bu.code,
        name: bu.name,
        status: rowStatusOf(rs),
        pending: rs?.status?.pending?.length ?? 0,
        last_checked: rs?.lastChecked ?? '',
      };
    });
    const csv = generateCSV(rows, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
      { key: 'pending', label: 'Pending' },
      { key: 'last_checked', label: 'Last Checked' },
    ]);
    downloadCSV(csv, `tenant-migrations-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span>{row.original.name}</span> },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        const st = rowStatusOf(rs);
        const badge = STATUS_BADGE[st];
        return (
          <div className="space-y-1">
            <Badge variant={badge.variant}>
              {st === 'pending' ? `${rs?.status?.pending.length ?? 0} pending` : badge.label}
            </Badge>
            {rs?.deploying && rs.progress && (
              <div className="break-all font-mono text-xs text-muted-foreground">
                Applying {rs.progress.applied}/{rs.progress.total}
                {rs.progress.current ? ` · ${rs.progress.current}` : ''}
              </div>
            )}
            {rs?.errorMsg && <div className="break-all text-xs text-destructive">{rs.errorMsg}</div>}
          </div>
        );
      },
    },
    {
      id: 'pending',
      header: 'Pending',
      enableSorting: false,
      meta: { cellClassName: 'text-center' },
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        return <span className="text-muted-foreground">{rs?.status ? rs.status.pending.length : '–'}</span>;
      },
    },
    {
      id: 'last_checked',
      header: 'Last checked',
      enableSorting: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        return <span className="text-xs text-muted-foreground">{rs?.lastChecked ?? '–'}</span>;
      },
    },
  ], [rowState]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tenant Migrations</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              Check and apply database schema migrations across all business units
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || bus.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Summary:</span>
          <Badge variant="success">Up to date {summary.up_to_date}</Badge>
          <Badge variant="secondary">Pending {summary.pending}</Badge>
          <Badge variant="outline">Unknown {summary.unknown}</Badge>
          {summary.error > 0 && <Badge variant="destructive">Error {summary.error}</Badge>}
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search business units..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search business units"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
                {error}
              </div>
            )}

            {!error && bus.length === 0 && !loading ? (
              <EmptyState
                icon={Database}
                title="No business units"
                description="Create a business unit first to manage its tenant migrations."
              />
            ) : !error ? (
              loading && bus.length === 0 ? (
                <TableSkeleton columns={5} rows={6} />
              ) : (
                <DataTable
                  columns={columns}
                  data={bus}
                  globalFilter={searchTerm}
                  onGlobalFilterChange={setSearchTerm}
                  pageSize={25}
                  defaultSort={{ id: 'code', desc: false }}
                />
              )
            ) : null}
          </CardContent>
        </Card>
      </div>

      {import.meta.env.DEV && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">GET /api-system/business-units</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default TenantMigrationManagement;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/TenantMigrationManagement.test.tsx
git commit -m "feat(tenant-migration): overview page scaffold (list + summary + CSV + debug)"
```

---

### Task 5: Check all + per-row Check + summary updates

**Files:**
- Modify: `src/pages/TenantMigrationManagement.tsx`
- Test: `src/pages/TenantMigrationManagement.test.tsx`

**Interfaces:**
- Consumes: `tenantMigrationService.getStatus`, `mapWithConcurrency`, `handleMigrationError`, `getErrorDetail`, `nowTime`, `withTooltip`, `disabledReason`.
- Produces: `checkOne(bu: BusinessUnit): Promise<void>`, `checkAll(): Promise<void>`, state `checkingAll`. Adds an actions column with a per-row Check button and a header "Check all" button.

- [ ] **Step 1: Write the failing test (append inside the describe block)**

```tsx
  it('Check all fetches status for every BU and updates badges + summary', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.getStatus).mockImplementation(async (id: string) =>
      id === 'b1'
        ? ({ bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never)
        : ({ bu_id: 'b2', bu_code: 'BU02', up_to_date: false, has_pending: true, pending: ['m1', 'm2'], raw: '' } as never),
    );
    renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getByRole('button', { name: /check all/i }));

    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(await screen.findByText('2 pending')).toBeInTheDocument();
    expect(tenantMigrationService.getStatus).toHaveBeenCalledTimes(2);
  });

  it('per-row Check fetches just that BU', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.getStatus).mockResolvedValue(
      { bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never,
    );
    renderPage();
    await screen.findByText('BU01');
    const checkButtons = screen.getAllByRole('button', { name: /^check$/i });
    await user.click(checkButtons[0]);
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(tenantMigrationService.getStatus).toHaveBeenCalledTimes(1);
  });
```

Add `import userEvent from '@testing-library/user-event';` at the top of the test file (next to the other imports) if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: FAIL — no "Check all" / "Check" buttons.

- [ ] **Step 3: Add imports, handlers, and buttons**

In `src/pages/TenantMigrationManagement.tsx`:

(a) Extend the imports:
```ts
import { useCallback } from 'react'; // merge into the existing react import
import tenantMigrationService from '../services/tenantMigrationService';
import { handleMigrationError } from '../utils/migrationError';
import { mapWithConcurrency } from '../utils/concurrent';
import { RefreshCw, Loader2 } from 'lucide-react'; // merge into the existing lucide-react import
import type { BusinessUnit } from '../types'; // already imported
```
(Merge the new named imports into the existing `react` and `lucide-react` import lines; add the three new module imports.)

(b) Add state below `const [copied, setCopied] = useState(false);`:
```ts
  const [checkingAll, setCheckingAll] = useState(false);
```

(c) Add the handlers below `disabledReason` (use `useCallback` so the columns memo stays stable):
```ts
  const checkOne = useCallback(async (bu: BusinessUnit) => {
    setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], checking: true } }));
    try {
      const status = await tenantMigrationService.getStatus(bu.id);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], status, checking: false, lastChecked: nowTime(), errorMsg: undefined },
      }));
    } catch (err) {
      handleMigrationError(err);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err), lastChecked: nowTime() },
      }));
    }
  }, []);

  const checkAll = useCallback(async () => {
    setCheckingAll(true);
    setRowState((prev) => {
      const next = { ...prev };
      for (const bu of bus) next[bu.id] = { ...next[bu.id], checking: true };
      return next;
    });
    await mapWithConcurrency(
      bus,
      4,
      (bu) => tenantMigrationService.getStatus(bu.id),
      (bu, _i, result, err) => {
        setRowState((prev) => ({
          ...prev,
          [bu.id]: err
            ? { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err), lastChecked: nowTime() }
            : { ...prev[bu.id], status: result, checking: false, lastChecked: nowTime(), errorMsg: undefined },
        }));
      },
    );
    setCheckingAll(false);
  }, [bus]);
```
(Per-item errors in `checkAll` set the row's `errorMsg` only — no toast spam; `checkOne` toasts.)

(d) Add the "Check all" button in the header actions `<div>` (before the Export button):
```tsx
            {withTooltip(
              <Button
                variant="outline"
                size="sm"
                onClick={checkAll}
                disabled={!!disabledReason || checkingAll || bus.length === 0}
              >
                {checkingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {checkingAll ? 'Checking...' : 'Check all'}
              </Button>,
              disabledReason,
            )}
```

(e) Add an actions column as the LAST entry in the `columns` array (after `last_checked`):
```tsx
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-40', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const busy = !!rs?.checking || !!rs?.deploying;
        return (
          <div className="flex items-center justify-end gap-2">
            {withTooltip(
              <Button variant="outline" size="sm" onClick={() => checkOne(bu)} disabled={!!disabledReason || busy}>
                {rs?.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Check
              </Button>,
              disabledReason,
            )}
          </div>
        );
      },
    },
```

(f) Update the `columns` useMemo deps to: `[rowState, disabledReason, checkOne]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/TenantMigrationManagement.test.tsx
git commit -m "feat(tenant-migration): Check all + per-row status check"
```

---

### Task 6: Per-row Apply with streaming inline progress

**Files:**
- Modify: `src/pages/TenantMigrationManagement.tsx`
- Test: `src/pages/TenantMigrationManagement.test.tsx`

**Interfaces:**
- Consumes: `tenantMigrationService.deployStream`, `ProgressEvent`, `ConfirmDialog`, `checkOne` (from Task 5).
- Produces: `applyOne(bu: BusinessUnit): Promise<void>`, state `applyTarget`. Adds an Apply button (shown when `has_pending`) + its ConfirmDialog.

- [ ] **Step 1: Write the failing test (append inside the describe block)**

```tsx
  it('per-row Apply streams progress then re-checks the row', async () => {
    const user = userEvent.setup();
    // first check → pending; after deploy re-check → up to date
    vi.mocked(tenantMigrationService.getStatus)
      .mockResolvedValueOnce({ bu_id: 'b1', bu_code: 'BU01', up_to_date: false, has_pending: true, pending: ['m1', 'm2'], raw: '' } as never)
      .mockResolvedValue({ bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never);
    vi.mocked(tenantMigrationService.deployStream).mockImplementation(async (_id, onEvent) => {
      onEvent({ type: 'start', bu_id: 'b1', bu_code: 'BU01', total: 2 });
      onEvent({ type: 'applying', bu_id: 'b1', bu_code: 'BU01', name: 'm1', index: 1, total: 2 });
      onEvent({ type: 'applying', bu_id: 'b1', bu_code: 'BU01', name: 'm2', index: 2, total: 2 });
      return { bu_id: 'b1', bu_code: 'BU01', success: true, already_up_to_date: false, applied_migrations: ['m1', 'm2'] } as never;
    });

    renderPage();
    await screen.findByText('BU01');
    const checkButtons = screen.getAllByRole('button', { name: /^check$/i });
    await user.click(checkButtons[0]);                                  // → pending, Apply appears
    await user.click(await screen.findByRole('button', { name: /^apply$/i }));
    await user.click(await screen.findByRole('button', { name: /apply migrations/i })); // confirm

    expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('b1', expect.any(Function));
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: FAIL — no Apply button.

- [ ] **Step 3: Add imports, handler, button, and ConfirmDialog**

In `src/pages/TenantMigrationManagement.tsx`:

(a) Extend imports:
```ts
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Play } from 'lucide-react'; // merge into the existing lucide-react import
import type { ProgressEvent } from '../types'; // merge into the existing types import
```

(b) Add state next to `checkingAll`:
```ts
  const [applyTarget, setApplyTarget] = useState<BusinessUnit | null>(null);
```

(c) Add the handler after `checkAll`:
```ts
  const applyOne = useCallback(async (bu: BusinessUnit) => {
    setApplyTarget(null);
    setRowState((prev) => ({
      ...prev,
      [bu.id]: {
        ...prev[bu.id],
        deploying: true,
        progress: { applied: 0, total: prev[bu.id]?.status?.pending.length ?? 0, current: null },
        errorMsg: undefined,
      },
    }));
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: 0, total: e.total, current: null } } }));
        } else if (e.type === 'applying') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { applied: e.index, total: e.total, current: e.name } } }));
        }
      };
      const result = await tenantMigrationService.deployStream(bu.id, onEvent);
      const applied = 'applied_migrations' in result ? result.applied_migrations : [];
      if (applied.length === 0) toast.info('Already up to date.');
      else toast.success(`Applied ${applied.length} migration(s) to ${bu.code}.`);
      setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined } }));
      await checkOne(bu);
    } catch (err) {
      handleMigrationError(err);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], deploying: false, progress: undefined, errorMsg: getErrorDetail(err) },
      }));
    }
  }, [checkOne]);
```

(d) In the actions cell, add the Apply button after the Check button (still inside the same `<div>`):
```tsx
            {rs?.status?.has_pending &&
              withTooltip(
                <Button variant="destructive" size="sm" onClick={() => setApplyTarget(bu)} disabled={!!disabledReason || busy}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Apply
                </Button>,
                disabledReason,
              )}
```

(e) Update the `columns` useMemo deps to: `[rowState, disabledReason, checkOne]` (unchanged — `setApplyTarget` is stable; `applyOne` is referenced only by the ConfirmDialog below, not the columns).

(f) Add the ConfirmDialog just before the debug `Sheet` block (after the closing `</div>` of the page content, inside `<Layout>`):
```tsx
      <ConfirmDialog
        open={applyTarget !== null}
        onOpenChange={(open) => { if (!open) setApplyTarget(null); }}
        title="Apply tenant migrations"
        description={
          applyTarget
            ? `Apply ${rowState[applyTarget.id]?.status?.pending.length ?? 0} pending migration(s) to ${applyTarget.name} (${applyTarget.code})? This applies schema changes to the tenant database and cannot be undone.`
            : ''
        }
        confirmText="Apply migrations"
        confirmVariant="destructive"
        onConfirm={() => (applyTarget ? applyOne(applyTarget) : undefined)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/TenantMigrationManagement.test.tsx
git commit -m "feat(tenant-migration): per-row Apply with streaming inline progress"
```

---

### Task 7: Deploy all (batch panel + live row flips) + super-admin gating test

**Files:**
- Modify: `src/pages/TenantMigrationManagement.tsx`
- Test: `src/pages/TenantMigrationManagement.test.tsx`

**Interfaces:**
- Consumes: `tenantMigrationService.deployAllStream`, `ProgressEvent`, `BatchDeploySummary`, `BatchProgress`.
- Produces: `deployAll(): Promise<void>`, state `batch`, `confirmAll`, derived `anyBusy`. Adds a header "Deploy all" button, the batch progress panel, and its ConfirmDialog.

- [ ] **Step 1: Write the failing tests (append inside the describe block)**

```tsx
  it('Deploy all streams batch events, flips rows live, and toasts the summary', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.deployAllStream).mockImplementation(async (onEvent) => {
      onEvent({ type: 'start', bu_id: 'all', bu_code: 'ALL', total: 2 });
      onEvent({ type: 'bu-complete', bu_id: 'b1', bu_code: 'BU01', success: true, applied: ['m1'], already_up_to_date: false });
      onEvent({ type: 'bu-complete', bu_id: 'b2', bu_code: 'BU02', success: true, applied: [], already_up_to_date: true });
      return { total: 2, succeeded: 2, failed: 0, results: [] } as never;
    });

    renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getByRole('button', { name: /deploy all/i }));            // header button
    await user.click(await screen.findByRole('button', { name: /^deploy all$/i, hidden: false })); // confirm (dialog)

    // both rows flip to up to date from the bu-complete events
    expect(await screen.findAllByText('Up to date')).toHaveLength(2);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Deployed: 2 ok, 0 failed.');
  });

  it('disables all action buttons for a non-super-admin', async () => {
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: false } as never);
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /check all/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deploy all/i })).toBeDisabled();
    for (const btn of screen.getAllByRole('button', { name: /^check$/i })) {
      expect(btn).toBeDisabled();
    }
  });
```

> Note: the confirm dialog's button label is "Deploy all" — same text as the header button. The test clicks the header button first, then the dialog button (the second match). If the role query is ambiguous, scope the second click with `within(await screen.findByRole('dialog'))`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: FAIL — no "Deploy all" button.

- [ ] **Step 3: Add imports, derived flag, handler, button, panel, ConfirmDialog**

In `src/pages/TenantMigrationManagement.tsx`:

(a) Extend the types import:
```ts
import type { BusinessUnit, TenantMigrationStatus, ProgressEvent, BatchDeploySummary } from '../types';
```

(b) Add state near `applyTarget`:
```ts
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
```

(c) Add a derived busy flag below the state (after `disabledReason`):
```ts
  const anyBusy =
    checkingAll ||
    batch !== null ||
    Object.values(rowState).some((r) => r.checking || r.deploying);
```

(d) Add the handler after `applyOne`:
```ts
  const deployAll = useCallback(async () => {
    setConfirmAll(false);
    setBatch({ applied: 0, total: 0, current: null, buCode: null, log: [] });
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') {
          setBatch((b) => (b ? { ...b, total: e.total, buCode: e.bu_code, applied: 0, current: null } : b));
        } else if (e.type === 'applying') {
          setBatch((b) => (b ? { ...b, applied: e.index, total: e.total, current: e.name, buCode: e.bu_code } : b));
        } else if (e.type === 'bu-complete') {
          const line = `${e.bu_code}: ${e.error ? 'failed' : e.already_up_to_date ? 'up to date' : `applied ${e.applied.length}`}`;
          setBatch((b) => (b ? { ...b, log: [...b.log, line] } : b));
          setRowState((prev) => ({
            ...prev,
            [e.bu_id]: e.error
              ? { ...prev[e.bu_id], checking: false, deploying: false, progress: undefined, errorMsg: e.error, lastChecked: nowTime() }
              : {
                  ...prev[e.bu_id],
                  checking: false,
                  deploying: false,
                  progress: undefined,
                  errorMsg: undefined,
                  lastChecked: nowTime(),
                  status: { bu_id: e.bu_id, bu_code: e.bu_code, has_pending: false, pending: [], up_to_date: true, raw: '' },
                },
          }));
        } else if (e.type === 'log') {
          setBatch((b) => (b ? { ...b, log: [...b.log, e.message] } : b));
        }
      };
      const result = await tenantMigrationService.deployAllStream(onEvent);
      if (result && 'succeeded' in result) {
        const s = result as BatchDeploySummary;
        const msg = `Deployed: ${s.succeeded} ok, ${s.failed} failed.`;
        if (s.failed > 0) toast.warning(msg);
        else toast.success(msg);
      } else {
        toast.success('Deploy completed.');
      }
    } catch (err) {
      handleMigrationError(err);
    } finally {
      setBatch(null);
    }
  }, []);
```

(e) Add the "Deploy all" button in the header actions `<div>` (after "Check all", before "Export"):
```tsx
            {withTooltip(
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmAll(true)}
                disabled={!!disabledReason || anyBusy || bus.length === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                Deploy all
              </Button>,
              disabledReason,
            )}
```

(f) Add the batch progress panel directly after the summary-strip `<div>` (before the `<Card>`):
```tsx
        {batch && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Deploying all BUs… {batch.buCode ? `(${batch.buCode})` : ''}</span>
                <span className="text-muted-foreground">{batch.applied} / {batch.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-valuenow={batch.applied}
                  aria-valuemin={0}
                  aria-valuemax={batch.total}
                  className="h-full bg-primary transition-all"
                  style={{ width: `${batch.total ? (batch.applied / batch.total) * 100 : 0}%` }}
                />
              </div>
              {batch.current && <p className="break-all font-mono text-xs text-muted-foreground">{batch.current}</p>}
              {batch.log.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                  {batch.log.map((l, i) => (
                    <li key={`${l}-${i}`} className="break-all font-mono text-xs text-muted-foreground">{l}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
```

(g) Add the ConfirmDialog next to the Apply ConfirmDialog (before the debug Sheet):
```tsx
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Deploy migrations to all BUs"
        description={`Apply all pending migrations to every business unit (${bus.length} total)? This applies schema changes to every tenant database and cannot be undone.`}
        confirmText="Deploy all"
        confirmVariant="destructive"
        onConfirm={deployAll}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/TenantMigrationManagement.test.tsx`
Expected: PASS (7 tests). If the "Deploy all" confirm click is ambiguous, scope it with `within(await screen.findByRole('dialog')).getByRole('button', { name: /deploy all/i })`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TenantMigrationManagement.tsx src/pages/TenantMigrationManagement.test.tsx
git commit -m "feat(tenant-migration): Deploy all batch stream + live row flips + gating"
```

---

### Task 8: Route + navigation + full-suite verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: `TenantMigrationManagement` page, `PrivateRoute`, the nav-item shape in `allNavItems`.
- Produces: a guarded route `/tenant-migrations` and an Organization-group nav item.

- [ ] **Step 1: Add the route in `src/App.tsx`**

Add the import next to the other page imports:
```tsx
import TenantMigrationManagement from './pages/TenantMigrationManagement';
```
Add the route next to the other `/business-units` routes (match the existing `<PrivateRoute requiredPermission=...>` style used in this file):
```tsx
<Route path="/tenant-migrations" element={<PrivateRoute requiredPermission="cluster.read"><TenantMigrationManagement /></PrivateRoute>} />
```
> Verify the exact `PrivateRoute` prop name in `App.tsx` (the repo uses `requiredPermission`). Match whatever the neighboring guarded routes use.

- [ ] **Step 2: Add the nav item in `src/components/Layout.tsx`**

Add `DatabaseZap` to the existing `lucide-react` import (if `DatabaseZap` is not exported by the installed version, use `Database`). Add to `allNavItems`, right after the Business Units entry:
```tsx
{ path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' },
```

- [ ] **Step 3: Type-check + lint via build, then run the full suite**

Run: `bun run test`
Expected: PASS — whole suite green (existing + new: `concurrent` 4, `migrationError` 4, `tenantMigrationService` 6, `TenantMigrationManagement` 7, `TenantMigrationCard` 3).

Run: `CI=true bun run build`
Expected: build succeeds (vite-plugin-eslint + tsc clean — the nav icon and route resolve).

- [ ] **Step 4: Manual verification (dev server, as a super-admin)**

Run: `bun start` → open `http://localhost:3304/tenant-migrations`.
1. **Tenant Migrations** appears in the Organization nav group; the page lists all BUs with **Unknown** status (no network status calls on load — confirm in the Network tab).
2. **Check all** → badges fill in (Up to date / N pending) with the concurrency cap; summary strip counts update.
3. A pending row → **Apply** → confirm lists the count → inline `Applying X/Y` progresses → success toast → row flips to **Up to date**.
4. **Deploy all** → confirm warns "all BUs" → batch panel streams; rows flip live; summary toast reports succeeded/failed. **Confirm via the dev debug Sheet that the `all` stream returns the expected per-BU events + `BatchDeploySummary`** (the one spec assumption).
5. Log in as a **non-super-admin** → page loads, all action buttons disabled with the "Super-admin required." tooltip.
6. **Export** downloads the current code/name/status/pending/last-checked CSV.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat(tenant-migration): route + Organization nav item for overview page"
```

---

## Self-Review Notes

- **Spec coverage:** scope (status + per-row deploy + Deploy all) → Tasks 5/6/7; on-demand check → Tasks 5; Hybrid client-side table → Task 4; access cluster.read + super-admin gating → Tasks 4/7/8; per-row streaming progress → Task 6; Export CSV → Task 4; Vitest → every task; `deployAllStream` + reader factor → Task 3; shared error helper → Task 2; concurrency helper → Task 1; route + nav → Task 8. The lone backend assumption (the `all` stream shape) is verified in Task 8 Step 4.
- **The `all` stream assumption** is the only runtime unknown. If the backend's batch stream differs (e.g. no `bu-complete` events, or a different summary shape), the per-BU live-flip in Task 7 degrades gracefully (rows just stay as last checked) and a follow-up "Check all" reconciles — but adjust `deployAll`'s `onEvent` to match the real events and re-run the Task 7 test.
- **DataTable** is used in client mode (`serverSide` omitted → `false`): it wires `getFilteredRowModel`/`getSortedRowModel`/`getPaginationRowModel` and honors `globalFilter`/`pageSize`/`defaultSort`. It adds the `#` column itself.
