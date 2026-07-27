# Tenant Seed Set Visibility + Tenant URL Encoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TenantSeedCard` show every tenant seed set (fully-seeded ones visible but not selectable), and percent-encode `database` / `schema` in both tenant connection-string builders.

**Architecture:** Three independent tasks across two repos. Task 1 rewrites one render block plus one state hook in a single React component. Tasks 2 and 3 apply the same encoding + authority-validation change to the two separate connection-string builders — the runtime one used by the seed/migration APIs, and the CLI copy added by backend PR #256. No shared abstraction is introduced between them: they live in different packages and have different error contracts (`undefined` vs `throw`).

**Tech Stack:** React 19 + TypeScript (Vite), shadcn/ui + Tailwind, Vitest + React Testing Library (frontend) · NestJS + Prisma, Jest (backend)

**Spec:** `docs/superpowers/specs/2026-07-27-tenant-seed-sets-ui-and-url-encode-design.md`

## Global Constraints

- **Two repos, two branches.** Task 1 → `carmen-platform` on branch `feature/tenant-seed-set-visibility` (already created, already holds the spec commit). Tasks 2–3 → `carmen-turborepo-backend-v2` on a new branch `fix/tenant-url-component-encoding` cut from `main`.
- **No new automated tests.** Per the standing project rule, implement → static-check → commit. The only test edit permitted is repairing the one assertion that the UI change breaks (Task 1, Step 6).
- **Never modify `src/components/ui/` primitives.**
- **Status must use `<Badge variant="success" | "secondary">`** — never raw green Tailwind classes.
- **Icon sizing:** `h-4 w-4` inside a button; `mr-2 h-4 w-4` when the button also has text.
- **Do not change either backend function's error contract.** `getConnectionString` returns `undefined` on a bad record; `buildTenantUrl` throws. Callers already surface both.
- **`host` and `port` are validated, never percent-encoded** — `encodeURIComponent` would corrupt IPv6 literals (`::1` → `%3A%3A1`).
- **Backend Jest must be run scoped and in the foreground, with `--forceExit`** (the suite is known to hang on open handles otherwise).

---

### Task 1: Frontend — show every seed set in `TenantSeedCard`

**Repo:** `carmen-platform` · **Branch:** `feature/tenant-seed-set-visibility` (already checked out)

**Files:**
- Modify: `src/components/TenantSeedCard.tsx` (imports line 2; state after line 35; `fetchStatus` line 66-80; render block lines 147-186; description line 126)
- Modify: `src/components/TenantSeedCard.test.tsx:50` (repair one broken assertion)

**Interfaces:**
- Consumes: `TenantSeedStatus`, `SeedSetStatus` from `src/types/index.ts` (unchanged — `{ key, label, defined, present, missing }`)
- Produces: nothing consumed by later tasks. Tasks 2 and 3 are independent.

- [ ] **Step 1: Add the chevron icons to the lucide import**

In `src/components/TenantSeedCard.tsx`, replace line 2:

```tsx
import { Sprout, Loader2, RefreshCw, Play } from 'lucide-react';
```

with:

```tsx
import { Sprout, Loader2, RefreshCw, Play, ChevronDown, ChevronRight } from 'lucide-react';
```

- [ ] **Step 2: Fix the stale card description (F1)**

Replace the `CardDescription` body (line 126):

```tsx
          Check and seed default master data (running codes) into this BU&apos;s tenant database.
```

with:

```tsx
          Check and seed default master data into this BU&apos;s tenant database.
```

- [ ] **Step 3: Add `expandedKeys` state and its toggle**

After the `selectedKeys` declaration (line 35), add:

```tsx
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
```

Then directly after the existing `toggleSet` function (which ends at line 64), add its twin:

```tsx
  const toggleExpanded = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
```

- [ ] **Step 4: Auto-expand sets that have missing rows on status load**

In `fetchStatus`, directly below the existing `setSelectedKeys(...)` call (line 71), add the mirroring line:

```tsx
      setExpandedKeys(new Set(s.sets.filter((x) => x.missing.length > 0).map((x) => x.key)));
```

This preserves today's behavior, where missing row names are visible immediately after a status check. The new toggle therefore only adds the ability to *collapse*.

- [ ] **Step 5: Rewrite the per-set render block (F2)**

Replace the whole block at lines 147-186 — from `{status && !status.all_seeded && (` through its closing `)}` — with:

```tsx
        {status && (
          <div className="space-y-2">
            {status.sets.map((s) => {
              const complete = s.missing.length === 0;
              const expanded = expandedKeys.has(s.key);
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedKeys.has(s.key)}
                        disabled={actionsDisabled || complete}
                        onChange={() => toggleSet(s.key)}
                      />
                      {s.label}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({s.present}/{s.defined} present, {s.missing.length} missing)
                      </span>
                    </label>
                    {complete ? (
                      <Badge variant="success">Seeded</Badge>
                    ) : (
                      <Badge variant="secondary">{s.missing.length} missing</Badge>
                    )}
                    {!complete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} missing rows for ${s.label}`}
                        onClick={() => toggleExpanded(s.key)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  {!complete && expanded && (
                    <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                      {s.missing.map((name) => (
                        <li key={name} className="break-all font-mono text-xs text-muted-foreground">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {withTooltip(
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={actionsDisabled || selectedMissing === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                {selectedMissing === 0 ? 'Nothing to seed' : `Seed ${selectedMissing} row(s)`}
              </Button>,
            )}
          </div>
        )}
```

Three things to note while making this edit:

1. The disclosure `<Button>` is a **sibling** of the `<label>`, not a child. Nesting it inside the label would toggle the checkbox on every expand click.
2. `selectedKeys` needs no new bookkeeping — `fetchStatus` already rebuilds it from the sets that have missing rows, and `runSeed` calls `fetchStatus` on success, so a set that just completed leaves the selection at the same moment its checkbox becomes disabled.
3. The card-level badges above (lines 142-143) are **unchanged**. `all_seeded` still drives the header `Seeded` / `N missing` badge.

- [ ] **Step 6: Repair the one assertion the change breaks**

`src/components/TenantSeedCard.test.tsx:50` currently reads:

```tsx
    expect(await screen.findByText(/seeded/i)).toBeInTheDocument();
```

With fully-seeded sets now rendered, an `all_seeded` status produces two matches — the card-level badge and the new per-set badge — and `findByText` throws on multiple matches. Replace it with an assertion that states the new truth exactly:

```tsx
    expect(await screen.findAllByText(/^seeded$/i)).toHaveLength(2);
```

Change nothing else in this file. Every other assertion survives: line 51's `queryByRole('button', { name: /seed \d+ row/i })` still finds nothing (the button now reads `"Nothing to seed"`, which has no digits), and tests 1 and 3 query `getAllByRole('checkbox')` while their *first* fixture is in effect, where every set still has a non-empty `missing`.

- [ ] **Step 7: Run the full test suite**

Run: `bun run test`
Expected: all suites pass, including the 4 tests in `TenantSeedCard.test.tsx`. If `findAllByText` reports a length other than 2, read the rendered output before changing the assertion — a third `Seeded` string means the render block was pasted in the wrong place.

- [ ] **Step 8: Run the production build (type + lint gate)**

Run: `bun run build`
Expected: clean. `vite-plugin-eslint` runs during build; unused imports (e.g. forgetting to use `ChevronRight`) fail here as `TS6133`.

- [ ] **Step 9: Commit**

```bash
git add src/components/TenantSeedCard.tsx src/components/TenantSeedCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(tenant-seed): show every seed set, disable the ones already complete

The card filtered out fully-seeded sets and hid the whole block once
all_seeded, so an operator could not see which sets exist or what state
each was in. Render every set from status.sets: a complete set shows a
Seeded badge with its checkbox disabled, an incomplete one keeps its
checkbox and gains a collapsible list of missing rows. The seed button
stays mounted and reads "Nothing to seed" when nothing is selectable.

Also drops "(running codes)" from the card description — there are two
seed sets now that the backend registers vendor-business-type.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend runtime — encode `database` / `schema` in `getConnectionString`

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/tenant/tenant.service.ts` (module-level helpers; `getConnectionString` at lines 438-463)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isSafeHost(host: string): boolean` and `isSafePort(port: number | string): boolean` — module-private to this file. Task 3 defines its own copies in a different package; do **not** try to import across the package boundary.

- [ ] **Step 1: Cut the backend branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main
git checkout -b fix/tenant-url-component-encoding
```

- [ ] **Step 2: Add the two authority validators**

In `apps/micro-business/src/tenant/tenant.service.ts`, add these at module level (above the `TenantService` class, alongside the other top-level declarations):

```ts
/**
 * Reject host values that could break out of the URI authority.
 * ปฏิเสธค่า host ที่อาจหลุดออกจากส่วน authority ของ URI
 * @param host - Host from db_connection / โฮสต์จาก db_connection
 * @returns True when the host is safe to interpolate / true เมื่อ host ปลอดภัยที่จะแทรกในสตริง
 */
const isSafeHost = (host: string): boolean =>
  typeof host === 'string' && host.length > 0 && !/[/?#@&]/.test(host);

/**
 * Accept only a positive integer port.
 * รับเฉพาะพอร์ตที่เป็นจำนวนเต็มบวก
 * @param port - Port from db_connection / พอร์ตจาก db_connection
 * @returns True when the port is a positive integer / true เมื่อพอร์ตเป็นจำนวนเต็มบวก
 */
const isSafePort = (port: number | string): boolean =>
  /^\d+$/.test(String(port)) && Number(port) > 0;
```

`host` and `port` are validated rather than percent-encoded because `encodeURIComponent` would corrupt IPv6 literals.

- [ ] **Step 3: Encode the path and query components**

In `getConnectionString`, leave lines 439-448 untouched — the four-line explanatory comment, `const provider = …`, `const username = …`, the `const { password, host, port, database, schema } = db_connection;` destructure, and the two-line credential comment plus `const credential = …`. Insert the guard directly after the `credential` line, then encode `database` and `schema` in the three network-provider branches:

```ts
    const credential = `${encodeURIComponent(username ?? '')}:${encodeURIComponent(password ?? '')}`;
    // `database` and `schema` come from operator-editable JSON and land in the
    // URI path and query, where a stray `&` would append connection parameters.
    // `host`/`port` are validated instead of encoded so IPv6 literals survive.
    // A malformed record returns undefined, which callers already surface as
    // "… has an unsupported database provider".
    const isNetworkProvider = provider === 'postgresql' || provider === 'mysql' || provider === 'mssql';
    if (isNetworkProvider && (!isSafeHost(host) || !isSafePort(port))) {
      return undefined;
    }
    const db = encodeURIComponent(database);

    switch (provider) {
      case 'postgresql':
        return `postgres://${credential}@${host}:${port}/${db}?schema=${encodeURIComponent(schema)}`;
      case 'mysql':
        return `mysql://${credential}@${host}:${port}/${db}`;
      case 'mssql':
        return `mssql://${credential}@${host}:${port}/${db}`;
      case 'sqlite':
        return `sqlite://${host}/${database}`;
      // db_connection comes from untyped JSON, so an unknown provider can reach
      // here at runtime; return undefined so callers surface a clear error.
      default:
        return undefined;
    }
```

The `sqlite` branch is deliberately left untouched: it interpolates `host` and `database` as a filesystem path, where encoding a `/` would break a nested path, and it never uses `port`.

Encoding is safe for the consumers: `TenantSeedService.createTenantClient` and the migration service both read the schema back with `new URL(database_url).searchParams.get('schema')`, and `URLSearchParams` percent-decodes automatically — so the schema they receive is byte-identical to the stored value.

- [ ] **Step 4: Run the scoped unit tests**

Run: `cd apps/micro-business && bun run test -- src/tenant/tenant.service.spec.ts --forceExit`
Expected: PASS, including all four `TenantService.getConnectionString` cases. Those fixtures use `host: 'db.example.com'`, `port: 6432`, `database: 'postgres'`, `schema: 'TENANT'` — all alphanumeric, so `encodeURIComponent` is a no-op and the guards accept them. The asserted URL strings do not change.

- [ ] **Step 5: Type-check the app**

Run: `cd apps/micro-business && bun run check-types`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/micro-business/src/tenant/tenant.service.ts
git commit -m "$(cat <<'EOF'
fix(tenant): encode database/schema when building the tenant URL

getConnectionString percent-encoded the credential but interpolated
database and schema raw. schema lands in the query string as
?schema=${schema}, so a stored value containing `&` appended arbitrary
connection parameters — and db_connection is operator-editable from the
Business Unit admin page.

Encode both, and validate host/port instead of encoding them so IPv6
literals survive. A malformed record returns undefined, the same signal
callers already handle for an unsupported provider. The sqlite branch is
left alone: it builds a filesystem path, not an authority.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend CLI — encode `database` / `schema` in `buildTenantUrl`

**Repo:** `carmen-turborepo-backend-v2` · **Branch:** `fix/tenant-url-component-encoding` (created in Task 2, Step 1)

**Files:**
- Modify: `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts` (`buildTenantUrl`)

**Interfaces:**
- Consumes: nothing from Tasks 1-2. This package cannot import from `apps/micro-business`, so the two validators from Task 2 are re-declared here. That duplication is intentional: different package, and a different error contract (`throw` rather than `undefined`).
- Produces: `buildTenantUrl(db_connection: DatabaseConfig): string` — signature unchanged.

- [ ] **Step 1: Add the two authority validators**

In `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts`, add at module level, directly above `buildTenantUrl`:

```ts
/**
 * Reject host values that could break out of the URI authority.
 * ปฏิเสธค่า host ที่อาจหลุดออกจากส่วน authority ของ URI
 * @param host - Host from db_connection / โฮสต์จาก db_connection
 * @returns True when the host is safe to interpolate / true เมื่อ host ปลอดภัยที่จะแทรกในสตริง
 */
const isSafeHost = (host: string): boolean =>
  typeof host === 'string' && host.length > 0 && !/[/?#@&]/.test(host);

/**
 * Accept only a positive integer port.
 * รับเฉพาะพอร์ตที่เป็นจำนวนเต็มบวก
 * @param port - Port from db_connection / พอร์ตจาก db_connection
 * @returns True when the port is a positive integer / true เมื่อพอร์ตเป็นจำนวนเต็มบวก
 */
const isSafePort = (port: number | string): boolean =>
  /^\d+$/.test(String(port)) && Number(port) > 0;
```

- [ ] **Step 2: Guard and encode in `buildTenantUrl`**

Replace the body of `buildTenantUrl` (keep its JSDoc block above it exactly as-is) with:

```ts
export function buildTenantUrl(db_connection: DatabaseConfig): string {
  const provider = db_connection.provider ?? 'postgresql';
  if (provider !== 'postgresql') {
    throw new Error(`Unsupported provider '${provider}'. Seed supports postgresql tenants only.`);
  }
  const username = db_connection.username ?? db_connection.user;
  const { password, host, port, database, schema } = db_connection;
  if (!isSafeHost(host)) {
    throw new Error(`Invalid host in db_connection: '${host}'.`);
  }
  if (!isSafePort(port)) {
    throw new Error(`Invalid port in db_connection: '${port}'.`);
  }
  const credential = `${encodeURIComponent(username ?? '')}:${encodeURIComponent(password ?? '')}`;
  return `postgresql://${credential}@${host}:${port}/${encodeURIComponent(database)}?schema=${encodeURIComponent(schema)}`;
}
```

Throwing matches this function's existing contract — it already throws on an unsupported provider, and `openTenant` wraps the call in a `try` that disconnects the platform client and rethrows.

`schemaOf`, which runs on the URL this function returns, is unaffected: it reads the value via `new URL(url).searchParams.get('schema')`, and `URLSearchParams` percent-decodes, so it still yields the original schema name.

- [ ] **Step 3: Type-check the package**

Run: `cd packages/prisma-shared-schema-tenant && bun run build`
Expected: clean. If it fails with a missing generated Prisma client, run `bun run db:generate` in the same directory first, then re-run `bun run build`.

- [ ] **Step 4: Re-run the tenant-seed unit tests**

Run: `cd apps/micro-business && bun run test -- src/authen/tenant_seed --forceExit`
Expected: PASS. These specs use a fake `TenantDb` and never build a URL, so they should be untouched — this run is a regression check that nothing in the package export surface shifted.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts
git commit -m "$(cat <<'EOF'
fix(tenant-schema): encode database/schema in buildTenantUrl

The CLI seeder's URL builder had the same gap as the runtime
getConnectionString: credentials were percent-encoded but database and
schema were interpolated raw, so a stored schema containing `&` appended
extra connection parameters.

Encode both, and reject a malformed host or port up front. host/port are
validated rather than encoded so IPv6 literals survive. schemaOf still
round-trips the original value, since URLSearchParams decodes on read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deferred to a follow-up (do not implement here)

Recorded so a reader does not mistake them for oversights — all three are documented in the spec's *Out of scope* section:

- Running the seed against DEV (backend PR #256 has not been deployed there yet). Once it is,
  the manual check from the spec applies: open a Business Unit, press **Check status**, and
  confirm that both `Running codes` and `Vendor business types` appear with the right badges,
  that a fully-seeded set's checkbox is disabled, and that the button reads `Nothing to seed`
  when nothing is selectable.
- **B2** — replacing `UNIQUE(name, deleted_at)` with a partial `UNIQUE(name) WHERE deleted_at IS NULL`. Pre-existing repo-wide pattern, needs its own migration.
- **B3** — deduplicating `definedKeys` in `vendorBusinessTypeSeedSet`. Cosmetic; all 12 current names are unique.
