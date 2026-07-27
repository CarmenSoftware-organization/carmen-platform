# Tenant seed: show every seed set + encode tenant URL components

**Date:** 2026-07-27
**Status:** Approved
**Repos:** `carmen-platform` (frontend) · `carmen-turborepo-backend-v2` (backend)

## Background

Backend PR #256 (`feature/seed-vendor-business-type`, merged 2026-07-27) added a second
tenant seed set, `vendor-business-type` (12 rows), alongside the existing `running-code`
set. The sets live in an ordered registry (`apps/micro-business/src/authen/tenant_seed/seed-sets/index.ts`)
and `TenantSeedService.getStatus` iterates it generically, so the frontend receives the new
set with no code change.

A review of the frontend `TenantSeedCard` and the backend connection-string builders against
that change found four items. Two are in scope here; two were reviewed and deliberately
deferred (see Out of scope).

## Problems

**F1 — stale card copy.** `src/components/TenantSeedCard.tsx:126` hardcodes
`"default master data (running codes)"`. There are now two sets.

**F2 — fully-seeded sets are invisible.** The per-set block renders only when
`status && !status.all_seeded`, and inside it `.filter((s) => s.missing.length > 0)` drops
every complete set. A set that is fully seeded cannot be seen or reasoned about. The card
behaves as a worklist ("what still needs doing") when the operator wants a control panel
("what sets exist, what state is each in, which do I run").

**B1 — unencoded `database` and `schema` in the tenant connection string.** Both builders
percent-encode username and password but interpolate `database` and `schema` raw:

- `apps/micro-business/src/tenant/tenant.service.ts:452` — the runtime path, used by the
  seed API and the migration API.
- `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts` → `buildTenantUrl`
  — the CLI seeder path, added by PR #256.

`schema` is interpolated into the query string as `?schema=${schema}`, so a value containing
`&` appends arbitrary connection parameters. `db_connection` is operator-editable from the
Business Unit edit page, so the value is not guaranteed well-formed. This is a robustness
and input-hygiene fix, not a privilege boundary — a super-admin who can edit `db_connection`
already controls the target database.

## Design

### 1. Frontend — `src/components/TenantSeedCard.tsx`

Turn the per-set list into a control panel: every set from `status.sets` is always rendered,
and a set with nothing missing is shown but not selectable.

**Copy (F1).** `CardDescription` becomes
`"Check and seed default master data into this BU's tenant database."` — no set names. Set
labels already appear per row, so listing them in the description would duplicate and go
stale again.

**Render conditions (F2).**

- `{status && !status.all_seeded && (…)}` → `{status && (…)}`
- Remove `.filter((s) => s.missing.length > 0)` — map over `status.sets` directly.

**Per-set row.**

| Element | Behavior |
|---|---|
| checkbox | `disabled={actionsDisabled \|\| s.missing.length === 0}`, `checked={selectedKeys.has(s.key)}` |
| label + counts | unchanged: `{s.label}` then `({s.present}/{s.defined} present, {s.missing.length} missing)` |
| status badge | `s.missing.length === 0` → `<Badge variant="success">Seeded</Badge>`; otherwise `<Badge variant="secondary">{n} missing</Badge>` |
| disclosure toggle | rendered only when `s.missing.length > 0`; toggles `expandedKeys`; carries `aria-expanded` and an `aria-label` naming the set |
| missing list `<ul>` | rendered only when the set is expanded **and** `s.missing.length > 0` |

**New state.** `const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())`,
toggled by the same immutable-copy pattern as the existing `toggleSet`.

`fetchStatus` seeds `expandedKeys` with every set that has missing rows, mirroring the line
directly above it that seeds `selectedKeys`. Today's card shows missing names immediately;
defaulting to collapsed would remove information the operator currently gets for free. The
toggle therefore adds the ability to collapse, it does not gate first sight of the data.

**Seed button.** Stays mounted in all states.

- `disabled={actionsDisabled || selectedMissing === 0}` (unchanged)
- label: `selectedMissing === 0 ? 'Nothing to seed' : \`Seed ${selectedMissing} row(s)\``

**Two implementation constraints.**

1. The disclosure toggle must not be nested inside the row's `<label>`. The row is currently
   one `<label>` wrapping checkbox and text; a `<button>` placed inside it would toggle the
   checkbox on every expand click. Restructure the row as a flex container with the `<label>`
   (checkbox + text) and the toggle button as siblings.
2. `selectedKeys` needs no new bookkeeping. `fetchStatus` already rebuilds it from
   `sets.filter((x) => x.missing.length > 0)`, and `runSeed` calls `fetchStatus` on success,
   so a set that just completed drops out of the selection at the same moment its checkbox
   becomes disabled.

**Unchanged:** `deployStream` contract, `SeedProgressEvent` handling, progress bar, log
lines, `ConfirmDialog`, permission gating and `withTooltip`, `src/types/index.ts`,
`src/services/tenantSeedService.ts`.

### 2. Backend — encode `database` and `schema`

Same one-line change at both call sites:

```ts
// before
`…@${host}:${port}/${database}?schema=${schema}`
// after
`…@${host}:${port}/${encodeURIComponent(database)}?schema=${encodeURIComponent(schema)}`
```

| File | Role | Note |
|---|---|---|
| `apps/micro-business/src/tenant/tenant.service.ts:452` | runtime (seed + migration APIs) | `postgresql` case only — the `mysql`/`mssql` cases have no `schema` param but their `database` is interpolated raw too and gets the same `encodeURIComponent`; `sqlite` interpolates `host`/`database` as a path and is left alone |
| `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts` → `buildTenantUrl` | CLI seeder | postgresql-only by construction |

**`host` and `port` guards.** `host` and `port` are *not* percent-encoded:
`encodeURIComponent` would corrupt IPv6 literals (`::1` → `%3A%3A1`). Instead both builders
reject malformed values before interpolation:

- `port` must parse as a positive integer.
- `host` must not contain any of `/ ? # @ &` — the characters that could break out of the
  authority component.

A rejected value throws in `buildTenantUrl` (consistent with its existing unsupported-provider
throw) and returns `undefined` from `getConnectionString` (consistent with its existing
unknown-provider return, which callers already surface as
`"… has an unsupported database provider"`). Do not change either function's error shape.

### 3. Tests and verification

**One existing assertion breaks and must be fixed.** In
`src/components/TenantSeedCard.test.tsx`, the `all_seeded` test asserts
`await screen.findByText(/seeded/i)` (line 50). Once fully-seeded sets render, an `all_seeded`
status produces two matches — the card-level `Seeded` badge (`TenantSeedCard.tsx:142`) and
the new per-set badge — and `findByText` throws on multiple matches. Narrow the query so it
targets one element unambiguously.

Every other assertion in the file survives unchanged:

- Same test, line 51: `queryByRole('button', { name: /seed \d+ row/i })` still finds nothing,
  because the button now reads `"Nothing to seed"`.
- Tests 1 and 3 query `getAllByRole('checkbox')` while the *first* `getStatus` fixture is in
  effect, and in both of those fixtures every set has a non-empty `missing` — so the call
  still returns exactly two boxes in the same order, and `boxes[1]` is still the currencies
  set. Test 3's second fixture (the post-seed refetch, `running-code` with `missing: []`)
  lands after the last checkbox interaction and only affects the final render, where the
  assertion is on the `deployStream` call.
- Test 4 renders without a status at all and is untouched.

Per the standing project rule, no new automated tests are written as part of this change.
Verification is:

- `bun run test` — full Vitest suite green.
- `bun run build` — TypeScript and ESLint clean.
- Backend: type-check the two touched packages.

Manual check once the backend reaches DEV: open a Business Unit, run **Check status**, and
confirm both `Running codes` and `Vendor business types` appear with correct badges, that a
fully-seeded set's checkbox is disabled, and that the seed button reads `Nothing to seed`
when nothing is selectable.

## Out of scope

Reviewed and deliberately deferred:

- **Running the seed against DEV.** Backend PR #256 merged to `main` at 13:56 on 2026-07-27
  but deployment to DEV is a separate step; until it lands, the status endpoint returns only
  `running-code`.
- **B2 — soft-delete unique index.** `CREATE UNIQUE INDEX "vendor_business_type_name_u" ON
  "tb_vendor_business_type"("name","deleted_at")` does not constrain active rows, because
  Postgres treats each `NULL` as distinct. The correct form is a partial index
  `UNIQUE(name) WHERE deleted_at IS NULL`. This is a pre-existing repo-wide pattern, not
  introduced by PR #256 — `config_running_code_type_u` is identical — so fixing it is a
  separate, broader migration.
- **B3 — `definedKeys` deduplication.** `vendorBusinessTypeSeedSet.listMissing` dedupes its
  result with a `Set` but `definedKeys` does not, so `present = defined - missing.length`
  would drift if the seed data ever gained a duplicate `name`. All 12 current names are
  unique; cosmetic today.

## Verified as correct, no action

The 12 canonical form codes seeded by
`packages/prisma-shared-schema-platform/prisma/seed.print-templates.ts`
(`PR, PO, GRN, SR, CN, SI, SO, IA, PC, SC, RFP, EOP`) match
`src/constants/reportGroups.ts` → `FORM_REPORT_GROUPS` exactly, in the same order, and the
seed sets `template_type: 'form'` with `report_group: doc.code` as the Report Form Groups
page expects.
