# Tenant Seed Fleet Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/tenant-seeds` page that checks every BU's tenant seed status in one table and lets a super admin seed what is missing, per row or for the whole fleet.

**Architecture:** FE-only. The page loads all BUs once, fans `GET /api-system/tenant/seeds/:bu_id/status` out with `mapWithConcurrency(…, 4)`, and seeds through the existing per-BU NDJSON stream (`tenantSeedService.deployStream`), sequentially for "Seed all". It mirrors `src/pages/TenantMigrationManagement.tsx`; pure row-state logic lives in a small helper module, the summary band in its own component.

**Tech Stack:** React 19 + TypeScript, Vite, shadcn/ui, TanStack Table (`DataTable`), sonner, lucide-react, in-repo i18n (`src/i18n/en.ts` / `th.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-tenant-seed-fleet-page-design.md`

## Global Constraints

- **No new test files** (owner's standing preference). Each task ends with `bun run typecheck` + `bun run lint`; Task 6 also runs the existing `bun run test`.
- No backend change, no new dependency, no edit under `src/components/ui/`.
- Never `alert()` / `window.confirm()` — `toast.*` and `<ConfirmDialog>` only.
- Every action (Check, Check all, Seed, Seed all) is super-admin-only; handlers also early-return when `!isSuperAdmin`.
- `DataTable`: no `#` column; column defs in `useMemo`.
- Status badges use `<Badge variant=…>` (`success` / `warning` / `secondary` / `destructive` / `outline`), never raw colour classes.
- Debug-only UI stays inside `DevDebugSheet` (already dev-gated).
- `th.ts` must have every key `en.ts` has (`Translations = typeof en` — tsc fails otherwise).
- Branch: `feature/tenant-seed-fleet-page` (already created; spec committed as `5fa100b`).

## Review Focus

No automated tests are written, so each of these is pinned by a manual check in Task 7:

1. BU list omits `database_pool_id`/`db_schema` → BU must be treated as *has DB* (backend 422 becomes an Error row), not silently marked *No DB* and skipped.
2. Navigating away mid "Seed all" → loop stops before the next BU, no toast, no React state-update warning.
3. One BU fails during "Seed all" → error lands on that row, loop continues, end toast is `warning` with both counts.
4. Seed on a row whose set list changed since the last check → only sets with `missing.length > 0` at click time are sent; the row is re-checked from the server afterwards.
5. Non-super-admin → table renders, every action button disabled with the "Super-admin required" tooltip, no status request fired.

---

### Task 1: `deployStream` accepts an `AbortSignal`

**Files:**
- Modify: `src/services/tenantSeedService.ts` (the `deployStream` member)

**Interfaces:**
- Produces: `tenantSeedService.deployStream(buId: string, onEvent: (e: SeedProgressEvent) => void, keys?: string[], signal?: AbortSignal): Promise<SeedDeploySummary>` — existing callers pass 2–3 args and are unaffected.

- [ ] **Step 1: Add the parameter and pass it to `fetch`**

Replace the doc comment + signature + `fetch` options of `deployStream` with:

```ts
  /**
   * Stream a single-BU seed run as NDJSON SeedProgressEvents. Uses fetch (not
   * EventSource) so it can send the bearer token + x-app-id. Rejects on a
   * pre-stream HTTP error or a terminal error event; resolves with the `done` summary.
   *
   * `signal` only stops the browser listening. The gateway unsubscribes from the RPC
   * stream when the response closes (`tenant-seeds.controller.ts`, `res.on('close')`);
   * whether micro-business finishes the in-flight set is unverified. Re-running is safe
   * either way — seeding skips rows that already exist (`SeedDeploySummary.skipped`).
   */
  deployStream: async (
    buId: string,
    onEvent: (e: SeedProgressEvent) => void,
    keys?: string[],
    signal?: AbortSignal,
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
      signal,
    });
```

Leave the rest of the function body unchanged.

- [ ] **Step 2: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/tenantSeedService.ts
git commit -m "feat(tenant-seed): deployStream รับ AbortSignal"
```

---

### Task 2: Pure row-state helpers

**Files:**
- Create: `src/pages/tenantSeed/seedRowState.ts`

**Interfaces:**
- Consumes: `BusinessUnit`, `TenantSeedStatus` from `src/types`.
- Produces (all exported):
  - `type SeedRowStatus = 'unknown' | 'seeded' | 'missing' | 'no_db' | 'error'`
  - `interface SeedRowState { status?: TenantSeedStatus; checking: boolean; seeding: boolean; progress?: { done: number; total: number; current: string | null }; lastChecked?: string; errorMsg?: string }`
  - `interface SeedFleetCounts { seeded: number; missing: number; no_db: number; error: number; unknown: number; missingRows: number }`
  - `hasDb(bu: BusinessUnit): boolean`
  - `missingKeys(status?: TenantSeedStatus): string[]`
  - `missingCount(status?: TenantSeedStatus): number`
  - `seedRowStatusOf(bu: BusinessUnit, rs?: SeedRowState): SeedRowStatus`
  - `SEED_STATUS_RANK: Record<SeedRowStatus, number>`
  - `summarizeFleet(bus: BusinessUnit[], rowState: Record<string, SeedRowState>): SeedFleetCounts`
  - `nowTime(): string` (`HH:MM:SS`)

- [ ] **Step 1: Write the module**

```ts
// src/pages/tenantSeed/seedRowState.ts
import type { BusinessUnit, TenantSeedStatus } from '../../types';

export type SeedRowStatus = 'unknown' | 'seeded' | 'missing' | 'no_db' | 'error';

export interface SeedRowState {
  status?: TenantSeedStatus;
  checking: boolean;
  seeding: boolean;
  progress?: { done: number; total: number; current: string | null };
  lastChecked?: string;
  errorMsg?: string;
}

export interface SeedFleetCounts {
  seeded: number;
  missing: number;
  no_db: number;
  error: number;
  unknown: number;
  /** Total missing rows across BUs whose status is `missing`. */
  missingRows: number;
}

/**
 * Same test BusinessUnitEdit passes to TenantSeedCard as `hasDbConnection`.
 * If the list response omits the fields entirely we cannot tell, so we answer "yes"
 * and let the backend's 422 ("no database connection configured") surface as an
 * Error row — skipping a BU silently would hide exactly the one that needs attention.
 */
export const hasDb = (bu: BusinessUnit): boolean => {
  const poolKnown = 'database_pool_id' in bu || 'database_pool' in bu;
  const schemaKnown = 'db_schema' in bu;
  if (!poolKnown || !schemaKnown) return true;
  return !!(bu.database_pool_id ?? bu.database_pool?.id) && !!bu.db_schema;
};

export const missingKeys = (status?: TenantSeedStatus): string[] =>
  status ? status.sets.filter((s) => s.missing.length > 0).map((s) => s.key) : [];

export const missingCount = (status?: TenantSeedStatus): number =>
  status ? status.sets.reduce((acc, s) => acc + s.missing.length, 0) : 0;

export const seedRowStatusOf = (bu: BusinessUnit, rs?: SeedRowState): SeedRowStatus => {
  if (!hasDb(bu)) return 'no_db';
  if (rs?.errorMsg) return 'error';
  if (!rs?.status) return 'unknown';
  return missingCount(rs.status) > 0 ? 'missing' : 'seeded';
};

// Sort order for the Status column: what needs attention first (asc).
export const SEED_STATUS_RANK: Record<SeedRowStatus, number> = {
  error: 0,
  missing: 1,
  unknown: 2,
  no_db: 3,
  seeded: 4,
};

export const summarizeFleet = (
  bus: BusinessUnit[],
  rowState: Record<string, SeedRowState>,
): SeedFleetCounts => {
  const acc: SeedFleetCounts = { seeded: 0, missing: 0, no_db: 0, error: 0, unknown: 0, missingRows: 0 };
  for (const bu of bus) {
    const st = seedRowStatusOf(bu, rowState[bu.id]);
    acc[st]++;
    if (st === 'missing') acc.missingRows += missingCount(rowState[bu.id]?.status);
  }
  return acc;
};

export const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
```

Note: `seedRowStatusOf` derives *seeded* from `missingCount === 0`, not from `all_seeded`, so the badge and the Sets column can never disagree.

- [ ] **Step 2: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/tenantSeed/seedRowState.ts
git commit -m "feat(tenant-seed): helper สถานะแถวสำหรับหน้า seed ทั้ง fleet"
```

---

### Task 3: i18n keys (en + th)

**Files:**
- Modify: `src/i18n/en.ts` — `nav` block (after `tenantMigrations: 'Tenant Migrations',` ~line 21), `breadcrumb` block (after `tenantMigrations` ~line 87), and a new `tenantSeed` block inside `pages`, placed right after the closing `},` of `pages.tenantMigration` (~line 3475, before `// ── slice 9c: Platform Config ──`).
- Modify: `src/i18n/th.ts` — same three places (`nav` ~line 20, `breadcrumb` ~line 84, after `pages.tenantMigration`'s closing `},` ~line 2446, before `platformConfig: {`).

**Interfaces:**
- Produces: `nav.tenantSeeds`, `breadcrumb.tenantSeeds`, and every `pages.tenantSeed.*` key below — Tasks 4–6 use exactly these names.

- [ ] **Step 1: `en.ts` — nav + breadcrumb**

In `nav`, after `tenantMigrations: 'Tenant Migrations',` add:

```ts
    tenantSeeds: 'Tenant Seed Data',
```

In `breadcrumb`, after `tenantMigrations: 'Tenant Migrations',` add:

```ts
    tenantSeeds: 'Tenant Seed Data',
```

- [ ] **Step 2: `en.ts` — `pages.tenantSeed`**

```ts
    tenantSeed: {
      // TenantSeedManagement — fleet view of the per-BU TenantSeedCard
      title: 'Tenant seed data',
      subtitle: 'Check which tenant databases are missing default seed data, and fill the gaps.',
      superAdminRequired: 'Super-admin required.',
      loadBuFailed: 'Failed to load business units: {{detail}}',
      showingPartial: 'Showing {{shown}} of {{total}} business units. Increase the page size to see all.',
      statusNotChecked: 'Not checked',
      statusSeeded: 'Seeded',
      statusMissing: '{{count}} missing',
      statusNoDb: 'No DB',
      statusError: 'Error',
      noDbReason: 'This business unit has no database pool or schema configured.',
      seedingProgress: 'Seeding {{done}}/{{total}}',
      columnSets: 'Missing sets',
      columnLastChecked: 'Last Checked',
      columnMissingCsv: 'Missing rows',
      columnErrorCsv: 'Error',
      check: 'Check',
      checkAll: 'Check all',
      checking: 'Checking...',
      seed: 'Seed',
      seedAll: 'Seed all missing',
      seedMissing: 'Seed {{count}} missing',
      nothingToSeed: 'Every checked tenant is fully seeded — nothing to seed.',
      seedUncheckedHint: 'Not checked yet. Run Check all first to see what this would touch.',
      batchProgress: 'BU {{index}}/{{total}} — {{code}}',
      checkAllDone: 'Checked {{count}} business units.',
      checkAllPartial: 'Checked {{ok}} · {{failed}} failed.',
      seededOne: 'Created {{count}} rows in {{code}}.',
      nothingCreated: '{{code}} was already fully seeded.',
      seedAllDone: 'Seeded {{count}} business units.',
      seedAllPartial: 'Seeded {{ok}} · {{failed}} failed.',
      seedTitle: 'Seed default data?',
      seedDescription: 'Create {{count}} missing rows in {{name}} ({{code}}). Rows that already exist are skipped.',
      seedAllTitle: 'Seed all missing tenants?',
      seedAllDescription: 'Seed {{rows}} missing rows into {{count}} business units, one at a time. Rows that already exist are skipped. Leaving this page stops before the next business unit.',
      searchPlaceholder: 'Search business units...',
      emptyTitle: 'No business units',
      emptyDescription: 'Create a business unit before seeding tenant data.',
      goToBusinessUnits: 'Go to Business Units',
      tenantsSeeded: 'Tenants seeded',
      legendSeeded: 'Seeded',
      legendMissing: 'Missing',
      legendError: 'Error',
      legendNoDb: 'No DB',
      missingRows: 'missing rows',
      notCheckedYet: 'Not checked yet — run Check all to see which tenants are missing seed data.',
      chartAria: '{{seeded}} seeded, {{missing}} missing, {{errored}} errored',
      notCheckedAria: 'Seed status not checked yet',
    },
```

- [ ] **Step 3: `th.ts` — nav + breadcrumb**

In `nav` after `tenantMigrations`:

```ts
    tenantSeeds: 'Tenant Seed Data',
```

In `breadcrumb` after `tenantMigrations`:

```ts
    tenantSeeds: 'Tenant Seed Data',
```

(Kept in English, same precedent as `tenantMigrations` in `th.ts`.)

- [ ] **Step 4: `th.ts` — `pages.tenantSeed`**

```ts
    tenantSeed: {
      // TenantSeedManagement — มุมมองทั้ง fleet ของ TenantSeedCard ราย BU
      title: 'ข้อมูลตั้งต้นของ tenant',
      subtitle: 'ตรวจว่า tenant ตัวไหนยังขาดข้อมูลตั้งต้น แล้วเติมส่วนที่ขาด',
      superAdminRequired: 'ต้องใช้สิทธิ์ super admin',
      loadBuFailed: 'โหลด business unit ไม่สำเร็จ: {{detail}}',
      showingPartial: 'แสดง {{shown}} จาก {{total}} business unit — เพิ่มขนาดหน้าเพื่อดูทั้งหมด',
      statusNotChecked: 'ยังไม่ตรวจ',
      statusSeeded: 'ครบแล้ว',
      statusMissing: 'ขาด {{count}} รายการ',
      statusNoDb: 'ไม่มี DB',
      statusError: 'ผิดพลาด',
      noDbReason: 'business unit นี้ยังไม่ได้ตั้ง database pool หรือ schema',
      seedingProgress: 'กำลัง seed {{done}}/{{total}}',
      columnSets: 'ชุดที่ขาด',
      columnLastChecked: 'ตรวจล่าสุด',
      columnMissingCsv: 'จำนวนที่ขาด',
      columnErrorCsv: 'ข้อผิดพลาด',
      check: 'ตรวจ',
      checkAll: 'ตรวจทั้งหมด',
      checking: 'กำลังตรวจ...',
      seed: 'Seed',
      seedAll: 'Seed ทุกตัวที่ขาด',
      seedMissing: 'Seed {{count}} ตัวที่ขาด',
      nothingToSeed: 'tenant ที่ตรวจแล้วมีข้อมูลครบทุกตัว ไม่มีอะไรต้อง seed',
      seedUncheckedHint: 'ยังไม่ได้ตรวจ — กด ตรวจทั้งหมด ก่อนเพื่อดูว่าจะไปแตะตัวไหนบ้าง',
      batchProgress: 'BU {{index}}/{{total}} — {{code}}',
      checkAllDone: 'ตรวจแล้ว {{count}} business unit',
      checkAllPartial: 'ตรวจแล้ว {{ok}} · ล้มเหลว {{failed}}',
      seededOne: 'สร้าง {{count}} รายการใน {{code}}',
      nothingCreated: '{{code}} มีข้อมูลครบอยู่แล้ว',
      seedAllDone: 'seed แล้ว {{count}} business unit',
      seedAllPartial: 'seed สำเร็จ {{ok}} · ล้มเหลว {{failed}}',
      seedTitle: 'seed ข้อมูลตั้งต้น?',
      seedDescription: 'สร้าง {{count}} รายการที่ขาดใน {{name}} ({{code}}) รายการที่มีอยู่แล้วจะถูกข้าม',
      seedAllTitle: 'seed ทุก tenant ที่ขาด?',
      seedAllDescription: 'seed {{rows}} รายการที่ขาดลง {{count}} business unit ทีละตัว รายการที่มีอยู่แล้วจะถูกข้าม ถ้าออกจากหน้านี้ระหว่างทาง จะหยุดก่อนเริ่ม business unit ถัดไป',
      searchPlaceholder: 'ค้นหา business unit...',
      emptyTitle: 'ยังไม่มี business unit',
      emptyDescription: 'สร้าง business unit ก่อนจึงจะ seed ข้อมูล tenant ได้',
      goToBusinessUnits: 'ไปที่ Business Units',
      tenantsSeeded: 'tenant ที่ข้อมูลครบ',
      legendSeeded: 'ครบแล้ว',
      legendMissing: 'ขาด',
      legendError: 'ผิดพลาด',
      legendNoDb: 'ไม่มี DB',
      missingRows: 'รายการที่ขาด',
      notCheckedYet: 'ยังไม่ได้ตรวจ — กด ตรวจทั้งหมด เพื่อดูว่า tenant ไหนยังขาดข้อมูลตั้งต้น',
      chartAria: 'ครบ {{seeded}} · ขาด {{missing}} · ผิดพลาด {{errored}}',
      notCheckedAria: 'ยังไม่ได้ตรวจสถานะ seed',
    },
```

- [ ] **Step 5: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0. A missing Thai key shows as a tsc error in `th.ts` — fix by adding the key, never by casting.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(tenant-seed): ข้อความ i18n ของหน้า seed ทั้ง fleet"
```

---

### Task 4: Summary band component

**Files:**
- Create: `src/pages/tenantSeed/SeedFleetSummary.tsx`

**Interfaces:**
- Consumes: `SeedFleetCounts` (Task 2), `pages.tenantSeed.*` keys (Task 3).
- Produces: `export function SeedFleetSummary(props: { counts: SeedFleetCounts; checkable: number; actions: React.ReactNode })` — `checkable` = number of BUs with a DB (denominator for the headline).

- [ ] **Step 1: Write the component** (same visual language as `src/pages/tenantMigration/FleetSync.tsx`)

```tsx
// src/pages/tenantSeed/SeedFleetSummary.tsx
import React from 'react';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { SeedFleetCounts } from './seedRowState';

interface SeedFleetSummaryProps {
  counts: SeedFleetCounts;
  /** BUs that have a DB — the ones Check all can answer for. */
  checkable: number;
  actions: React.ReactNode;
}

function Legend({ color, label, value, emphasis = false }: { color: string; label: string; value: number; emphasis?: boolean }) {
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          emphasis ? 'text-warning text-[15px]' : 'text-foreground text-[13px]',
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** Fleet-wide tenant seed state: how many tenant DBs are fully seeded / missing rows / errored. */
export function SeedFleetSummary({ counts, checkable, actions }: SeedFleetSummaryProps) {
  const { t } = useI18n();
  const checked = counts.seeded + counts.missing + counts.error > 0;
  const pct = (n: number) => (checkable > 0 ? (n / checkable) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="border-border sm:border-r sm:pr-6">
          <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
            {checked ? counts.seeded : '-'}
            <span className="text-muted-foreground text-base font-medium"> / {checkable}</span>
          </div>
          <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.12em]">
            {t('pages.tenantSeed.tenantsSeeded')}
          </div>
        </div>

        <div className="min-w-0">
          <div
            className="bg-muted flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label={
              checked
                ? t('pages.tenantSeed.chartAria', { seeded: counts.seeded, missing: counts.missing, errored: counts.error })
                : t('pages.tenantSeed.notCheckedAria')
            }
          >
            <span className="bg-success" style={{ width: `${pct(counts.seeded)}%` }} />
            <span className="bg-warning" style={{ width: `${pct(counts.missing)}%` }} />
            <span className="bg-destructive" style={{ width: `${pct(counts.error)}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {checked ? (
              <>
                <Legend color="hsl(var(--success))" label={t('pages.tenantSeed.legendSeeded')} value={counts.seeded} />
                <Legend
                  color="hsl(var(--warning))"
                  label={t('pages.tenantSeed.legendMissing')}
                  value={counts.missing}
                  emphasis={counts.missing > 0}
                />
                {counts.error > 0 && (
                  <Legend color="hsl(var(--destructive))" label={t('pages.tenantSeed.legendError')} value={counts.error} />
                )}
                {counts.missingRows > 0 && (
                  <span className="text-muted-foreground flex items-baseline gap-1.5 text-xs">
                    ·
                    <span className="text-warning font-mono text-[13px] font-semibold tabular-nums">{counts.missingRows}</span>
                    {t('pages.tenantSeed.missingRows')}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs">{t('pages.tenantSeed.notCheckedYet')}</span>
            )}
            {counts.no_db > 0 && (
              <Legend color="hsl(var(--muted-foreground))" label={t('pages.tenantSeed.legendNoDb')} value={counts.no_db} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/tenantSeed/SeedFleetSummary.tsx
git commit -m "feat(tenant-seed): แถบสรุปสถานะ seed ทั้ง fleet"
```

---

### Task 5: `TenantSeedManagement` page

**Files:**
- Create: `src/pages/TenantSeedManagement.tsx`

**Interfaces:**
- Consumes: Task 1 `deployStream(…, signal)`; Task 2 helpers; Task 3 keys; Task 4 `SeedFleetSummary`; existing `mapWithConcurrency` (`src/utils/concurrent.ts`), `handleSeedError` (`src/utils/seedError.ts`), `withTooltip` (named export of `src/pages/TenantMigrationManagement.tsx`, line 82), `DevDebugSheet` (`{ title, tabs: { key, label, data, endpoint? }[] }`).
- Produces: default export `TenantSeedManagement: React.FC` (lazy-loaded in Task 6).

- [ ] **Step 1: Write the page**

```tsx
// src/pages/TenantSeedManagement.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import businessUnitService from '../services/businessUnitService';
import tenantSeedService from '../services/tenantSeedService';
import { getErrorDetail } from '../utils/errorParser';
import { handleSeedError } from '../utils/seedError';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { mapWithConcurrency } from '../utils/concurrent';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Tooltip } from '../components/ui/tooltip';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { SearchInput } from '../components/SearchInput';
import { withTooltip } from './TenantMigrationManagement';
import { SeedFleetSummary } from './tenantSeed/SeedFleetSummary';
import {
  type SeedRowState,
  type SeedRowStatus,
  hasDb,
  missingKeys,
  missingCount,
  seedRowStatusOf,
  SEED_STATUS_RANK,
  summarizeFleet,
  nowTime,
} from './tenantSeed/seedRowState';
import { Download, Database, RefreshCw, Loader2, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import type { BusinessUnit, SeedDeploySummary, SeedProgressEvent } from '../types';
import { useI18n } from '../hooks/useI18n';

interface SeedBatch {
  index: number;
  total: number;
  buId: string | null;
  buCode: string | null;
}

// Icon-only row action; same contract as TenantMigrationManagement's iconAction
// (aria-label = label, tooltip falls back to the disabled reason, focusable span
// around a disabled button so the tooltip still fires).
const iconAction = ({
  label,
  icon,
  onClick,
  disabled,
  reason,
  variant = 'outline',
}: {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  disabled: boolean;
  reason: string | null;
  variant?: 'outline' | 'default';
}): ReactElement => {
  const btn = (
    <Button variant={variant} size="icon" className="h-8 w-8" aria-label={label} onClick={onClick} disabled={disabled}>
      {icon}
    </Button>
  );
  return (
    <Tooltip content={reason || label}>
      {disabled ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <span tabIndex={0} className="inline-flex">
          {btn}
        </span>
      ) : (
        btn
      )}
    </Tooltip>
  );
};

const BADGE_VARIANT: Record<SeedRowStatus, 'success' | 'warning' | 'secondary' | 'destructive' | 'outline'> = {
  seeded: 'success',
  missing: 'warning',
  no_db: 'secondary',
  error: 'destructive',
  unknown: 'outline',
};

const TenantSeedManagement: React.FC = () => {
  const { t } = useI18n();
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowState, setRowState] = useState<Record<string, SeedRowState>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [lastStatusResponse, setLastStatusResponse] = useState<unknown>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [batch, setBatch] = useState<SeedBatch | null>(null);
  const [seedTarget, setSeedTarget] = useState<BusinessUnit | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // bu.id -> AbortController of its in-flight seed stream. Aborting only stops the browser
  // listening (see tenantSeedService.deployStream). Also the re-entry guard for seedOne.
  const activeStreamControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Set on unmount: every async path checks it before touching state or starting the next BU.
  const cancelledRef = useRef(false);
  useEffect(() => {
    const controllers = activeStreamControllersRef.current;
    return () => {
      cancelledRef.current = true;
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const disabledReason = !isSuperAdmin ? t('pages.tenantSeed.superAdminRequired') : null;
  const batchRunning = batch !== null;
  const anyBusy =
    checkingAll || batchRunning || Object.values(rowState).some((r) => r.checking || r.seeding);

  const checkableBus = useMemo(() => bus.filter(hasDb), [bus]);

  // Fetch one BU's status into its row. Never rejects; returns whether it succeeded.
  const checkRow = useCallback(async (bu: BusinessUnit, notify: boolean): Promise<boolean> => {
    setRowState((prev) => ({
      ...prev,
      [bu.id]: { ...prev[bu.id], checking: true, seeding: prev[bu.id]?.seeding ?? false },
    }));
    try {
      const status = await tenantSeedService.getStatus(bu.id);
      if (cancelledRef.current) return true;
      setLastStatusResponse(status);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], status, checking: false, lastChecked: nowTime(), errorMsg: undefined },
      }));
      return true;
    } catch (err) {
      if (cancelledRef.current) return false;
      if (notify) handleSeedError(err, t);
      setRowState((prev) => ({
        ...prev,
        [bu.id]: { ...prev[bu.id], checking: false, errorMsg: getErrorDetail(err, t), lastChecked: nowTime() },
      }));
      return false;
    }
  }, [t]);

  const checkOne = useCallback((bu: BusinessUnit) => {
    if (!isSuperAdmin) return;
    void checkRow(bu, true);
  }, [checkRow, isSuperAdmin]);

  const checkAll = useCallback(async () => {
    if (!isSuperAdmin) return;
    setCheckingAll(true);
    let failed = 0;
    try {
      await mapWithConcurrency(
        checkableBus,
        4,
        (bu) => checkRow(bu, false),
        (_bu, _i, ok) => {
          if (!ok) failed++;
        },
      );
    } finally {
      if (!cancelledRef.current) setCheckingAll(false);
    }
    if (cancelledRef.current) return;
    const ok = checkableBus.length - failed;
    if (failed > 0) toast.warning(t('pages.tenantSeed.checkAllPartial', { ok, failed }));
    else toast.success(t('pages.tenantSeed.checkAllDone', { count: ok }));
  }, [checkableBus, checkRow, isSuperAdmin, t]);

  // Run one BU's seed stream, updating its row. Rejects on failure (row already carries
  // the error); callers decide how to report it.
  const runSeed = useCallback(async (bu: BusinessUnit, keys: string[], total: number): Promise<SeedDeploySummary> => {
    const controller = new AbortController();
    activeStreamControllersRef.current.set(bu.id, controller);
    setRowState((prev) => ({
      ...prev,
      [bu.id]: {
        ...prev[bu.id],
        checking: prev[bu.id]?.checking ?? false,
        seeding: true,
        progress: { done: 0, total, current: null },
        errorMsg: undefined,
      },
    }));
    try {
      const onEvent = (e: SeedProgressEvent) => {
        if (cancelledRef.current) return;
        if (e.type === 'start') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { done: 0, total: e.total, current: null } } }));
        } else if (e.type === 'seeding') {
          setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], progress: { done: e.index, total: e.total, current: e.key } } }));
        }
      };
      const summary = await tenantSeedService.deployStream(bu.id, onEvent, keys, controller.signal);
      if (!cancelledRef.current) {
        setRowState((prev) => ({ ...prev, [bu.id]: { ...prev[bu.id], seeding: false, progress: undefined } }));
      }
      return summary;
    } catch (err) {
      if (!cancelledRef.current) {
        setRowState((prev) => ({
          ...prev,
          [bu.id]: { ...prev[bu.id], seeding: false, progress: undefined, errorMsg: getErrorDetail(err, t), lastChecked: nowTime() },
        }));
      }
      throw err;
    } finally {
      if (activeStreamControllersRef.current.get(bu.id) === controller) activeStreamControllersRef.current.delete(bu.id);
    }
  }, [t]);

  const seedOne = useCallback(async (bu: BusinessUnit) => {
    if (!isSuperAdmin) return;
    if (activeStreamControllersRef.current.has(bu.id)) return;
    setSeedTarget(null);
    const status = rowState[bu.id]?.status;
    const keys = missingKeys(status);
    if (keys.length === 0) return;
    try {
      const summary = await runSeed(bu, keys, missingCount(status));
      if (summary.created > 0) toast.success(t('pages.tenantSeed.seededOne', { count: summary.created, code: bu.code }));
      else toast.info(t('pages.tenantSeed.nothingCreated', { code: bu.code }));
      await checkRow(bu, false);
    } catch (err) {
      if (cancelledRef.current) return;
      handleSeedError(err, t);
    }
  }, [checkRow, isSuperAdmin, rowState, runSeed, t]);

  const seedAll = useCallback(async () => {
    if (!isSuperAdmin) return;
    if (batch !== null) return;
    setConfirmAll(false);
    const targets = bus.filter((bu) => seedRowStatusOf(bu, rowState[bu.id]) === 'missing');
    if (targets.length === 0) {
      toast.info(t('pages.tenantSeed.nothingToSeed'));
      return;
    }
    // Snapshot keys now: rowState changes as each BU is re-checked.
    const plan = targets.map((bu) => ({
      bu,
      keys: missingKeys(rowState[bu.id]?.status),
      total: missingCount(rowState[bu.id]?.status),
    }));
    let ok = 0;
    let failed = 0;
    try {
      for (let i = 0; i < plan.length; i++) {
        if (cancelledRef.current) return;
        const { bu, keys, total } = plan[i];
        setBatch({ index: i + 1, total: plan.length, buId: bu.id, buCode: bu.code });
        try {
          await runSeed(bu, keys, total);
          await checkRow(bu, false);
          ok++;
        } catch {
          if (cancelledRef.current) return;
          failed++; // error already recorded on the row by runSeed; keep going
        }
      }
    } finally {
      if (!cancelledRef.current) setBatch(null);
    }
    if (failed > 0) toast.warning(t('pages.tenantSeed.seedAllPartial', { ok, failed }));
    else toast.success(t('pages.tenantSeed.seedAllDone', { count: ok }));
  }, [batch, bus, checkRow, isSuperAdmin, rowState, runSeed, t]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: 1000, sort: 'code:asc' });
        if (cancelledRef.current) return;
        setRawResponse(data);
        const items = (data.data || data) as BusinessUnit[];
        const arr = Array.isArray(items) ? items : [];
        setBus(arr);
        setTotalRows(data.paginate?.total ?? arr.length);
        setError('');
      } catch (err) {
        if (cancelledRef.current) return;
        setBus([]);
        setError(t('pages.tenantSeed.loadBuFailed', { detail: getErrorDetail(err, t) }));
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
  }, [t]);

  const counts = useMemo(() => summarizeFleet(bus, rowState), [bus, rowState]);
  const fleetChecked = counts.seeded + counts.missing + counts.error > 0;
  const nothingToSeed = fleetChecked && counts.missing === 0;
  const seedAllReason =
    disabledReason ??
    (nothingToSeed
      ? t('pages.tenantSeed.nothingToSeed')
      : !fleetChecked
        ? t('pages.tenantSeed.seedUncheckedHint')
        : null);

  const statusText = useCallback((st: SeedRowStatus, rs?: SeedRowState): string => {
    switch (st) {
      case 'seeded': return t('pages.tenantSeed.statusSeeded');
      case 'missing': return t('pages.tenantSeed.statusMissing', { count: missingCount(rs?.status) });
      case 'no_db': return t('pages.tenantSeed.statusNoDb');
      case 'error': return t('pages.tenantSeed.statusError');
      default: return t('pages.tenantSeed.statusNotChecked');
    }
  }, [t]);

  const setsSummary = (rs?: SeedRowState): string =>
    rs?.status
      ? rs.status.sets
          .filter((s) => s.missing.length > 0)
          .map((s) => `${s.key} ${s.present}/${s.defined}`)
          .join(', ')
      : '';

  const handleExport = () => {
    const rows = bus.map((bu) => {
      const rs = rowState[bu.id];
      return {
        code: bu.code,
        name: bu.name,
        status: seedRowStatusOf(bu, rs),
        missing: missingCount(rs?.status),
        sets: setsSummary(rs),
        last_checked: rs?.lastChecked ?? '',
        error: rs?.errorMsg ?? '',
      };
    });
    const csv = generateCSV(rows, [
      { key: 'code', label: t('common.field.code') },
      { key: 'name', label: t('common.field.name') },
      { key: 'status', label: t('common.status.label') },
      { key: 'missing', label: t('pages.tenantSeed.columnMissingCsv') },
      { key: 'sets', label: t('pages.tenantSeed.columnSets') },
      { key: 'last_checked', label: t('pages.tenantSeed.columnLastChecked') },
      { key: 'error', label: t('pages.tenantSeed.columnErrorCsv') },
    ]);
    downloadCSV(csv, `tenant-seeds-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<BusinessUnit, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.field.code'),
      meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
      cell: ({ row }) => (
        <Link to={`/business-units/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: t('common.field.name'), cell: ({ row }) => <span className="whitespace-nowrap">{row.original.name}</span> },
    {
      id: 'status',
      header: t('common.status.label'),
      // accessorFn only enables sorting — keep ranks out of the global search.
      accessorFn: (row) => SEED_STATUS_RANK[seedRowStatusOf(row, rowState[row.id])],
      enableGlobalFilter: false,
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const st = seedRowStatusOf(bu, rs);
        const badge = <Badge variant={BADGE_VARIANT[st]}>{statusText(st, rs)}</Badge>;
        return (
          <div className="space-y-1">
            {st === 'no_db' ? <Tooltip content={t('pages.tenantSeed.noDbReason')}>{badge}</Tooltip> : badge}
            {rs?.seeding && rs.progress && (
              <div role="status" aria-live="polite" className="break-all font-mono text-xs text-muted-foreground">
                {t('pages.tenantSeed.seedingProgress', { done: rs.progress.done, total: rs.progress.total })}
                {rs.progress.current ? ` · ${rs.progress.current}` : ''}
              </div>
            )}
            {rs?.errorMsg && (
              <div role="alert" className="break-all text-xs text-destructive">
                {rs.errorMsg}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'sets',
      header: t('pages.tenantSeed.columnSets'),
      accessorFn: (row) => missingCount(rowState[row.id]?.status),
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const rs = rowState[row.original.id];
        const missingSets = rs?.status?.sets.filter((s) => s.missing.length > 0) ?? [];
        if (missingSets.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {missingSets.map((s) => (
              <span key={s.key} className="rounded border px-1.5 py-0.5 font-mono text-[11px]" title={s.label}>
                {s.key} {s.present}/{s.defined}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'last_checked',
      header: t('pages.tenantSeed.columnLastChecked'),
      accessorFn: (row) => rowState[row.id]?.lastChecked ?? '',
      enableGlobalFilter: false,
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{rowState[row.original.id]?.lastChecked ?? '-'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-24', cellClassName: 'text-right p-0' },
      cell: ({ row }) => {
        const bu = row.original;
        const rs = rowState[bu.id];
        const st = seedRowStatusOf(bu, rs);
        if (st === 'no_db') return null;
        const busy = !!rs?.checking || !!rs?.seeding;
        const disabled = !!disabledReason || busy || batchRunning || checkingAll;
        return (
          <div className="flex items-center justify-end gap-1.5">
            {iconAction({
              label: t('pages.tenantSeed.check'),
              icon: rs?.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />,
              onClick: () => checkOne(bu),
              disabled,
              reason: disabledReason,
            })}
            {st === 'missing' &&
              iconAction({
                label: t('pages.tenantSeed.seed'),
                icon: rs?.seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />,
                onClick: () => setSeedTarget(bu),
                disabled,
                reason: disabledReason,
                variant: 'default',
              })}
          </div>
        );
      },
    },
  ], [rowState, disabledReason, checkOne, batchRunning, checkingAll, statusText, t]);

  const batchProgress = batch?.buId ? rowState[batch.buId]?.progress : undefined;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title={t('pages.tenantSeed.title')} subtitle={t('pages.tenantSeed.subtitle')} />

        <SeedFleetSummary
          counts={counts}
          checkable={checkableBus.length}
          actions={
            <>
              {withTooltip(
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkAll}
                  disabled={!!disabledReason || anyBusy || checkableBus.length === 0}
                >
                  {checkingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {checkingAll ? t('pages.tenantSeed.checking') : t('pages.tenantSeed.checkAll')}
                </Button>,
                disabledReason,
              )}
              {withTooltip(
                <Button
                  variant={counts.missing > 0 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConfirmAll(true)}
                  disabled={!!seedAllReason || anyBusy}
                >
                  {batchRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sprout className="mr-2 h-4 w-4" />}
                  {counts.missing > 0
                    ? t('pages.tenantSeed.seedMissing', { count: counts.missing })
                    : t('pages.tenantSeed.seedAll')}
                </Button>,
                seedAllReason,
              )}
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || bus.length === 0 || anyBusy}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
            </>
          }
        />

        {batch && (
          <div role="status" aria-live="polite" className="rounded-md border bg-card px-4 py-2 font-mono text-xs text-muted-foreground">
            {t('pages.tenantSeed.batchProgress', { index: batch.index, total: batch.total, code: batch.buCode ?? '' })}
            {batchProgress?.current ? ` — ${batchProgress.current} (${batchProgress.done}/${batchProgress.total})` : ''}
          </div>
        )}

        {totalRows > bus.length && (
          <p className="text-warning text-xs">
            {t('pages.tenantSeed.showingPartial', { shown: bus.length, total: totalRows })}
          </p>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={setSearchTerm}
                placeholder={t('pages.tenantSeed.searchPlaceholder')}
                className="flex-1 sm:max-w-sm"
              />
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
                title={t('pages.tenantSeed.emptyTitle')}
                description={t('pages.tenantSeed.emptyDescription')}
                action={<Button variant="outline" size="sm" onClick={() => navigate('/business-units')}>{t('pages.tenantSeed.goToBusinessUnits')}</Button>}
              />
            ) : !error ? (
              loading && bus.length === 0 ? (
                <TableSkeleton columns={columns.length + 1} rows={6} />
              ) : (
                <DataTable
                  columns={columns}
                  data={bus}
                  tableLayout="auto"
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

      <ConfirmDialog
        open={seedTarget !== null}
        onOpenChange={(open) => { if (!open) setSeedTarget(null); }}
        title={t('pages.tenantSeed.seedTitle')}
        description={
          seedTarget
            ? t('pages.tenantSeed.seedDescription', {
                count: missingCount(rowState[seedTarget.id]?.status),
                name: seedTarget.name,
                code: seedTarget.code,
              })
            : ''
        }
        confirmText={t('pages.tenantSeed.seed')}
        onConfirm={() => (seedTarget ? seedOne(seedTarget) : undefined)}
      />

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('pages.tenantSeed.seedAllTitle')}
        description={t('pages.tenantSeed.seedAllDescription', { count: counts.missing, rows: counts.missingRows })}
        confirmText={t('pages.tenantSeed.seedAll')}
        onConfirm={seedAll}
      />

      <DevDebugSheet
        title="API Response"
        tabs={[
          { key: 'bus', label: 'Business Units', data: rawResponse, endpoint: 'GET /api-system/business-units' },
          { key: 'status', label: 'Last seed status', data: lastStatusResponse, endpoint: 'GET /api-system/tenant/seeds/:bu_id/status' },
        ]}
      />
    </Layout>
  );
};

export default TenantSeedManagement;
```

- [ ] **Step 2: Reconcile with real component APIs**

If tsc complains, adjust the page (never the components):
- `ConfirmDialog` — `confirmVariant` is optional; the default look is intended for a non-destructive seed.
- `Tooltip` wrapping a `Badge` (a `div`) — if the tooltip needs a focusable trigger, wrap the badge in `<span tabIndex={0}>` with the same eslint-disable comment used in `iconAction`.
- `withTooltip` import pulls `TenantMigrationManagement.tsx` into this lazy chunk. If `bun run build` shows the two pages merged into one chunk and that matters, copy the 8-line helper into this file instead.

- [ ] **Step 3: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TenantSeedManagement.tsx
git commit -m "feat(tenant-seed): หน้า /tenant-seeds ตรวจและ seed ทุก BU"
```

---

### Task 6: Route, nav, feature flag, breadcrumb

**Files:**
- Modify: `src/App.tsx` (lazy import near line 35; route after the `/tenant-migrations` route ~lines 266–273)
- Modify: `src/components/nav/platformNav.ts` (icon import lines 1–5; item after line 14)
- Modify: `src/constants/featureFlags.ts` (after line 51)
- Modify: `src/components/Breadcrumbs.tsx` (after line 18)

**Interfaces:**
- Consumes: default export of `src/pages/TenantSeedManagement.tsx`; `nav.tenantSeeds`, `breadcrumb.tenantSeeds`.

- [ ] **Step 1: `App.tsx`**

After `const TenantMigrationManagement = lazy(() => import("./pages/TenantMigrationManagement"));` add:

```tsx
const TenantSeedManagement = lazy(() => import("./pages/TenantSeedManagement"));
```

After the closing `/>` of the `/tenant-migrations` `<Route>` add:

```tsx
            <Route
              path="/tenant-seeds"
              element={
                <PrivateRoute requiredPermission="cluster.read" feature="tenant_seeds">
                  <TenantSeedManagement />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 2: `platformNav.ts`**

Add `Sprout` to the `lucide-react` import list (verified present in `node_modules/lucide-react`), then after the `/tenant-migrations` item add:

```ts
  { path: '/tenant-seeds', labelKey: 'nav.tenantSeeds', icon: Sprout, permission: 'cluster.read', groupKey: 'navGroup.organization', feature: 'tenant_seeds' },
```

- [ ] **Step 3: `featureFlags.ts`**

After the `tenant_migrations` entry add:

```ts
  { key: 'tenant_seeds', labelKey: 'nav.tenantSeeds', groupKey: 'navGroup.organization', defaultState: 'active' },
```

- [ ] **Step 4: `Breadcrumbs.tsx`**

After `'tenant-migrations': 'breadcrumb.tenantMigrations',` add:

```ts
  'tenant-seeds': 'breadcrumb.tenantSeeds',
```

- [ ] **Step 5: Static checks + existing suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all exit 0. If an existing test pins the nav list or the feature-flag catalog (e.g. counts entries), update its expected list to include the new entry — do not delete assertions.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/nav/platformNav.ts src/constants/featureFlags.ts src/components/Breadcrumbs.tsx
git commit -m "feat(tenant-seed): route, เมนู, feature flag และ breadcrumb ของ /tenant-seeds"
```

---

### Task 7: Manual verification (browser, DEV backend)

**Files:** none (fix-ups, if any, are committed under the task they belong to).

- [ ] **Step 1: Run the app**

Run: `bun run dev:dev` (DEV backend, port 3304). Log in as a super admin.

- [ ] **Step 2: Walk the checklist**

1. Sidebar shows **Tenant Seed Data** under Tenant Migrations; `/tenant-seeds` loads; breadcrumb correct.
2. Debug sheet → Business Units tab: confirm `database_pool_id` (or `database_pool`) and `db_schema` are present on list rows (Review Focus 1). If absent, `hasDb` returns true and the backend 422 must show as an Error row.
3. **Check all** → pick one *Missing* BU and one *Seeded* BU; open each BU's Edit page → `TenantSeedCard` → Check; per-set numbers match.
4. Network tab: no `/tenant/seeds/<id>/status` request for *No DB* rows.
5. **Seed** on a BU **the owner picks** → confirm dialog → progress → toast → row becomes *Seeded* (Review Focus 4).
6. Start a seed, navigate away mid-stream → no console error or React warning (Review Focus 2).
7. Log in as a non-super-admin with `cluster.read` → list visible, every action disabled with tooltip, no status request (Review Focus 5).
8. 390px width (iframe probe per memory `reference_iframe_viewport_probe`) → cards readable, buttons not clipped.
9. **Seed all — ask the owner before running on DEV.** If approved: continues past a failing BU, ends with a `warning` toast when any fail (Review Focus 3).

- [ ] **Step 3: Report**

Report each item as pass / fail / skipped-with-reason to the owner. Do not push or open a PR until the owner asks.
