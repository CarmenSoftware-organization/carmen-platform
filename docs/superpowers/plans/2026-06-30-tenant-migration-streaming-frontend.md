# Tenant Migration Streaming — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume the backend NDJSON deploy-progress stream in `TenantMigrationCard` — a determinate progress bar plus a live log of each migration as it is applied.

**Architecture:** A new `tenantMigrationService.deployStream(buId, onEvent)` uses `fetch` + `ReadableStream` (NOT `EventSource`, so it can send the `Authorization` + `x-app-id` headers), parses NDJSON line-by-line, invokes `onEvent` per event, and resolves with the final `done` summary. `TenantMigrationCard` renders progress + log from those events. Fully testable against a mocked `fetch` — no backend required.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + React Testing Library. Repo: `carmen-platform`. Depends on the backend NDJSON contract (Backend plan) but not on it being deployed.

## Global Constraints

- Endpoint: `POST /api-system/tenant/migrations/:bu_id/deploy/stream`, `Content-Type` of the response `application/x-ndjson`.
- Auth via `fetch` headers: `Authorization: Bearer <localStorage 'token'>`, `x-app-id: import.meta.env.REACT_APP_API_APP_ID`. Base URL from `api.defaults.baseURL` (the existing axios instance).
- `ProgressEvent` schema (verbatim from spec / backend):
  - `{ type: 'start'; bu_id; bu_code; total }`
  - `{ type: 'applying'; bu_id; bu_code; name; index; total }`
  - `{ type: 'bu-complete'; bu_id; bu_code; success; applied: string[]; already_up_to_date; error? }`
  - `{ type: 'log'; message }`
  - `{ type: 'done'; success; summary }`
  - `{ type: 'error'; message }`
- Pre-stream failures arrive as `!res.ok` (parse JSON body for the message); mid-stream failures arrive as a terminal `{ type: 'error' }` event.
- Keep the existing buffered `deploy(buId)` method (unused by the card after this change, retained for parity).
- Tests: co-located, explicit `vitest` imports (no globals), behavior assertions (no snapshots). Don't churn `tsconfig`/`vite.config`.
- Spec: `docs/superpowers/specs/2026-06-30-tenant-migration-streaming-progress-design.md`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/types/index.ts` | `ProgressEvent`, `DeploySummary` types | 1 |
| `src/services/tenantMigrationService.ts` | `deployStream` (fetch + NDJSON parser) | 2 |
| `src/services/tenantMigrationService.test.ts` | parser/stream tests (mock fetch) | 2 |
| `src/components/TenantMigrationCard.tsx` | progress bar + live log from the stream | 3 |
| `src/components/TenantMigrationCard.test.tsx` | extend existing tests | 3 |

Run a single test: `bunx vitest run <path>`.

---

## Task 1: Stream types

**Files:**
- Modify: `src/types/index.ts`
- Test: none (type-only; verified by the consumers' tests + build).

**Interfaces:**
- Produces: `ProgressEvent` union, `SingleDeploySummary`, `BatchDeploySummary`, `DeploySummary`.

- [ ] **Step 1: Add the types**

Append to `src/types/index.ts` (after the existing `TenantMigrationDeployResult`):

```ts
export interface SingleDeploySummary {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
}

export interface BatchDeploySummary {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}

export type DeploySummary = SingleDeploySummary | BatchDeploySummary;

export type ProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'applying'; bu_id: string; bu_code: string; name: string; index: number; total: number }
  | {
      type: 'bu-complete';
      bu_id: string;
      bu_code: string;
      success: boolean;
      applied: string[];
      already_up_to_date: boolean;
      error?: string;
    }
  | { type: 'log'; message: string }
  | { type: 'done'; success: boolean; summary: DeploySummary }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run build`
Expected: build succeeds (types added, nothing references them yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(tenant-migration): ProgressEvent + DeploySummary types"
```

---

## Task 2: `deployStream` service (fetch + NDJSON)

**Files:**
- Modify: `src/services/tenantMigrationService.ts`
- Test: `src/services/tenantMigrationService.test.ts` (create)

**Interfaces:**
- Consumes: `ProgressEvent`, `DeploySummary` (Task 1); the axios `api` instance (for `defaults.baseURL`).
- Produces: `deployStream(buId: string, onEvent: (e: ProgressEvent) => void): Promise<DeploySummary>`.

- [ ] **Step 1: Write the failing test**

Create `src/services/tenantMigrationService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tenantMigrationService from './tenantMigrationService';
import type { ProgressEvent } from '../types';

// Build a ReadableStream that emits the given string chunks.
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

const okStream = (chunks: string[]) => ({ ok: true, status: 200, body: streamFrom(chunks) });

describe('tenantMigrationService.deployStream', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('parses NDJSON (including a line split across chunks) and calls onEvent per event', async () => {
    const events: ProgressEvent[] = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 2 },
      { type: 'applying', bu_id: 'b', bu_code: 'B', name: 'm1', index: 1, total: 2 },
      { type: 'applying', bu_id: 'b', bu_code: 'B', name: 'm2', index: 2, total: 2 },
      { type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', success: true, already_up_to_date: false, applied_migrations: ['m1', 'm2'] } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    // split mid-way through to exercise the partial-line buffer
    const mid = Math.floor(ndjson.length / 2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson.slice(0, mid), ndjson.slice(mid)]) as never);

    const seen: ProgressEvent[] = [];
    const summary = await tenantMigrationService.deployStream('b', (e) => seen.push(e));

    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ success: true, applied_migrations: ['m1', 'm2'] });
  });

  it('sends Authorization + x-app-id headers to the stream endpoint', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: {} }) + '\n']) as never);
    await tenantMigrationService.deployStream('bu-9', () => {});
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/migrations/bu-9/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws on a pre-stream HTTP error (parses the JSON body)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'already running' }),
    } as never);
    await expect(tenantMigrationService.deployStream('b', () => {})).rejects.toThrow(/already running/);
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'b', bu_code: 'B', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'migrate failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantMigrationService.deployStream('b', () => {})).rejects.toThrow(/migrate failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/services/tenantMigrationService.test.ts`
Expected: FAIL — `deployStream` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/services/tenantMigrationService.ts`, add the import at the top:

```ts
import type { ProgressEvent, DeploySummary } from '../types';
```

Add the method to the `tenantMigrationService` object (keep `getStatus`/`deploy`/`resolve`):

```ts
  /**
   * Stream a tenant deploy as NDJSON ProgressEvents. Calls onEvent for each event and
   * resolves with the final `done` summary. Uses fetch (not EventSource) so it can send
   * the bearer token + x-app-id. Rejects on a pre-stream HTTP error or a terminal error event.
   */
  deployStream: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
  ): Promise<DeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/migrations/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': import.meta.env.REACT_APP_API_APP_ID,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Deploy stream failed (${res.status})`);
    }

    const reader = res.body!.getReader();
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
```

> `api` is already imported at the top of this file (`import api from './api'`). The
> `deployStream` arrow needs no axios call — it uses `api.defaults.baseURL` only.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/services/tenantMigrationService.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/tenantMigrationService.ts src/services/tenantMigrationService.test.ts
git commit -m "feat(tenant-migration): deployStream fetch+NDJSON client"
```

---

## Task 3: `TenantMigrationCard` progress UI

**Files:**
- Modify: `src/components/TenantMigrationCard.tsx`
- Test: `src/components/TenantMigrationCard.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `tenantMigrationService.deployStream` (Task 2), `ProgressEvent` (Task 1).
- Produces: progress UI driven by streamed events (no new exports).

- [ ] **Step 1: Write the failing test**

Add to `src/components/TenantMigrationCard.test.tsx` (the mock from Task-3 of the existing file already mocks `tenantMigrationService`; extend it to include `deployStream`). Replace the existing `vi.mock('../services/tenantMigrationService', …)` with:

```ts
vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deploy: vi.fn(), deployStream: vi.fn() },
}));
```

Then add this test:

```ts
it('renders a progress bar and live log from streamed events, then finalizes', async () => {
  const user = userEvent.setup();
  // drive deployStream by invoking onEvent synchronously, then resolving with a summary
  vi.mocked(tenantMigrationService.deployStream).mockImplementation(async (_buId, onEvent) => {
    onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', total: 3 });
    onEvent({ type: 'applying', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', name: PENDING[0], index: 1, total: 3 });
    onEvent({ type: 'applying', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', name: PENDING[1], index: 2, total: 3 });
    return { bu_id: 'bu-1', bu_code: 'CARMEN-AVG', success: true, already_up_to_date: false, applied_migrations: PENDING.slice(0, 2) };
  });

  renderCard();
  await user.click(screen.getByRole('button', { name: /check status/i }));
  await user.click(await screen.findByRole('button', { name: /apply 3 migration/i }));
  await user.click(await screen.findByRole('button', { name: /apply migrations/i })); // confirm dialog

  // progress bar reflects applied/total and the live log shows applied names
  const bar = await screen.findByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', '2');
  expect(bar).toHaveAttribute('aria-valuemax', '3');
  expect(screen.getByText(PENDING[0])).toBeInTheDocument();
  expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function));
});
```

> `PENDING` and `renderCard` already exist in the file from the prior task; the
> `beforeEach` mocks `getStatus` to return `has_pending` with `PENDING`. The card's BU
> id prop is `bu-1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/TenantMigrationCard.test.tsx`
Expected: FAIL — no `progressbar` role; card still calls `deploy`, not `deployStream`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/TenantMigrationCard.tsx`:

Add the import:

```ts
import type { ProgressEvent } from '../types';
```

Add progress state (next to the existing `useState` hooks):

```ts
  const [progress, setProgress] = useState<{ applied: number; total: number; current: string | null } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
```

Replace `runDeploy` with the streaming version:

```ts
  const runDeploy = async () => {
    setDeploying(true);
    setProgress({ applied: 0, total: pending.length, current: null });
    setLogLines([]);
    try {
      const onEvent = (e: ProgressEvent) => {
        if (e.type === 'start') setProgress({ applied: 0, total: e.total, current: null });
        else if (e.type === 'applying') {
          setProgress({ applied: e.index, total: e.total, current: e.name });
          setLogLines((prev) => [...prev, e.name]);
        }
      };
      const summary = await tenantMigrationService.deployStream(buId, onEvent);
      const applied = 'applied_migrations' in summary ? summary.applied_migrations : [];
      if (applied.length === 0) toast.info('Already up to date.');
      else toast.success(`Applied ${applied.length} migration(s) to ${buCode}.`);
      setConfirmOpen(false);
      await fetchStatus();
    } catch (err) {
      handleMigrationError(err);
      setConfirmOpen(false);
    } finally {
      setDeploying(false);
      setProgress(null);
    }
  };
```

Render the progress UI inside `CardContent` (after the pending-list block, before the raw-output block):

```tsx
        {deploying && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Applying migrations…</span>
              <span className="text-muted-foreground">
                {progress.applied} / {progress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                role="progressbar"
                aria-valuenow={progress.applied}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.applied / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.current && (
              <p className="break-all font-mono text-xs text-muted-foreground">{progress.current}</p>
            )}
            {logLines.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                {logLines.map((name) => (
                  <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
```

> The card already imports `tenantMigrationService`, `toast`, `handleMigrationError`,
> `useState`, and exposes `pending`, `buId`, `buCode`, `setConfirmOpen`, `fetchStatus`,
> `deploying`. Only `progress`/`logLines` state and the streaming `runDeploy` are new.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/TenantMigrationCard.test.tsx`
Expected: PASS — progressbar shows `aria-valuenow=2`, `aria-valuemax=3`; log shows the applied names; `deployStream` called with `('bu-1', fn)`.

- [ ] **Step 5: Run the full suite + build**

Run: `bunx vitest run`
Expected: PASS (whole suite green).

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/TenantMigrationCard.tsx src/components/TenantMigrationCard.test.tsx
git commit -m "feat(tenant-migration): live progress bar + log in BU card"
```

---

## Final Verification (after all tasks)

- [ ] `bunx vitest run` — full suite green.
- [ ] `bun run build` — production build succeeds (`CI=true bun run build` to treat warnings as errors).
- [ ] Manual smoke (needs the backend stream endpoint deployed): open `/business-units/:id/edit`, Check status, Apply → watch the progress bar advance and the log fill as each migration applies; on completion the status refreshes.

## Self-Review Notes

- **Spec coverage:** types (T1), `deployStream` fetch+NDJSON with chunk-split handling + header auth + pre-stream error + terminal-error reject (T2), card progress bar + live log + finalize (T3). The buffered `deploy` is retained per the spec.
- **Type consistency:** `ProgressEvent`/`DeploySummary` defined in T1 and consumed unchanged in T2/T3; `deployStream(buId, onEvent)` signature identical across the service, its test, and the card.
- **Dependency note:** this plan depends on the backend NDJSON contract but tests entirely against a mocked `fetch`, so it can be implemented and merged independently; the live smoke test requires the backend plan deployed.
