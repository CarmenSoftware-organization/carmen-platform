# Tenant Seed — Per-Set Selection Increment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the user pick which seed **sets** to seed (checkbox per set) instead of always seeding all; forward-ready for more sets. Fold in the final-review FIX-NOW (disconnect try/catch) and two test closes.

**Architecture:** `deployStream` gains an optional `keys: string[]` (sets to seed; omitted/empty = all). Frontend sends it as a JSON body; gateway forwards it; micro-business service filters `seedSets`. Card renders a checkbox per set (default all checked) and seeds only the selected ones.

**Tech Stack:** NestJS + RxJS + Prisma (backend), React 19 + Vite + Vitest (frontend). Backend tests: Jest (`--forceExit`). Native `<input type="checkbox">` (no new lib — matches `PermissionPicker`/`BusinessUnitMultiSelect`).

## Global Constraints
- Both repos on branch `feat/tenant-seed-card`.
- Backward-compat: `deployStream` with no `keys` (or empty) seeds ALL sets — existing behavior/tests must still pass.
- Selection is per **set** (`SeedSetDef.key`), never per row. Unknown key → matches no set (seeds nothing), never an error.
- Summary under selection: `created` = rows created across selected sets; `skipped` = `sum(selectedSets.definedKeys) - created`.
- `getStatus` unchanged (always returns every set).
- Seed `SeedProgressEvent`/status types unchanged — `keys` is a plain `string[]`, no new type.

---

## Task S1: micro-business service filters by keys + disconnect fix

**Repo:** `carmen-turborepo-backend-v2`
**Files:**
- Modify: `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts`
- Modify: `apps/micro-business/src/authen/tenant_seed/tenant_seed.controller.ts`
- Test: `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.spec.ts`

**Interfaces:**
- Produces: `TenantSeedService.deployStream(bu_id: string, keys?: string[]): Observable<SeedProgressEvent>` (new optional 2nd arg). Controller `deploy-stream` payload gains optional `keys?: string[]`.

- [ ] **Step 1: Write failing tests** — append these `it` blocks to the existing `describe('TenantSeedService.deployStream', …)` in `tenant_seed.service.spec.ts` (keep the existing 5 tests). They rely on the existing `fakeTenant`/`makeService` helpers already in the file:

```ts
  it('seeds only the selected sets when keys are given', async () => {
    const { tenant, created } = fakeTenant([]); // nothing present -> all defined are missing
    const svc = makeService(tenant);
    // 'running-code' is the only registered set today: selecting it seeds; selecting an unknown key seeds nothing.
    const selected = await lastValueFrom(svc.deployStream(BU_ID, ['running-code']).pipe(toArray()));
    const doneSel = selected[selected.length - 1] as Extract<SeedProgressEvent, { type: 'done' }>;
    expect(doneSel.summary.created).toBe(created.length);
    expect(created.length).toBeGreaterThan(0);
  });

  it('seeds nothing when keys match no set', async () => {
    const { tenant, created } = fakeTenant([]);
    const svc = makeService(tenant);
    const events = await lastValueFrom(svc.deployStream(BU_ID, ['does-not-exist']).pipe(toArray()));
    const start = events[0] as Extract<SeedProgressEvent, { type: 'start' }>;
    const done = events[events.length - 1] as Extract<SeedProgressEvent, { type: 'done' }>;
    expect(start.total).toBe(0);
    expect(done.summary.created).toBe(0);
    expect(created).toHaveLength(0);
  });

  it('aborts the stream (no done) when a row create fails', async () => {
    const { tenant } = fakeTenant([]);
    let calls = 0;
    tenant.tb_config_running_code.create = async () => {
      calls += 1;
      if (calls === 2) throw new Error('boom');
      return {};
    };
    const svc = makeService(tenant);
    const seen: SeedProgressEvent[] = [];
    await expect(
      lastValueFrom(svc.deployStream(BU_ID).pipe(tap((e) => seen.push(e)), toArray())),
    ).rejects.toThrow(/boom/);
    expect(seen.some((e) => e.type === 'done')).toBe(false);
  });

  it('does not fail the run when the tenant $disconnect throws', async () => {
    const { tenant } = fakeTenant([]);
    tenant.$disconnect = async () => { throw new Error('disconnect blip'); };
    const svc = makeService(tenant);
    const events = await lastValueFrom(svc.deployStream(BU_ID).pipe(toArray()));
    expect((events[events.length - 1] as SeedProgressEvent).type).toBe('done');
  });
```

Add `tap` to the rxjs import at the top of the spec: `import { lastValueFrom, toArray, tap } from 'rxjs';`

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/tenant_seed.service.spec.ts --forceExit`
Expected: the 4 new tests FAIL (keys arg ignored → seeds all even for unknown key; disconnect-throw currently rejects the run).

- [ ] **Step 3: Filter by keys in `deployStream`**

In `tenant_seed.service.ts`, change the `deployStream` signature and the set iteration. Replace the method header line:

```ts
  deployStream(bu_id: string): Observable<SeedProgressEvent> {
```
with:
```ts
  deployStream(bu_id: string, keys?: string[]): Observable<SeedProgressEvent> {
```

Immediately after `const tenant = this.createTenantClient(database_url);` (inside the `try`), add the set selection, and use it for both the work loop and the defined-total:

```ts
          const targetSets =
            keys && keys.length > 0 ? seedSets.filter((s) => keys.includes(s.key)) : seedSets;
```
Then change `for (const s of seedSets) {` (the work-building loop) to `for (const s of targetSets) {`, and change the `definedTotal` line from `seedSets.reduce(...)` to:
```ts
          const definedTotal = targetSets.reduce((acc, s) => acc + s.definedKeys.length, 0);
```

- [ ] **Step 4: Fix `disconnect()` (final-review FIX-NOW)**

Replace the `disconnect` method body so a `$disconnect()` failure is swallowed and never masks the in-flight result:

```ts
  /** Best-effort $disconnect on a tenant client that may be a test fake. */
  private async disconnect(tenant: TenantDb): Promise<void> {
    const maybe = tenant as unknown as { $disconnect?: () => Promise<void> };
    if (typeof maybe.$disconnect === 'function') {
      try {
        await maybe.$disconnect();
      } catch (err) {
        this.logger.warn({ function: 'disconnect', err }, TenantSeedService.name);
      }
    }
  }
```

(`this.logger` is the existing `BackendLogger` field on the service. If it uses a different method name than `warn`, use the same level the sibling `tenant_migration.service.ts` uses for non-fatal logs.)

- [ ] **Step 5: Thread `keys` through the controller**

In `tenant_seed.controller.ts`, change the `deployStream` handler's payload type and call:

```ts
  @MessagePattern({ cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' })
  deployStream(
    @Payload() payload: MicroservicePayload & { bu_id: string; keys?: string[] },
  ): Observable<SeedProgressEvent> {
    this.logger.debug({ function: 'deployStream', bu_id: payload.bu_id }, TenantSeedController.name);
    return this.tenantSeedService.deployStream(payload.bu_id, payload.keys);
  }
```

- [ ] **Step 6: Run tests + tsc**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/tenant_seed.service.spec.ts --forceExit`
Expected: all tests PASS (original 5 + 4 new = 9 in that file's suites; plus the getStatus block).

Run: `cd apps/micro-business && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `tenant_seed/**`.

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts apps/micro-business/src/authen/tenant_seed/tenant_seed.controller.ts apps/micro-business/src/authen/tenant_seed/tenant_seed.service.spec.ts
git commit -m "feat(tenant-seed): filter deploy-stream by selected set keys; harden disconnect"
```

---

## Task S2: gateway forwards `keys` body

**Repo:** `carmen-turborepo-backend-v2`
**Files:**
- Modify: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts`
- Modify: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts`
- Test: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.spec.ts` (and/or `.service.spec.ts`)

**Interfaces:**
- Consumes: micro-business `deploy-stream` payload `{ bu_id, keys? }` (Task S1).
- Produces: `TenantSeedsService.runDeployStream(bu_id: string, keys?: string[])`; HTTP `POST :bu_id/deploy/stream` accepts optional JSON body `{ keys?: string[] }`.

- [ ] **Step 1: Write/adjust failing test**

In `tenant-seeds.service.spec.ts` (create if the fixer's B4 work put stream coverage only in the controller spec — otherwise extend it), add a case asserting `runDeployStream('bu-1', ['running-code'])` calls `client.send` with a payload containing `keys: ['running-code']`. In `tenant-seeds.controller.spec.ts`, add/adjust a case asserting the controller passes `body.keys` into `tenantSeedsService.runDeployStream`. Mirror the existing mocking style in those spec files.

Example service-spec assertion (adapt to the file's existing mock of `ClientProxy`):
```ts
  it('forwards selected keys to the micro-business stream', () => {
    const send = jest.fn().mockReturnValue(of({} as never));
    const service = new TenantSeedsService({ send } as never);
    service.runDeployStream('bu-1', ['running-code']);
    expect(send).toHaveBeenCalledWith(
      { cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' },
      expect.objectContaining({ bu_id: 'bu-1', keys: ['running-code'] }),
    );
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend-gateway && npx jest src/platform/tenant-seeds --forceExit`
Expected: the new assertion FAILS (keys not yet forwarded).

- [ ] **Step 3: Forward `keys` in the proxy service**

In `tenant-seeds.service.ts`, change `runDeployStream`:

```ts
  runDeployStream(bu_id: string, keys?: string[]): Observable<SeedProgressEvent> {
    this.logger.debug({ function: 'runDeployStream', bu_id }, TenantSeedsService.name);
    return this.client.send<SeedProgressEvent>(
      { cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' },
      { bu_id, keys, ...getGatewayRequestContext() },
    );
  }
```

- [ ] **Step 4: Accept an optional body in the controller**

In `tenant-seeds.controller.ts`: add `Body` to the `@nestjs/common` import; add a small DTO and read it. Change the `deployStream` route to:

```ts
  @Post(':bu_id/deploy/stream')
  @ApiOperation({ summary: 'Stream tenant seed (NDJSON)', operationId: 'tenantSeed_deployStream' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiBody({ required: false, schema: { type: 'object', properties: { keys: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 200, description: 'application/x-ndjson stream of SeedProgressEvent objects' })
  @ApiResponse({ status: 400, description: 'Invalid bu_id format' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  @ApiResponse({ status: 404, description: 'Business unit not found' })
  @ApiResponse({ status: 422, description: 'Business unit has no/unsupported database connection' })
  deployStream(
    @Req() req: Request,
    @Res() res: Response,
    @Param('bu_id') id: string,
    @Body() body: { keys?: string[] } = {},
  ): Promise<void> {
    return new Promise<void>((settle) => {
      // ...unchanged body, EXCEPT the subscribe line:
```

Add `Body` and `ApiBody` to the imports (they may already be partially there). Change the single line inside that starts the stream from `this.tenantSeedsService.runDeployStream(id)` to `this.tenantSeedsService.runDeployStream(id, body?.keys)`. Leave the rest of the NDJSON handler exactly as-is.

- [ ] **Step 5: Run tests + tsc**

Run: `cd apps/backend-gateway && npx jest src/platform/tenant-seeds --forceExit`
Expected: PASS (existing + new).

Run: `cd apps/backend-gateway && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `tenant-seeds/**` (the 3 known pre-existing app errors elsewhere are not yours).

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/platform/tenant-seeds
git commit -m "feat(tenant-seed): gateway forwards selected keys body to deploy-stream"
```

---

## Task S3: frontend service sends `keys` body + seedError test

**Repo:** `carmen-platform`
**Files:**
- Modify: `src/services/tenantSeedService.ts`
- Modify: `src/services/tenantSeedService.test.ts`
- Test (new): `src/utils/seedError.test.ts`

**Interfaces:**
- Produces: `tenantSeedService.deployStream(buId: string, onEvent: (e: SeedProgressEvent) => void, keys?: string[]): Promise<SeedDeploySummary>`.

- [ ] **Step 1: Write failing test** — add to `tenantSeedService.test.ts` inside the `deployStream` describe:

```ts
  it('sends a JSON body with selected keys when provided', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 0 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-7', () => {}, ['running-code']);
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ keys: ['running-code'] });
  });

  it('omits the body when no keys are provided', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 0 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-7', () => {});
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).body).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/services/tenantSeedService.test.ts`
Expected: the two new tests FAIL (no `keys` param / no body yet).

- [ ] **Step 3: Send the body**

In `tenantSeedService.ts`, change `deployStream`'s signature and the `fetch` init:

```ts
  deployStream: async (
    buId: string,
    onEvent: (e: SeedProgressEvent) => void,
    keys?: string[],
  ): Promise<SeedDeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const hasKeys = Array.isArray(keys) && keys.length > 0;
    const res = await fetch(`${base}/api-system/tenant/seeds/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
        ...(hasKeys ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasKeys ? { body: JSON.stringify({ keys }) } : {}),
    });
    // ...rest of the method unchanged
```

- [ ] **Step 4: Add `seedError.test.ts`** (closes the FE final-review minor) — mirror `src/utils/migrationError.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSeedError } from './seedError';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }));

describe('handleSeedError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a super-admin message on 403', () => {
    handleSeedError({ response: { status: 403 } });
    expect(toast.error).toHaveBeenCalledWith('Seeding is disabled or requires super-admin.');
  });

  it('falls back to parseApiError message otherwise', () => {
    handleSeedError({ response: { status: 500, data: { message: 'kaboom' } } });
    expect(toast.error).toHaveBeenCalledWith('kaboom');
  });
});
```

(If `parseApiError` extracts the message from a different field than `response.data.message`, adjust the second test's input to whatever shape `src/utils/errorParser.ts` reads so the assertion matches — read that file first.)

- [ ] **Step 5: Run the focused tests**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/services/tenantSeedService.test.ts src/utils/seedError.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/tenantSeedService.ts src/services/tenantSeedService.test.ts src/utils/seedError.test.ts
git commit -m "feat(tenant-seed): service sends selected keys body; add seedError test"
```

---

## Task S4: card renders per-set checkboxes and seeds the selection

**Repo:** `carmen-platform`
**Files:**
- Modify: `src/components/TenantSeedCard.tsx`
- Modify: `src/components/TenantSeedCard.test.tsx`

**Interfaces:**
- Consumes: `tenantSeedService.deployStream(buId, onEvent, keys?)` (Task S3).

- [ ] **Step 1: Write failing tests** — replace the card's "checks status and shows missing rows, then enables seeding" test and the "runs a seed" test so they cover selection. Add a two-set status so selection is observable:

```tsx
  it('renders a checkbox per set (default checked) and counts selected missing', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [
        { key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] },
        { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
      ],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // both sets checked by default -> 2 + 3 = 5 missing
    expect(await screen.findByRole('button', { name: /seed 5 row/i })).toBeEnabled();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    // uncheck the currencies set -> only running-code's 2 remain
    await userEvent.click(boxes[1]);
    expect(screen.getByRole('button', { name: /seed 2 row/i })).toBeEnabled();
  });

  it('seeds only the selected sets', async () => {
    svc.getStatus
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [
          { key: 'running-code', label: 'Running codes', defined: 14, present: 13, missing: ['PRODUCT'] },
          { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
        ],
      })
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [
          { key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] },
          { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
        ],
      });
    svc.deployStream.mockImplementation(async (_buId: string, onEvent: (e: SeedProgressEvent) => void) => {
      onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'ZEBRA', total: 1 });
      onEvent({ type: 'seeding', bu_id: 'bu-1', bu_code: 'ZEBRA', key: 'running-code', row_type: 'PRODUCT', index: 1, total: 1 });
      return { bu_id: 'bu-1', bu_code: 'ZEBRA', created: 1, skipped: 13 };
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // uncheck currencies (2nd box), keep running-code
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[1]);
    await userEvent.click(await screen.findByRole('button', { name: /seed 1 row/i }));
    await userEvent.click(await within(screen.getByRole('alertdialog')).findByRole('button', { name: /^seed$/i }));
    await waitFor(() =>
      expect(svc.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function), ['running-code']),
    );
  });
```

Add `within` to the RTL import: `import { render, screen, waitFor, within } from '@testing-library/react';`. Keep the existing "all_seeded" and "non-super-admin disabled" tests.

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/components/TenantSeedCard.test.tsx`
Expected: FAIL (no checkboxes; deployStream called without keys).

- [ ] **Step 3: Add selection state + checkboxes**

In `TenantSeedCard.tsx`:

Add state after `logLines`:
```tsx
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
```

In `fetchStatus`, after `setStatus(s);`, initialize the selection to all sets that have missing rows:
```tsx
      setSelectedKeys(new Set(s.sets.filter((x) => x.missing.length > 0).map((x) => x.key)));
```

Replace the `totalMissing` memo with a selected-aware count (keep the name used by the confirm dialog / progress):
```tsx
  const selectedMissing = useMemo(
    () =>
      status
        ? status.sets.reduce((acc, s) => (selectedKeys.has(s.key) ? acc + s.missing.length : acc), 0)
        : 0,
    [status, selectedKeys],
  );
```
Replace remaining `totalMissing` references (badge, button label, confirm description, `setProgress` total) with `selectedMissing` — EXCEPT the aggregate "N missing" badge, which should keep showing the total across all sets. For the badge, compute a separate total:
```tsx
  const totalMissing = useMemo(
    () => (status ? status.sets.reduce((acc, s) => acc + s.missing.length, 0) : 0),
    [status],
  );
```
So: badge uses `totalMissing`; button label + confirm + progress use `selectedMissing`.

Add a toggle helper (above `return`):
```tsx
  const toggleSet = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
```

In the per-set `.map((s) => (...))`, add a checkbox before the label. Change the set block's header `<p>` into a `<label>` row with the checkbox:
```tsx
                <div key={s.key} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedKeys.has(s.key)}
                      onChange={() => toggleSet(s.key)}
                    />
                    {s.label}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({s.present}/{s.defined} present, {s.missing.length} missing)
                    </span>
                  </label>
```
(keep the `<ul>` of missing names below, unchanged; close the `<div>` as before.)

Update the Seed button: label `Seed {selectedMissing} row(s)`, and `disabled={actionsDisabled || selectedMissing === 0}`.

Update `runSeed`:
- `setProgress({ done: 0, total: selectedMissing, current: null });`
- call `await tenantSeedService.deployStream(buId, onEvent, [...selectedKeys]);`

Update the ConfirmDialog `description` to use `selectedMissing`.

- [ ] **Step 4: Run tests + tsc**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/components/TenantSeedCard.test.tsx`
Expected: PASS (selection tests + kept all_seeded / disabled tests).

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Full suite**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/TenantSeedCard.tsx src/components/TenantSeedCard.test.tsx
git commit -m "feat(tenant-seed): per-set checkboxes; seed only the selected sets"
```

---

## Self-Review (coverage)
- Per-set selection UI (checkbox per set, default checked, seed selected only): S4. ✅
- `keys` transport end-to-end (FE body → gateway → micro filter): S3 → S2 → S1. ✅
- Backward-compat (no keys = all): S1 filter guard + S3 omits body. ✅
- Summary semantics under selection: S1 `definedTotal` over `targetSets`. ✅
- FIX-NOW disconnect try/catch: S1. ✅
- Test closes (per-row-abort BE, seedError FE): S1, S3. ✅
