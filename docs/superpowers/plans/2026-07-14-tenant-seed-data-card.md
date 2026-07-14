# Tenant Seed Data Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super-admin seed a business unit's tenant database with default master data (running-codes first) from the BU Edit page, mirroring the existing `TenantMigrationCard` — two-step Check → Seed with live NDJSON streaming.

**Architecture:** Backend adds a `tenant_seed` module in `micro-business` (resolves the BU's tenant connection, runs a create-if-missing loop against a plain per-BU Prisma client, streams `SeedProgressEvent`s) and a `tenant-seeds` gateway controller that proxies it over TCP and re-emits NDJSON. Frontend adds `tenantSeedService` + a `TenantSeedCard` placed after `TenantMigrationCard` on the BU Edit page. Seed sets live in a registry (running-code populated now, extensible).

**Tech Stack:** NestJS + RxJS + Prisma (backend, two apps in `carmen-turborepo-backend-v2`), React 19 + TypeScript + Vite + Vitest (frontend, `carmen-platform`). Backend tests: Jest. Frontend tests: Vitest.

## Global Constraints

- **Two repos.** Backend tasks (B*) are in `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`. Frontend tasks (F*) are in `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`.
- **Super-admin only.** Gateway endpoints reuse the existing `TenantMigrationGuard` (super-admin bearer OR `x-deploy-token`). No new guard.
- **Idempotent, non-destructive.** Create-if-missing keyed per set (running-code keyed on `type`, filtered `deleted_at: null`). Never update or delete existing rows. No hardcoded `id`s.
- **Plain tenant client.** The seed service constructs `new PrismaClient({ datasources: { db: { url } } })` (base client from `@repo/prisma-shared-schema-tenant`) and always `$disconnect()`s it — matching the CLI seeder's deliberate choice to skip the audit-log/soft-delete extensions. Do NOT use the cached `PrismaClient_TENANT(...)` factory.
- **Seed `ProgressEvent` types are DISTINCT** from the migration `ProgressEvent` types on both sides. Backend union is named `SeedProgressEvent`; frontend adds `SeedProgressEvent` alongside the existing `ProgressEvent` (do not widen or reuse the migration one).
- **Backend Jest may hang open handles** — run backend specs with `--forceExit`.
- **Endpoints:** `GET /api-system/tenant/seeds/:bu_id/status`, `POST /api-system/tenant/seeds/:bu_id/deploy/stream`. No batch (`all`), no non-stream deploy, no resolve — scope is per-BU only.
- **Card label:** "Tenant Seed Data".

---

## File Structure

**Backend (`carmen-turborepo-backend-v2`):**
- Create `packages/prisma-shared-schema-tenant/src/seed-data/running-code.ts` — the `running_code_seed` array (moved here so both the CLI and the service import one copy).
- Modify `packages/prisma-shared-schema-tenant/src/index.ts` — re-export `running_code_seed`.
- Modify `packages/prisma-shared-schema-tenant/prisma/seed.running-code.ts` — import the array from the new location.
- Delete `packages/prisma-shared-schema-tenant/prisma/seed.running-code.data.ts` (contents moved).
- Create `apps/micro-business/src/authen/tenant_seed/seed-sets/types.ts` — `SeedSetDef` interface.
- Create `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.ts` — the running-code seed set.
- Create `apps/micro-business/src/authen/tenant_seed/seed-sets/index.ts` — the registry array.
- Create `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.spec.ts`.
- Create `apps/micro-business/src/authen/tenant_seed/progress-event.ts` — `SeedProgressEvent` union + status types.
- Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts`.
- Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.spec.ts`.
- Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.controller.ts`.
- Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.module.ts`.
- Modify `apps/micro-business/src/app.module.ts` — register `TenantSeedModule`.
- Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts`.
- Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts`.
- Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.module.ts`.
- Modify `apps/backend-gateway/src/app.module.ts` — register `TenantSeedsModule`.

**Frontend (`carmen-platform`):**
- Modify `src/types/index.ts` — add seed types.
- Create `src/services/tenantSeedService.ts` + `src/services/tenantSeedService.test.ts`.
- Create `src/utils/seedError.ts`.
- Create `src/components/TenantSeedCard.tsx` + `src/components/TenantSeedCard.test.tsx`.
- Modify `src/pages/BusinessUnitEdit.tsx` — render `TenantSeedCard`.

---

## Task B1: Share `running_code_seed` from the tenant package

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `packages/prisma-shared-schema-tenant/src/seed-data/running-code.ts`
- Modify: `packages/prisma-shared-schema-tenant/src/index.ts`
- Modify: `packages/prisma-shared-schema-tenant/prisma/seed.running-code.ts:4`
- Delete: `packages/prisma-shared-schema-tenant/prisma/seed.running-code.data.ts`
- Test: `packages/prisma-shared-schema-tenant/src/seed-data/running-code.spec.ts`

**Interfaces:**
- Produces: `export const running_code_seed: readonly { type: string; config: Record<string, unknown> }[]`, importable via `import { running_code_seed } from '@repo/prisma-shared-schema-tenant'` and via the relative path from `prisma/`.

- [ ] **Step 1: Create the shared data module**

Create `packages/prisma-shared-schema-tenant/src/seed-data/running-code.ts` with the exact current contents of `prisma/seed.running-code.data.ts`:

```ts
/**
 * Standard running-code presets — single source of truth shared by the CLI
 * seeder (prisma/seed.running-code.ts) and the tenant_seed micro-business service.
 * ค่าเริ่มต้นรหัสรันนิ่งมาตรฐาน
 */
export const running_code_seed = [
  { type: 'PURCHASE-REQUEST', config: { A: 'PR', B: "date('yyMM')", C: "running(4, '0')", format: '{A}{B}{C}' } },
  { type: 'PURCHASE-ORDER', config: { A: 'PO', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'GOOD-RECEIVED-NOTE', config: { A: 'GRN', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'CREDIT-NOTE', config: { A: 'CN', B: "date('yyMM')", C: "running(4, '0')", format: '{A}{B}{C}' } },
  { type: 'PRICE-LIST', config: { A: 'PL', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'STOCK-IN', config: { A: 'SI', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'STOCK-OUT', config: { A: 'SO', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'STORE-REQUISITION', config: { A: 'SR', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'SPOT-CHECK', config: { A: 'SC', B: "date('yyMM')", C: "running(5, '0')", format: '{A}{B}{C}' } },
  { type: 'PHYSICAL-COUNT', config: { A: 'PC', B: "date('yyMM')", C: "running(4, '0')", format: '{A}{B}{C}' } },
  { type: 'PRODUCT-CAT', config: { A: "running(1, '0')", format: '{A}' } },
  { type: 'PRODUCT-SUB-CAT', config: { A: "{PRODUCT-CAT}", B: "running(2, '0')", format: '{A}{B}' } },
  { type: 'PRODUCT-ITEM-GROUP', config: { A: "{PRODUCT-SUB-CAT}", B: "running(2, '0')", format: '{A}{B}' } },
  { type: 'PRODUCT', config: { A: "{PRODUCT-ITEM-GROUP}", B: "running(4, '0')", format: '{A}{B}' } },
];
```

- [ ] **Step 2: Write the failing test**

Create `packages/prisma-shared-schema-tenant/src/seed-data/running-code.spec.ts`:

```ts
import { running_code_seed } from './running-code';

describe('running_code_seed', () => {
  it('has entries, each with a non-empty type and a config object', () => {
    expect(running_code_seed.length).toBeGreaterThan(0);
    for (const row of running_code_seed) {
      expect(typeof row.type).toBe('string');
      expect(row.type.length).toBeGreaterThan(0);
      expect(typeof row.config).toBe('object');
    }
  });

  it('has unique types', () => {
    const types = running_code_seed.map((r) => r.type);
    expect(new Set(types).size).toBe(types.length);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/prisma-shared-schema-tenant && npx jest src/seed-data/running-code.spec.ts --forceExit`
Expected: FAIL — module `./running-code` not found (if Step 1 not yet saved) OR PASS if saved. If Step 1 is saved it will PASS; that is acceptable for a pure data module — the test exists to lock the shape.

- [ ] **Step 4: Re-export from the barrel**

Modify `packages/prisma-shared-schema-tenant/src/index.ts` — add after the existing exports:

```ts
export { running_code_seed } from './seed-data/running-code';
```

- [ ] **Step 5: Point the CLI seeder at the shared module**

In `packages/prisma-shared-schema-tenant/prisma/seed.running-code.ts`, change line 4 from:

```ts
import { running_code_seed } from './seed.running-code.data';
```

to:

```ts
import { running_code_seed } from '../src/seed-data/running-code';
```

Then delete `packages/prisma-shared-schema-tenant/prisma/seed.running-code.data.ts`.

- [ ] **Step 6: Run the test + verify the CLI still type-checks**

Run: `cd packages/prisma-shared-schema-tenant && npx jest src/seed-data/running-code.spec.ts --forceExit`
Expected: PASS

Run: `cd packages/prisma-shared-schema-tenant && npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `seed.running-code`.

- [ ] **Step 7: Commit**

```bash
git add packages/prisma-shared-schema-tenant/src/seed-data packages/prisma-shared-schema-tenant/src/index.ts packages/prisma-shared-schema-tenant/prisma/seed.running-code.ts
git add -u packages/prisma-shared-schema-tenant/prisma/seed.running-code.data.ts
git commit -m "refactor(tenant-seed): move running_code_seed to shared src module"
```

---

## Task B2: Seed registry + running-code seed set

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/authen/tenant_seed/seed-sets/types.ts`
- Create: `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.ts`
- Create: `apps/micro-business/src/authen/tenant_seed/seed-sets/index.ts`
- Test: `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.spec.ts`

**Interfaces:**
- Consumes: `running_code_seed` from `@repo/prisma-shared-schema-tenant` (Task B1), `PrismaClient` type from `@repo/prisma-shared-schema-tenant`.
- Produces:
  - `interface SeedSetDef { key: string; label: string; definedKeys: readonly string[]; listMissing(tenant: TenantDb): Promise<string[]>; createOne(tenant: TenantDb, key: string): Promise<void>; }`
  - `type TenantDb` — a structural type with just the tables the seed sets touch (so tests can pass a fake).
  - `const seedSets: SeedSetDef[]` — the registry.
  - `const runningCodeSeedSet: SeedSetDef`.

- [ ] **Step 1: Define the seed-set contract**

Create `apps/micro-business/src/authen/tenant_seed/seed-sets/types.ts`:

```ts
/**
 * Structural subset of the tenant Prisma client that seed sets rely on.
 * Kept minimal so specs can supply a fake without the full client.
 * ชุดย่อยเชิงโครงสร้างของ Prisma client ผู้เช่าที่ seed set ใช้
 */
export interface TenantDb {
  tb_config_running_code: {
    findMany(args: {
      where: { deleted_at: null };
      select: { type: true };
    }): Promise<{ type: string | null }[]>;
    create(args: {
      data: { type: string; config: unknown; note: string };
    }): Promise<unknown>;
  };
}

/**
 * One seed set: a named group of default rows for a tenant DB.
 * seed set หนึ่งชุด: กลุ่มแถวค่าเริ่มต้นสำหรับฐานข้อมูลผู้เช่า
 */
export interface SeedSetDef {
  /** Stable machine key, e.g. 'running-code'. */
  key: string;
  /** Human label for the UI, e.g. 'Running codes'. */
  label: string;
  /** Every row key this set defines (used for defined/present counts). */
  definedKeys: readonly string[];
  /** Row keys not yet present in the tenant DB (create-if-missing candidates). */
  listMissing(tenant: TenantDb): Promise<string[]>;
  /** Create the single row identified by `key`. */
  createOne(tenant: TenantDb, key: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.spec.ts`:

```ts
import { runningCodeSeedSet } from './running-code.seed-set';
import { running_code_seed } from '@repo/prisma-shared-schema-tenant';
import type { TenantDb } from './types';

/** Build a fake TenantDb whose running-code table already holds `presentTypes`. */
function fakeTenant(presentTypes: string[]) {
  const created: { type: string; config: unknown; note: string }[] = [];
  const tenant: TenantDb = {
    tb_config_running_code: {
      findMany: async () => presentTypes.map((type) => ({ type })),
      create: async ({ data }) => {
        created.push(data);
        return data;
      },
    },
  };
  return { tenant, created };
}

describe('runningCodeSeedSet', () => {
  it('exposes key/label and every defined type', () => {
    expect(runningCodeSeedSet.key).toBe('running-code');
    expect(runningCodeSeedSet.label).toBe('Running codes');
    expect(runningCodeSeedSet.definedKeys).toEqual(running_code_seed.map((r) => r.type));
  });

  it('listMissing returns all defined types when the tenant is empty', async () => {
    const { tenant } = fakeTenant([]);
    const missing = await runningCodeSeedSet.listMissing(tenant);
    expect(missing).toEqual(running_code_seed.map((r) => r.type));
  });

  it('listMissing excludes types already present', async () => {
    const present = ['PURCHASE-REQUEST', 'PRODUCT'];
    const { tenant } = fakeTenant(present);
    const missing = await runningCodeSeedSet.listMissing(tenant);
    expect(missing).not.toContain('PURCHASE-REQUEST');
    expect(missing).not.toContain('PRODUCT');
    expect(missing).toContain('PURCHASE-ORDER');
  });

  it('listMissing returns [] when all defined types are present', async () => {
    const { tenant } = fakeTenant(running_code_seed.map((r) => r.type));
    expect(await runningCodeSeedSet.listMissing(tenant)).toEqual([]);
  });

  it('createOne creates the row with type/config/note', async () => {
    const { tenant, created } = fakeTenant([]);
    await runningCodeSeedSet.createOne(tenant, 'CREDIT-NOTE');
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      type: 'CREDIT-NOTE',
      config: running_code_seed.find((r) => r.type === 'CREDIT-NOTE')!.config,
      note: 'initialized by system default.',
    });
  });

  it('createOne throws for an unknown key', async () => {
    const { tenant } = fakeTenant([]);
    await expect(runningCodeSeedSet.createOne(tenant, 'NOPE')).rejects.toThrow(/NOPE/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/seed-sets/running-code.seed-set.spec.ts --forceExit`
Expected: FAIL — cannot find module `./running-code.seed-set`.

- [ ] **Step 4: Implement the running-code seed set**

Create `apps/micro-business/src/authen/tenant_seed/seed-sets/running-code.seed-set.ts`:

```ts
import { running_code_seed } from '@repo/prisma-shared-schema-tenant';
import type { SeedSetDef, TenantDb } from './types';

/**
 * Seed set for tb_config_running_code — create-if-missing keyed on `type`.
 * seed set สำหรับ tb_config_running_code — สร้างเมื่อยังไม่มี โดยใช้ `type` เป็นกุญแจ
 */
export const runningCodeSeedSet: SeedSetDef = {
  key: 'running-code',
  label: 'Running codes',
  definedKeys: running_code_seed.map((r) => r.type),

  async listMissing(tenant: TenantDb): Promise<string[]> {
    const existing = await tenant.tb_config_running_code.findMany({
      where: { deleted_at: null },
      select: { type: true },
    });
    const present = new Set(existing.map((e) => e.type));
    return running_code_seed.filter((r) => !present.has(r.type)).map((r) => r.type);
  },

  async createOne(tenant: TenantDb, key: string): Promise<void> {
    const row = running_code_seed.find((r) => r.type === key);
    if (!row) {
      throw new Error(`Unknown running-code seed type: ${key}`);
    }
    await tenant.tb_config_running_code.create({
      data: { type: row.type, config: row.config, note: 'initialized by system default.' },
    });
  },
};
```

- [ ] **Step 5: Create the registry**

Create `apps/micro-business/src/authen/tenant_seed/seed-sets/index.ts`:

```ts
import type { SeedSetDef } from './types';
import { runningCodeSeedSet } from './running-code.seed-set';

/**
 * Ordered registry of tenant seed sets. Add new sets here — the service,
 * status, and UI iterate this list generically.
 * ทะเบียน seed set ของผู้เช่าแบบเรียงลำดับ
 */
export const seedSets: SeedSetDef[] = [runningCodeSeedSet];

export type { SeedSetDef, TenantDb } from './types';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/seed-sets/running-code.seed-set.spec.ts --forceExit`
Expected: PASS (6 passing)

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/authen/tenant_seed/seed-sets
git commit -m "feat(tenant-seed): add seed-set registry with running-code set"
```

---

## Task B3: micro-business `tenant_seed` module (service + controller)

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/authen/tenant_seed/progress-event.ts`
- Create: `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts`
- Create: `apps/micro-business/src/authen/tenant_seed/tenant_seed.controller.ts`
- Create: `apps/micro-business/src/authen/tenant_seed/tenant_seed.module.ts`
- Modify: `apps/micro-business/src/app.module.ts`
- Test: `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.spec.ts`

**Interfaces:**
- Consumes: `seedSets` (Task B2), `PrismaClient_SYSTEM` (injected as `'PRISMA_SYSTEM'`), `TenantService.getConnectionString`, `Result`, `ErrorCode` from `@/common`, `PrismaClient` from `@repo/prisma-shared-schema-tenant`.
- Produces:
  - `SeedProgressEvent` union + `SeedSetStatus` + `TenantSeedStatus` (in `progress-event.ts`).
  - `TenantSeedService.getStatus(bu_id: string): Promise<Result<TenantSeedStatus>>`
  - `TenantSeedService.deployStream(bu_id: string): Observable<SeedProgressEvent>`
  - `protected createTenantClient(database_url: string): TenantDb` (overridable seam for tests).
  - Message patterns `{ cmd: 'tenant-seeds.status', service: 'tenant-seeds' }` and `{ cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' }`.

- [ ] **Step 1: Define the event + status types**

Create `apps/micro-business/src/authen/tenant_seed/progress-event.ts`:

```ts
/** Per-set status: how many rows are defined vs already present, plus missing keys. */
export interface SeedSetStatus {
  key: string;
  label: string;
  defined: number;
  present: number;
  missing: string[];
}

/** Full seed status for one BU. */
export interface TenantSeedStatus {
  bu_id: string;
  bu_code: string;
  sets: SeedSetStatus[];
  all_seeded: boolean;
}

/** Streamed seed-progress events (NDJSON over the gateway). */
export type SeedProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'seeding'; bu_id: string; bu_code: string; key: string; row_type: string; index: number; total: number }
  | { type: 'done'; success: boolean; summary: { bu_id: string; bu_code: string; created: number; skipped: number } }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Write the failing service test**

Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.spec.ts`:

```ts
import { lastValueFrom, toArray } from 'rxjs';
import { TenantSeedService } from './tenant_seed.service';
import type { SeedProgressEvent } from './progress-event';
import type { TenantDb } from './seed-sets';

const BU_ID = '11111111-1111-1111-1111-111111111111';

/** Fake tenant DB starting with `presentTypes` already seeded. */
function fakeTenant(presentTypes: string[]) {
  const created: string[] = [];
  const tenant = {
    tb_config_running_code: {
      findMany: async () => presentTypes.map((type) => ({ type })),
      create: async ({ data }: { data: { type: string } }) => {
        created.push(data.type);
        return data;
      },
    },
    $disconnect: async () => {},
  };
  return { tenant, created };
}

/** Build a service whose BU lookup + tenant client are stubbed. */
function makeService(tenant: unknown, opts: { bu?: unknown } = {}) {
  const prismaSystem = {
    tb_business_unit: {
      findFirst: async () =>
        opts.bu === undefined
          ? { id: BU_ID, code: 'ZEBRA', db_connection: { host: 'h', port: 6432, database: 'd', schema: 's', password: 'p', username: 'u' } }
          : opts.bu,
    },
  };
  const tenantService = { getConnectionString: () => 'postgres://u:p@h:6432/d?schema=s' };
  const svc = new TenantSeedService(prismaSystem as never, tenantService as never);
  // Override the tenant-client seam so no real DB connection is made.
  (svc as unknown as { createTenantClient: () => TenantDb }).createTenantClient = () => tenant as TenantDb;
  return svc;
}

describe('TenantSeedService.getStatus', () => {
  it('reports per-set defined/present/missing and all_seeded=false when rows are missing', async () => {
    const { tenant } = fakeTenant(['PURCHASE-REQUEST']);
    const svc = makeService(tenant);
    const result = await svc.getStatus(BU_ID);
    expect(result.isOk()).toBe(true);
    const status = result.value as { sets: { key: string; defined: number; present: number; missing: string[] }[]; all_seeded: boolean };
    const set = status.sets.find((s) => s.key === 'running-code')!;
    expect(set.present).toBe(1);
    expect(set.defined).toBeGreaterThan(1);
    expect(set.missing).not.toContain('PURCHASE-REQUEST');
    expect(status.all_seeded).toBe(false);
  });

  it('errors when the BU is not found', async () => {
    const svc = makeService(fakeTenant([]).tenant, { bu: null });
    const result = await svc.getStatus(BU_ID);
    expect(result.isError()).toBe(true);
  });

  it('errors on an invalid bu_id format', async () => {
    const svc = makeService(fakeTenant([]).tenant);
    const result = await svc.getStatus('not-a-uuid');
    expect(result.isError()).toBe(true);
    expect(result.error.message).toMatch(/Invalid bu_id/i);
  });
});

describe('TenantSeedService.deployStream', () => {
  it('emits start -> seeding* -> done and creates only the missing rows', async () => {
    const { tenant, created } = fakeTenant(['PURCHASE-REQUEST']);
    const svc = makeService(tenant);
    const events = await lastValueFrom(svc.deployStream(BU_ID).pipe(toArray()));
    const types = events.map((e: SeedProgressEvent) => e.type);
    expect(types[0]).toBe('start');
    expect(types[types.length - 1]).toBe('done');
    const start = events[0] as Extract<SeedProgressEvent, { type: 'start' }>;
    const done = events[events.length - 1] as Extract<SeedProgressEvent, { type: 'done' }>;
    expect(start.total).toBe(created.length);
    expect(done.summary.created).toBe(created.length);
    expect(created).not.toContain('PURCHASE-REQUEST');
    // one 'seeding' event per created row
    expect(events.filter((e: SeedProgressEvent) => e.type === 'seeding')).toHaveLength(created.length);
  });

  it('errors the stream when the BU is not found', async () => {
    const svc = makeService(fakeTenant([]).tenant, { bu: null });
    await expect(lastValueFrom(svc.deployStream(BU_ID).pipe(toArray()))).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/tenant_seed.service.spec.ts --forceExit`
Expected: FAIL — cannot find module `./tenant_seed.service`.

- [ ] **Step 4: Implement the service**

Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaClient } from '@repo/prisma-shared-schema-tenant';
import { PrismaClient_SYSTEM as PrismaSystem } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { Result, ErrorCode } from '@/common';
import { TenantService } from '@/tenant/tenant.service';
import { seedSets, type TenantDb } from './seed-sets';
import type { SeedProgressEvent, TenantSeedStatus, SeedSetStatus } from './progress-event';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedConnection {
  bu_id: string;
  bu_code: string;
  database_url: string;
}

/**
 * Seeds default tenant master data (running-codes, …) for a BU via a plain,
 * short-lived tenant Prisma client. Create-if-missing, idempotent.
 * เพิ่มข้อมูลตั้งต้นของผู้เช่าให้ BU ผ่าน Prisma client แบบธรรมดาชั่วคราว
 */
@Injectable()
export class TenantSeedService {
  private readonly logger = new BackendLogger(TenantSeedService.name);

  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaSystem,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Resolve the tenant connection for a BU (mirrors TenantMigrationService).
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Result wrapping the resolved connection / Result ที่ห่อการเชื่อมต่อ
   */
  private async resolveConnection(bu_id: string): Promise<Result<ResolvedConnection>> {
    if (!UUID_RE.test(bu_id)) {
      return Result.error('Invalid bu_id format', ErrorCode.INVALID_ARGUMENT);
    }
    const bu = await this.prismaSystem.tb_business_unit.findFirst({
      where: { id: bu_id, deleted_at: null },
      select: { id: true, code: true, db_connection: true },
    });
    if (!bu) {
      return Result.error(`Business unit not found: ${bu_id}`, ErrorCode.NOT_FOUND);
    }
    if (!bu.db_connection) {
      return Result.error(
        `Business unit ${bu.code} has no database connection configured`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }
    const databaseUrl = this.tenantService.getConnectionString(
      bu.db_connection as unknown as Parameters<TenantService['getConnectionString']>[0],
    );
    if (!databaseUrl) {
      return Result.error(
        `Business unit ${bu.code} has an unsupported database provider`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }
    return Result.ok({ bu_id: bu.id, bu_code: bu.code, database_url: databaseUrl });
  }

  /**
   * Build a plain, short-lived tenant client (no audit/soft-delete extensions).
   * Overridable seam for tests. Caller MUST $disconnect().
   * @param database_url - Tenant connection string / สตริงการเชื่อมต่อผู้เช่า
   * @returns A plain tenant Prisma client / Prisma client ผู้เช่าแบบธรรมดา
   */
  protected createTenantClient(database_url: string): TenantDb {
    return new PrismaClient({ datasources: { db: { url: database_url } } }) as unknown as TenantDb;
  }

  /**
   * Report which seed rows are present/missing per set for a BU.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Result wrapping the seed status / Result ที่ห่อสถานะ seed
   */
  async getStatus(bu_id: string): Promise<Result<TenantSeedStatus>> {
    this.logger.debug({ function: 'getStatus', bu_id }, TenantSeedService.name);
    const conn = await this.resolveConnection(bu_id);
    if (conn.isError()) {
      return conn as unknown as Result<TenantSeedStatus>;
    }
    const { bu_id: id, bu_code, database_url } = conn.value;
    const tenant = this.createTenantClient(database_url);
    try {
      const sets: SeedSetStatus[] = [];
      for (const s of seedSets) {
        const missing = await s.listMissing(tenant);
        sets.push({
          key: s.key,
          label: s.label,
          defined: s.definedKeys.length,
          present: s.definedKeys.length - missing.length,
          missing,
        });
      }
      return Result.ok({
        bu_id: id,
        bu_code,
        sets,
        all_seeded: sets.every((s) => s.missing.length === 0),
      });
    } finally {
      await this.disconnect(tenant);
    }
  }

  /**
   * Stream a BU's seed run as SeedProgressEvents (start -> seeding* -> done).
   * Errors before `start` on a resolve failure.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Observable of seed-progress events / Observable ของเหตุการณ์ความคืบหน้า
   */
  deployStream(bu_id: string): Observable<SeedProgressEvent> {
    return new Observable<SeedProgressEvent>((subscriber) => {
      let cancelled = false;
      const run = async () => {
        const conn = await this.resolveConnection(bu_id);
        if (conn.isError()) {
          subscriber.error(new Error(conn.error.message || 'cannot resolve connection'));
          return;
        }
        const { bu_id: id, bu_code, database_url } = conn.value;
        const tenant = this.createTenantClient(database_url);
        try {
          const work: Array<{ set: (typeof seedSets)[number]; key: string }> = [];
          for (const s of seedSets) {
            const missing = await s.listMissing(tenant);
            for (const key of missing) work.push({ set: s, key });
          }
          const total = work.length;
          if (cancelled) return;
          subscriber.next({ type: 'start', bu_id: id, bu_code, total });
          let created = 0;
          for (let i = 0; i < work.length; i++) {
            if (cancelled) return;
            const { set, key } = work[i];
            await set.createOne(tenant, key);
            created += 1;
            subscriber.next({
              type: 'seeding',
              bu_id: id,
              bu_code,
              key: set.key,
              row_type: key,
              index: i + 1,
              total,
            });
          }
          const definedTotal = seedSets.reduce((acc, s) => acc + s.definedKeys.length, 0);
          subscriber.next({
            type: 'done',
            success: true,
            summary: { bu_id: id, bu_code, created, skipped: definedTotal - created },
          });
          subscriber.complete();
        } finally {
          await this.disconnect(tenant);
        }
      };
      run().catch((err: unknown) =>
        subscriber.error(err instanceof Error ? err : new Error(String(err))),
      );
      return () => {
        cancelled = true;
      };
    });
  }

  /** Best-effort $disconnect on a tenant client that may be a test fake. */
  private async disconnect(tenant: TenantDb): Promise<void> {
    const maybe = tenant as unknown as { $disconnect?: () => Promise<void> };
    if (typeof maybe.$disconnect === 'function') {
      await maybe.$disconnect();
    }
  }
}
```

> Note: `PrismaClient` (base, plain client) comes from `@repo/prisma-shared-schema-tenant`; the system client TYPE comes from `@repo/prisma-shared-schema-platform` (`PrismaSystem`). These are two different packages — do not merge the imports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/micro-business && npx jest src/authen/tenant_seed/tenant_seed.service.spec.ts --forceExit`
Expected: PASS (5 passing)

- [ ] **Step 6: Implement the controller**

Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.controller.ts`:

```ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Observable } from 'rxjs';
import { TenantSeedService } from './tenant_seed.service';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { BaseMicroserviceController, MicroservicePayload } from '@/common';
import type { SeedProgressEvent } from './progress-event';

/**
 * TCP message patterns for tenant seed operations.
 * รูปแบบข้อความ TCP สำหรับการดำเนินการ seed ของผู้เช่า
 */
@Controller()
export class TenantSeedController extends BaseMicroserviceController {
  private readonly logger = new BackendLogger(TenantSeedController.name);

  constructor(private readonly tenantSeedService: TenantSeedService) {
    super();
  }

  /**
   * Report seed status for one BU.
   * @param payload - Payload carrying bu_id / payload ที่มี bu_id
   * @returns Status envelope / ซองข้อมูลสถานะ
   */
  @MessagePattern({ cmd: 'tenant-seeds.status', service: 'tenant-seeds' })
  async status(@Payload() payload: MicroservicePayload & { bu_id: string }) {
    this.logger.debug({ function: 'status', bu_id: payload.bu_id }, TenantSeedController.name);
    const result = await this.tenantSeedService.getStatus(payload.bu_id);
    return this.handleResult(result);
  }

  /**
   * Stream a BU's seed run as SeedProgressEvents.
   * @param payload - Payload carrying bu_id / payload ที่มี bu_id
   * @returns Observable of seed-progress events / Observable ของเหตุการณ์ความคืบหน้า
   */
  @MessagePattern({ cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' })
  deployStream(@Payload() payload: MicroservicePayload & { bu_id: string }): Observable<SeedProgressEvent> {
    this.logger.debug({ function: 'deployStream', bu_id: payload.bu_id }, TenantSeedController.name);
    return this.tenantSeedService.deployStream(payload.bu_id);
  }
}
```

- [ ] **Step 7: Implement the module and register it**

Create `apps/micro-business/src/authen/tenant_seed/tenant_seed.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TenantModule } from '@/tenant/tenant.module';
import { TenantSeedService } from './tenant_seed.service';
import { TenantSeedController } from './tenant_seed.controller';

/**
 * Module exposing tenant seed TCP handlers; imports TenantModule for PRISMA_SYSTEM + TenantService.
 * โมดูลที่เปิดให้บริการ TCP handler สำหรับ seed ของผู้เช่า
 */
@Module({
  imports: [TenantModule],
  controllers: [TenantSeedController],
  providers: [TenantSeedService],
  exports: [TenantSeedService],
})
export class TenantSeedModule {}
```

In `apps/micro-business/src/app.module.ts`, add the import next to the existing `TenantMigrationModule` import (line 28):

```ts
import { TenantSeedModule } from './authen/tenant_seed/tenant_seed.module';
```

and add `TenantSeedModule` to the `imports:` array of the `@Module` decorator (place it directly after `TenantMigrationModule`).

- [ ] **Step 8: Build the app to verify wiring type-checks**

Run: `cd apps/micro-business && npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/authen/tenant_seed/**` or `src/app.module.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/micro-business/src/authen/tenant_seed apps/micro-business/src/app.module.ts
git commit -m "feat(tenant-seed): add tenant_seed micro-business module (status + deploy-stream)"
```

---

## Task B4: gateway `tenant-seeds` controller (HTTP + NDJSON)

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts`
- Create: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts`
- Create: `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

**Interfaces:**
- Consumes: `BUSINESS_SERVICE` `ClientProxy` (registered via `rpcClient`), the micro-business message patterns from Task B3, `TenantMigrationGuard`, `Result`, `MicroserviceResponse`, `getGatewayRequestContext`.
- Produces: HTTP routes `GET /api-system/tenant/seeds/:bu_id/status` and `POST /api-system/tenant/seeds/:bu_id/deploy/stream` (NDJSON).

- [ ] **Step 1: Implement the TCP proxy service**

Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts`:

```ts
import { Inject, HttpStatus, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { Result, MicroserviceResponse } from '@/common';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

/**
 * Local structural copy of the SeedProgressEvent union from micro-business.
 * The gateway must NOT import across app boundaries, so we redeclare it here.
 */
type SeedProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'seeding'; bu_id: string; bu_code: string; key: string; row_type: string; index: number; total: number }
  | { type: 'done'; success: boolean; summary: { bu_id: string; bu_code: string; created: number; skipped: number } }
  | { type: 'error'; message: string };

/**
 * Proxies tenant seed operations to the micro-business TCP service.
 * ส่งต่อการดำเนินการ seed ของผู้เช่าไปยังบริการ TCP micro-business
 */
@Injectable()
export class TenantSeedsService {
  private readonly logger = new BackendLogger(TenantSeedsService.name);

  constructor(@Inject('BUSINESS_SERVICE') private readonly client: ClientProxy) {}

  /**
   * Report seed status for a BU.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Status result / ผลลัพธ์สถานะ
   */
  async getStatus(bu_id: string): Promise<unknown> {
    this.logger.debug({ function: 'getStatus', bu_id }, TenantSeedsService.name);
    const res: Observable<MicroserviceResponse> = this.client.send(
      { cmd: 'tenant-seeds.status', service: 'tenant-seeds' },
      { bu_id, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }
    return Result.ok(response.data);
  }

  /**
   * Stream tenant seed progress for a BU (one emission per SeedProgressEvent).
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Observable of seed-progress events / Observable ของเหตุการณ์ความคืบหน้า
   */
  runDeployStream(bu_id: string): Observable<SeedProgressEvent> {
    this.logger.debug({ function: 'runDeployStream', bu_id }, TenantSeedsService.name);
    return this.client.send<SeedProgressEvent>(
      { cmd: 'tenant-seeds.deploy-stream', service: 'tenant-seeds' },
      { bu_id, ...getGatewayRequestContext() },
    );
  }
}
```

- [ ] **Step 2: Implement the HTTP controller**

Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantSeedsService } from './tenant-seeds.service';
import { TenantMigrationGuard } from 'src/auth/guards/tenant-migration.guard';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { BaseHttpController } from '@/common';

/**
 * System endpoints to seed default tenant master data per BU (super-admin or deploy token).
 * endpoint ระบบสำหรับ seed ข้อมูลตั้งต้นของผู้เช่าต่อ BU
 */
@Controller('api-system/tenant/seeds')
@ApiTags('Platform: Tenant Seeds')
@UseGuards(TenantMigrationGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-deploy-token',
  required: false,
  description: 'CI/CD deploy token (alternative to a super-admin bearer token)',
})
export class TenantSeedsController extends BaseHttpController {
  private readonly logger = new BackendLogger(TenantSeedsController.name);

  constructor(private readonly tenantSeedsService: TenantSeedsService) {
    super();
  }

  /**
   * Map a pre-stream failure message to the matching HTTP status.
   * @param message - Sanitized error message / ข้อความผิดพลาด
   * @returns The HTTP status to return before any NDJSON byte / สถานะ HTTP
   */
  private resolvePreStreamErrorStatus(message: string): HttpStatus {
    if (/not found/i.test(message)) {
      return HttpStatus.NOT_FOUND;
    }
    if (/no database connection configured|unsupported database provider/i.test(message)) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    if (/invalid bu_id format/i.test(message)) {
      return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Report tenant seed status for a BU.
   * @param res - HTTP response / การตอบกลับ HTTP
   * @param id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Nothing (writes to res) / ไม่คืนค่า
   */
  @Get(':bu_id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant seed status', operationId: 'tenantSeed_status' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiResponse({ status: 200, description: 'Seed status retrieved' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  async status(@Res() res: Response, @Param('bu_id') id: string): Promise<void> {
    const result = await this.tenantSeedsService.getStatus(id);
    this.respond(res, result);
  }

  /**
   * Stream tenant seed progress as NDJSON (one SeedProgressEvent per line).
   * @param req - HTTP request / คำขอ HTTP
   * @param res - HTTP response (NDJSON stream) / การตอบกลับ HTTP
   * @param id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Promise settled when the stream ends / Promise ที่ settle เมื่อสตรีมจบ
   */
  @Post(':bu_id/deploy/stream')
  @ApiOperation({ summary: 'Stream tenant seed (NDJSON)', operationId: 'tenantSeed_deployStream' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiResponse({ status: 200, description: 'application/x-ndjson stream of SeedProgressEvent objects' })
  @ApiResponse({ status: 400, description: 'Invalid bu_id format' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  @ApiResponse({ status: 404, description: 'Business unit not found' })
  @ApiResponse({ status: 422, description: 'Business unit has no/unsupported database connection' })
  deployStream(@Req() req: Request, @Res() res: Response, @Param('bu_id') id: string): Promise<void> {
    return new Promise<void>((settle) => {
      let started = false;
      const startNdjson = () => {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        started = true;
      };

      const sub = this.tenantSeedsService.runDeployStream(id).subscribe({
        next: (event) => {
          if (!started) startNdjson();
          res.write(JSON.stringify(event) + '\n');
        },
        error: (err: Error) => {
          if (!started) {
            const status = this.resolvePreStreamErrorStatus(err.message);
            res.status(status).json({ message: err.message, status, success: false });
          } else {
            res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
            res.end();
          }
          settle();
        },
        complete: () => {
          res.end();
          settle();
        },
      });

      req.on('close', () => {
        sub.unsubscribe();
        settle();
      });
    });
  }
}
```

- [ ] **Step 3: Implement the module and register it**

Create `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { envConfig } from 'src/libs/config.env';
import { TenantSeedsController } from './tenant-seeds.controller';
import { TenantSeedsService } from './tenant-seeds.service';
import { TenantMigrationGuard } from 'src/auth/guards/tenant-migration.guard';
import { PlatformSuperAdminGuard } from 'src/auth/guards/platform-super-admin.guard';
import { rpcClient } from '@repo/nest-http-transport';

/**
 * Registers the tenant-seeds controller, TCP proxy service, and auth guards.
 * ลงทะเบียน controller, บริการ proxy TCP และ guard ของ tenant-seeds
 */
@Module({
  imports: [
    ClientsModule.register([
      rpcClient({ name: 'BUSINESS_SERVICE', host: envConfig.BUSINESS_SERVICE_HOST, port: Number(envConfig.BUSINESS_SERVICE_RPC_PORT) }),
    ]),
  ],
  controllers: [TenantSeedsController],
  providers: [TenantSeedsService, TenantMigrationGuard, PlatformSuperAdminGuard],
})
export class TenantSeedsModule {}
```

In `apps/backend-gateway/src/app.module.ts`, add next to the `TenantMigrationsModule` import (line 37):

```ts
import { TenantSeedsModule } from './platform/tenant-seeds/tenant-seeds.module';
```

and add `TenantSeedsModule` to the `imports:` array directly after `TenantMigrationsModule` (line 89).

- [ ] **Step 4: Build the gateway to verify wiring type-checks**

Run: `cd apps/backend-gateway && npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/platform/tenant-seeds/**` or `src/app.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/tenant-seeds apps/backend-gateway/src/app.module.ts
git commit -m "feat(tenant-seed): add gateway tenant-seeds controller (status + NDJSON stream)"
```

---

## Task F1: Frontend seed types

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/types/index.ts` (after the existing migration types, ~line 219)

**Interfaces:**
- Produces: `SeedSetStatus`, `TenantSeedStatus`, `SeedDeploySummary`, `SeedProgressEvent`.

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, immediately after the migration `ProgressEvent` union (the line ending `| { type: 'error'; message: string };` at ~line 219), add:

```ts
// Tenant seed data (super-admin) — /api-system/tenant/seeds/:bu_id/*
export interface SeedSetStatus {
  key: string;
  label: string;
  defined: number;
  present: number;
  missing: string[];
}

export interface TenantSeedStatus {
  bu_id: string;
  bu_code: string;
  sets: SeedSetStatus[];
  all_seeded: boolean;
}

export interface SeedDeploySummary {
  bu_id: string;
  bu_code: string;
  created: number;
  skipped: number;
}

export type SeedProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'seeding'; bu_id: string; bu_code: string; key: string; row_type: string; index: number; total: number }
  | { type: 'done'; success: boolean; summary: SeedDeploySummary }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(tenant-seed): add frontend seed status + progress types"
```

---

## Task F2: `tenantSeedService` + `seedError` util

**Repo:** `carmen-platform`

**Files:**
- Create: `src/services/tenantSeedService.ts`
- Create: `src/utils/seedError.ts`
- Test: `src/services/tenantSeedService.test.ts`

**Interfaces:**
- Consumes: `TenantSeedStatus`, `SeedProgressEvent`, `SeedDeploySummary` (Task F1); `api` from `./api`; `parseApiError` from `../utils/errorParser`.
- Produces:
  - `tenantSeedService.getStatus(buId: string): Promise<TenantSeedStatus>`
  - `tenantSeedService.deployStream(buId: string, onEvent: (e: SeedProgressEvent) => void): Promise<SeedDeploySummary>`
  - `handleSeedError(err: unknown): void`

- [ ] **Step 1: Write the failing service test**

Create `src/services/tenantSeedService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tenantSeedService from './tenantSeedService';
import type { SeedProgressEvent } from '../types';

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

const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

describe('tenantSeedService.deployStream', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('parses NDJSON (including a split line) and calls onEvent per event', async () => {
    const events: SeedProgressEvent[] = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 2 },
      { type: 'seeding', bu_id: 'b', bu_code: 'B', key: 'running-code', row_type: 'PURCHASE-ORDER', index: 1, total: 2 },
      { type: 'seeding', bu_id: 'b', bu_code: 'B', key: 'running-code', row_type: 'CREDIT-NOTE', index: 2, total: 2 },
      { type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 2, skipped: 12 } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    const mid = Math.floor(ndjson.length / 2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson.slice(0, mid), ndjson.slice(mid)]) as never);

    const seen: SeedProgressEvent[] = [];
    const summary = await tenantSeedService.deployStream('b', (e) => seen.push(e));

    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ created: 2, skipped: 12 });
  });

  it('POSTs the seeds stream endpoint with Authorization header', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 14 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-9', () => {});
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/seeds/bu-9/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws on a pre-stream HTTP error (parses the JSON body)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'no database connection configured' }),
    } as never);
    await expect(tenantSeedService.deployStream('b', () => {})).rejects.toThrow(/no database connection/);
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'b', bu_code: 'B', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'seed failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantSeedService.deployStream('b', () => {})).rejects.toThrow(/seed failed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/services/tenantSeedService.test.ts`
Expected: FAIL — cannot resolve `./tenantSeedService`.

- [ ] **Step 3: Implement the service**

Create `src/services/tenantSeedService.ts`:

```ts
import api from './api';
import type { TenantSeedStatus, SeedProgressEvent, SeedDeploySummary } from '../types';

// Tenant default-data seeding for a single BU. Super-admin only (backend enforces
// it; the axios interceptor supplies the bearer token + x-app-id). The backend
// resolves the target tenant DB from the BU's stored db_connection, so we send
// only the bu_id. Mirrors tenantMigrationService.
const tenantSeedService = {
  getStatus: async (buId: string): Promise<TenantSeedStatus> => {
    const res = await api.get(`/api-system/tenant/seeds/${buId}/status`);
    return res.data.data ?? res.data;
  },

  /**
   * Stream a single-BU seed run as NDJSON SeedProgressEvents. Uses fetch (not
   * EventSource) so it can send the bearer token + x-app-id. Rejects on a
   * pre-stream HTTP error or a terminal error event; resolves with the `done` summary.
   */
  deployStream: async (
    buId: string,
    onEvent: (e: SeedProgressEvent) => void,
  ): Promise<SeedDeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/seeds/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Seed stream failed (${res.status})`);
    }

    if (!res.body) throw new Error('Seed stream: response body is null');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: SeedDeploySummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as SeedProgressEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') summary = event.summary;
    };

    try {
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
    } finally {
      reader.cancel().catch(() => {});
    }

    if (!summary) throw new Error('Seed stream ended without a result');
    return summary;
  },
};

export default tenantSeedService;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/services/tenantSeedService.test.ts`
Expected: PASS (4 passing)

- [ ] **Step 5: Add the seed error helper**

Create `src/utils/seedError.ts`:

```ts
import { toast } from 'sonner';
import { parseApiError } from './errorParser';

/** Map a tenant-seed API error to a canonical toast. */
export const handleSeedError = (err: unknown): void => {
  const code = (err as { response?: { status?: number } })?.response?.status;
  if (code === 403) {
    toast.error('Seeding is disabled or requires super-admin.');
  } else {
    toast.error(parseApiError(err).message);
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add src/services/tenantSeedService.ts src/services/tenantSeedService.test.ts src/utils/seedError.ts
git commit -m "feat(tenant-seed): add tenantSeedService + seedError util"
```

---

## Task F3: `TenantSeedCard` component

**Repo:** `carmen-platform`

**Files:**
- Create: `src/components/TenantSeedCard.tsx`
- Test: `src/components/TenantSeedCard.test.tsx`

**Interfaces:**
- Consumes: `tenantSeedService` (F2), `handleSeedError` (F2), `TenantSeedStatus`, `SeedProgressEvent` (F1).
- Produces: `export const TenantSeedCard` + `export default TenantSeedCard` with props `{ buId: string; buCode: string; buName: string; hasDbConnection: boolean; isSuperAdmin: boolean }`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/TenantSeedCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantSeedCard } from './TenantSeedCard';
import tenantSeedService from '../services/tenantSeedService';
import type { SeedProgressEvent } from '../types';

vi.mock('../services/tenantSeedService', () => ({
  default: { getStatus: vi.fn(), deployStream: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const svc = tenantSeedService as unknown as {
  getStatus: ReturnType<typeof vi.fn>;
  deployStream: ReturnType<typeof vi.fn>;
};

const baseProps = { buId: 'bu-1', buCode: 'ZEBRA', buName: 'Zebra Hotel', hasDbConnection: true, isSuperAdmin: true };

describe('TenantSeedCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('checks status and shows missing rows, then enables seeding', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] }],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    expect(await screen.findByText(/2 missing/i)).toBeInTheDocument();
    expect(screen.getByText('PRODUCT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /seed 2 row/i })).toBeEnabled();
  });

  it('shows "seeded" and no seed button when all_seeded', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: true,
      sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] }],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    expect(await screen.findByText(/seeded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /seed \d+ row/i })).not.toBeInTheDocument();
  });

  it('runs a seed: streams progress, confirms, then re-checks', async () => {
    svc.getStatus
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 13, missing: ['PRODUCT'] }],
      })
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: true,
        sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] }],
      });
    svc.deployStream.mockImplementation(async (_buId: string, onEvent: (e: SeedProgressEvent) => void) => {
      onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'ZEBRA', total: 1 });
      onEvent({ type: 'seeding', bu_id: 'bu-1', bu_code: 'ZEBRA', key: 'running-code', row_type: 'PRODUCT', index: 1, total: 1 });
      return { bu_id: 'bu-1', bu_code: 'ZEBRA', created: 1, skipped: 13 };
    });

    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    await userEvent.click(await screen.findByRole('button', { name: /seed 1 row/i }));
    // ConfirmDialog confirm button
    await userEvent.click(await screen.findByRole('button', { name: /^seed$/i }));

    await waitFor(() => expect(svc.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function)));
    await waitFor(() => expect(svc.getStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/seeded/i)).toBeInTheDocument();
  });

  it('disables actions and shows a reason when not super-admin', () => {
    render(<TenantSeedCard {...baseProps} isSuperAdmin={false} />);
    expect(screen.getByRole('button', { name: /check status/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/components/TenantSeedCard.test.tsx`
Expected: FAIL — cannot resolve `./TenantSeedCard`.

- [ ] **Step 3: Implement the component**

Create `src/components/TenantSeedCard.tsx`:

```tsx
import { useMemo, useState, type ReactElement } from 'react';
import { Sprout, Loader2, RefreshCw, Play } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Tooltip } from './ui/tooltip';
import { toast } from 'sonner';
import { handleSeedError } from '../utils/seedError';
import tenantSeedService from '../services/tenantSeedService';
import type { TenantSeedStatus, SeedProgressEvent } from '../types';

interface TenantSeedCardProps {
  buId: string;
  buCode: string;
  buName: string;
  hasDbConnection: boolean;
  isSuperAdmin: boolean;
}

export const TenantSeedCard = ({
  buId,
  buCode,
  buName,
  hasDbConnection,
  isSuperAdmin,
}: TenantSeedCardProps): ReactElement => {
  const [status, setStatus] = useState<TenantSeedStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const disabledReason = !isSuperAdmin
    ? 'Super-admin required.'
    : !hasDbConnection
    ? 'Configure a database connection first.'
    : null;
  const busy = loadingStatus || seeding;
  const actionsDisabled = disabledReason !== null || busy;

  const totalMissing = useMemo(
    () => (status ? status.sets.reduce((acc, s) => acc + s.missing.length, 0) : 0),
    [status],
  );

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const s = await tenantSeedService.getStatus(buId);
      setStatus(s);
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setLastChecked(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    } catch (err) {
      handleSeedError(err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const runSeed = async () => {
    setConfirmOpen(false);
    setSeeding(true);
    setProgress({ done: 0, total: totalMissing, current: null });
    setLogLines([]);
    try {
      const onEvent = (e: SeedProgressEvent) => {
        if (e.type === 'start') setProgress({ done: 0, total: e.total, current: null });
        else if (e.type === 'seeding') {
          setProgress({ done: e.index, total: e.total, current: e.row_type });
          setLogLines((prev) => [...prev, `${e.key}: ${e.row_type}`]);
        }
      };
      const summary = await tenantSeedService.deployStream(buId, onEvent);
      if (summary.created === 0) toast.info('Nothing to seed — already up to date.');
      else toast.success(`Created ${summary.created} row(s) for ${buCode} (skipped ${summary.skipped}).`);
      await fetchStatus();
    } catch (err) {
      handleSeedError(err);
    } finally {
      setProgress(null);
      setSeeding(false);
    }
  };

  // Wrap a (possibly disabled) button so its tooltip still fires — a disabled
  // <button> is removed from the tab order, so wrap it in a focusable span.
  const withTooltip = (el: ReactElement): ReactElement =>
    disabledReason ? (
      <Tooltip content={disabledReason}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>{el}</span>
      </Tooltip>
    ) : (
      el
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sprout className="h-4 w-4" /> Tenant Seed Data
        </CardTitle>
        <CardDescription>
          Check and seed default master data (running codes) into this BU&apos;s tenant database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {withTooltip(
            <Button type="button" size="sm" variant="outline" onClick={fetchStatus} disabled={actionsDisabled}>
              {loadingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {loadingStatus ? 'Checking...' : status ? 'Re-check status' : 'Check status'}
            </Button>,
          )}

          {status?.all_seeded && <Badge variant="success">Seeded</Badge>}
          {status && !status.all_seeded && <Badge variant="secondary">{totalMissing} missing</Badge>}
          {lastChecked && <span className="text-xs text-muted-foreground">Last checked {lastChecked}</span>}
        </div>

        {status && !status.all_seeded && (
          <div className="space-y-2">
            {status.sets
              .filter((s) => s.missing.length > 0)
              .map((s) => (
                <div key={s.key} className="space-y-1">
                  <p className="text-sm font-medium">
                    {s.label}{' '}
                    <span className="text-muted-foreground">
                      ({s.present}/{s.defined} present, {s.missing.length} missing)
                    </span>
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                    {s.missing.map((name) => (
                      <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {withTooltip(
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={actionsDisabled}>
                <Play className="mr-2 h-4 w-4" />
                Seed {totalMissing} row(s)
              </Button>,
            )}
          </div>
        )}

        {seeding && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Seeding…</span>
              <span className="text-muted-foreground">
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.current && (
              <p className="break-all font-mono text-xs text-muted-foreground">{progress.current}</p>
            )}
            {logLines.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                {logLines.map((name, i) => (
                  <li key={`${name}-${i}`} className="break-all font-mono text-xs text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Seed tenant data"
        description={`Seed ${totalMissing} default row(s) into ${buName} (${buCode})? This creates missing default master data in the tenant database. Existing rows are left unchanged.`}
        confirmText="Seed"
        onConfirm={runSeed}
      />
    </Card>
  );
};

export default TenantSeedCard;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test -- src/components/TenantSeedCard.test.tsx`
Expected: PASS (4 passing)

> If the ConfirmDialog confirm-button query `/^seed$/i` is ambiguous with the "Seed N row(s)" trigger, the trigger button will already be unmounted or the dialog's button is the only exact "Seed" match — the regex `^seed$` matches only the confirm button. If the test still fails on ambiguity, scope the query with `within(screen.getByRole('alertdialog'))`.

- [ ] **Step 5: Commit**

```bash
git add src/components/TenantSeedCard.tsx src/components/TenantSeedCard.test.tsx
git commit -m "feat(tenant-seed): add TenantSeedCard component"
```

---

## Task F4: Wire `TenantSeedCard` into the BU Edit page

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx` (import near line 21; render after the `TenantMigrationCard` block ~line 525)

**Interfaces:**
- Consumes: `TenantSeedCard` (F3).

- [ ] **Step 1: Import the card**

In `src/pages/BusinessUnitEdit.tsx`, directly after the existing `import TenantMigrationCard from '../components/TenantMigrationCard';` (line 21), add:

```tsx
import TenantSeedCard from '../components/TenantSeedCard';
```

- [ ] **Step 2: Render it after the migration card**

In `src/pages/BusinessUnitEdit.tsx`, immediately after the closing `)}` of the `{!isNew && ( <TenantMigrationCard … /> )}` block (the block ending around line 525), add:

```tsx
        {/* Tenant default-data seeding (existing BU only; super-admin action) */}
        {!isNew && (
          <TenantSeedCard
            key={`seed-${id}`}
            buId={id!}
            buCode={formData.code}
            buName={formData.name}
            hasDbConnection={formData.db_connection.length > 0}
            isSuperAdmin={isSuperAdmin}
          />
        )}
```

- [ ] **Step 3: Type-check + run the full frontend test suite**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && npx tsc --noEmit && bun run test`
Expected: no type errors; all tests pass (including the new `tenantSeedService` + `TenantSeedCard` suites).

- [ ] **Step 4: Manual smoke (optional, needs a running backend)**

Run: `bun start`, open `/business-units/<an existing BU id>/edit`, confirm the "Tenant Seed Data" card renders after "Tenant Migrations". As a super-admin with a BU that has a db_connection: click **Check status** → missing rows list → **Seed N row(s)** → confirm → progress bar → success toast → status flips to **Seeded**.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx
git commit -m "feat(tenant-seed): render TenantSeedCard on the BU Edit page"
```

---

## Self-Review Notes (coverage vs spec)

- **Interface (card on BU Edit page):** Task F3 + F4. ✅
- **Two-step Check → Seed, streaming:** F2 (service stream), F3 (card), B3/B4 (backend status + NDJSON). ✅
- **Registry, running-code first, extensible:** B2 (`seedSets`), B1 (shared data). ✅
- **Execution model A (plain per-BU Prisma client, no CLI spawn):** B3 `createTenantClient` + `$disconnect`. ✅
- **Super-admin only:** B4 reuses `TenantMigrationGuard`; F3 gates UI + shows reason. ✅
- **Idempotent, non-destructive, keyed on type:** B2 `listMissing`/`createOne`, create-if-missing. ✅
- **Error handling (no db_connection disables; not-found/unsupported/invalid → mapped status → toast):** B3 `resolveConnection`, B4 `resolvePreStreamErrorStatus`, F2 `handleSeedError`, F3 `disabledReason`. ✅
- **Distinct seed ProgressEvent types:** B3 `SeedProgressEvent`, F1 `SeedProgressEvent`. ✅
- **Testing (backend service + seed-set specs; frontend service + card specs):** B1, B2, B3, F2, F3. ✅
- **Out of scope (cross-BU seed-all, extra seed sets, overwrite mode):** not implemented, per spec. ✅
```
