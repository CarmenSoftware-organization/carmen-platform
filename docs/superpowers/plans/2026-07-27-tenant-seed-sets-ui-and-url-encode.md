# Tenant Seed Set Visibility + Tenant URL Encoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TenantSeedCard` show every tenant seed set (fully-seeded ones visible but not selectable), and percent-encode `database` / `schema` in two of the codebase's tenant connection-string builders (a fourth builder, `apply-tenant-views.ts`, shares the bug class and is deferred — see the spec's Out of scope section).

**Architecture:** Three tasks across two repos. Task 1 rewrites one render block plus one state hook in a single React component. Tasks 2 and 3 fix two of the codebase's connection-string builders — the CLI one in `@repo/prisma-shared-schema-tenant`, and the runtime one in `micro-business` used by the seed and migration APIs. (This is not the full inventory of connection-string builders in the codebase — see Deferred to a follow-up below.) The two authority validators live in **one** shared module inside the package, which the runtime imports; Task 2 must therefore land before Task 3.

**Tech Stack:** React 19 + TypeScript (Vite), shadcn/ui + Tailwind, Vitest + React Testing Library (frontend) · NestJS + Prisma, Vitest (package) + Jest (micro-business) (backend)

**Spec:** `docs/superpowers/specs/2026-07-27-tenant-seed-sets-ui-and-url-encode-design.md`

## Global Constraints

- **Two repos, two branches.** Task 1 → `carmen-platform` on branch `feature/tenant-seed-set-visibility` (already created, already holds the spec and plan commits). Tasks 2–3 → `carmen-turborepo-backend-v2` on a new branch `fix/tenant-url-component-encoding` cut from `main`.
- **Tests are required for new behavior.** Every task adds tests covering the behavior it introduces. This overrides the standing "skip automated tests during plan execution" project rule — the human partner ruled explicitly on it before execution began.
- **The two authority validators exist exactly once**, in `packages/prisma-shared-schema-tenant/src/db-connection-url.ts`, exported from that package's `src/index.ts`. Both builders import them. Do not re-declare them anywhere.
- **The package's `.` export resolves to `./dist/src/index.js`.** After changing `src/`, run `bun run build` in the package *before* type-checking or testing `apps/micro-business`, or the runtime side will not see the new exports.
- **Never modify `src/components/ui/` primitives.**
- **Status must use `<Badge variant="success" | "secondary">`** — never raw green Tailwind classes.
- **Icon sizing:** `h-4 w-4` inside a button; `mr-2 h-4 w-4` when the button also has text.
- **Do not change either backend function's error contract.** `getConnectionString` returns `undefined` on a bad record; `buildTenantUrl` throws. Callers already surface both.
- **`host` and `port` are validated, never percent-encoded** — `encodeURIComponent` would destroy a bracketed IPv6 literal (`[::1]` → `%5B%3A%3A1%5D`); RFC 3986 requires an IP-literal host to be bracketed. Verified: `new URL('postgresql://u:p@::1:5432/db')` throws `ERR_INVALID_URL`, while `new URL('postgresql://u:p@[::1]:5432/db').hostname` is `'[::1]'`. A *bare* (unbracketed) IPv6 host is a pre-existing, undocumented-until-now limitation — it passes `isSafeHost` and the builder returns a value, but the caller's own `new URL(...)` then throws.
- **JSDoc is lint-enforced in the backend** (`jsdoc/require-jsdoc`, `require-description`, `require-param`, `require-returns` are all `error`). Every new exported function needs a JSDoc block with a description, `@param` for each parameter, and `@returns`. Match the bilingual EN/TH style of the surrounding code.
- **Backend Jest must be run scoped and in the foreground, with `--forceExit`** (the suite is known to hang on open handles otherwise).

---

### Task 1: Frontend — show every seed set in `TenantSeedCard`

**Repo:** `carmen-platform` · **Branch:** `feature/tenant-seed-set-visibility` (already checked out)

**Files:**
- Modify: `src/components/TenantSeedCard.tsx` (imports line 2; state after line 35; `fetchStatus` line 66-80; description line 126; render block lines 147-186)
- Modify: `src/components/TenantSeedCard.test.tsx` (repair one assertion, add three tests)

**Interfaces:**
- Consumes: `TenantSeedStatus`, `SeedSetStatus` from `src/types/index.ts` (unchanged — `{ key, label, defined, present, missing }`)
- Produces: nothing consumed by later tasks. Tasks 2 and 3 are in a different repo.

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

With fully-seeded sets now rendered, an `all_seeded` status produces two matches — the card-level badge and the new per-set badge — and `findByText` throws on multiple matches. That test's fixture has exactly one set, so replace the line with:

```tsx
    expect(await screen.findAllByText(/^seeded$/i)).toHaveLength(2);
```

Change nothing else in that test. Every other existing assertion survives: line 51's `queryByRole('button', { name: /seed \d+ row/i })` still finds nothing (the button now reads `"Nothing to seed"`, which has no digits), and tests 1 and 3 query `getAllByRole('checkbox')` while their *first* fixture is in effect, where every set still has a non-empty `missing`.

- [ ] **Step 7: Add three tests for the new behavior**

Append these to the existing `describe('TenantSeedCard', …)` block in `src/components/TenantSeedCard.test.tsx`:

```tsx
  it('renders a complete set with a Seeded badge and a disabled checkbox', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [
        { key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] },
        { key: 'vendor-business-type', label: 'Vendor business types', defined: 12, present: 12, missing: [] },
      ],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeEnabled();
    expect(boxes[1]).toBeDisabled();
    expect(screen.getByText(/Vendor business types/)).toBeInTheDocument();
    // only the incomplete set contributes to the button count
    expect(screen.getByRole('button', { name: /seed 2 row/i })).toBeEnabled();
  });

  it('keeps the seed button mounted and reads "Nothing to seed" when every set is complete', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: true,
      sets: [
        { key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] },
        { key: 'vendor-business-type', label: 'Vendor business types', defined: 12, present: 12, missing: [] },
      ],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    expect(await screen.findByRole('button', { name: /nothing to seed/i })).toBeDisabled();
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });

  it('collapses and re-expands the missing row list', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 13, missing: ['PRODUCT'] }],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // sets with missing rows start expanded
    expect(await screen.findByText('PRODUCT')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide missing rows for running codes/i }));
    expect(screen.queryByText('PRODUCT')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show missing rows for running codes/i }));
    expect(screen.getByText('PRODUCT')).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the full test suite**

Run: `bun run test`
Expected: all suites pass — 7 tests in `TenantSeedCard.test.tsx`. If `findAllByText` reports a length other than 2 in the repaired test, read the rendered output before changing the assertion: a third `Seeded` string means the render block was pasted in the wrong place.

- [ ] **Step 9: Run the production build (type + lint gate)**

Run: `bun run build`
Expected: clean. `vite-plugin-eslint` runs during build; an unused import (e.g. forgetting to use `ChevronRight`) fails here as `TS6133`.

- [ ] **Step 10: Commit**

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

### Task 2: Backend package — shared authority validators + encode in `buildTenantUrl`

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `packages/prisma-shared-schema-tenant/src/db-connection-url.ts`
- Create: `packages/prisma-shared-schema-tenant/src/db-connection-url.test.ts`
- Create: `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.test.ts`
- Modify: `packages/prisma-shared-schema-tenant/src/index.ts` (add one export line)
- Modify: `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts` (`buildTenantUrl`)

**Interfaces:**
- Consumes: nothing from Task 1 (different repo).
- Produces, for Task 3 to import from `@repo/prisma-shared-schema-tenant`:
  - `isSafeHost(host: string): boolean`
  - `isSafePort(port: number | string): boolean`
- `buildTenantUrl(db_connection: DatabaseConfig): string` — signature unchanged.

- [ ] **Step 1: Cut the backend branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main
git checkout -b fix/tenant-url-component-encoding
```

- [ ] **Step 2: Create the shared validator module**

Create `packages/prisma-shared-schema-tenant/src/db-connection-url.ts`:

```ts
/** @format */

/**
 * Reject host values that could break out of the URI authority.
 * Hosts are validated rather than percent-encoded because encoding would
 * destroy a bracketed IPv6 literal (`[::1]` becomes `%5B%3A%3A1%5D`).
 * ปฏิเสธค่า host ที่อาจหลุดออกจากส่วน authority ของ URI
 * host ถูกตรวจสอบแทนการเข้ารหัส percent เพราะการเข้ารหัสจะทำลาย IPv6 literal ที่มีวงเล็บ (`[::1]` จะกลายเป็น `%5B%3A%3A1%5D`)
 * @param host - Host from db_connection / โฮสต์จาก db_connection
 * @returns True when the host is safe to interpolate / true เมื่อ host ปลอดภัยที่จะแทรกในสตริง
 */
export const isSafeHost = (host: string): boolean =>
  typeof host === 'string' && host.length > 0 && !/[/?#@&]/.test(host);

/**
 * Accept only a positive integer port.
 * รับเฉพาะพอร์ตที่เป็นจำนวนเต็มบวก
 * @param port - Port from db_connection / พอร์ตจาก db_connection
 * @returns True when the port is a positive integer / true เมื่อพอร์ตเป็นจำนวนเต็มบวก
 */
export const isSafePort = (port: number | string): boolean =>
  /^\d+$/.test(String(port)) && Number(port) > 0;
```

The `typeof host === 'string'` check is not redundant at runtime: `db_connection` is untyped JSON cast with `as unknown as DatabaseConfig`, so the declared type is a claim, not a guarantee.

- [ ] **Step 3: Export the validators from the package barrel**

In `packages/prisma-shared-schema-tenant/src/index.ts`, append:

```ts
export { isSafeHost, isSafePort } from './db-connection-url';
```

- [ ] **Step 4: Guard and encode in `buildTenantUrl`**

In `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts`, add the import alongside the existing relative import style used for seed data:

```ts
import { isSafeHost, isSafePort } from '../../src/db-connection-url';
```

Then replace the body of `buildTenantUrl` — keeping its JSDoc block above it exactly as-is — with:

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

- [ ] **Step 5: Test the validators**

Create `packages/prisma-shared-schema-tenant/src/db-connection-url.test.ts`. Match the explicit-import style of the neighbouring `src/client.test.ts` rather than relying on the config's `globals: true`:

```ts
import { describe, it, expect } from 'vitest';
import { isSafeHost, isSafePort } from './db-connection-url';

describe('isSafeHost', () => {
  it('accepts hostnames, IPv4 and bracketed IPv6 literals', () => {
    expect(isSafeHost('db.example.com')).toBe(true);
    expect(isSafeHost('10.0.0.1')).toBe(true);
    expect(isSafeHost('[::1]')).toBe(true);
  });

  it('rejects an empty host and any authority-breaking character', () => {
    expect(isSafeHost('')).toBe(false);
    for (const bad of ['h/x', 'h?x', 'h#x', 'h@x', 'h&x']) {
      expect(isSafeHost(bad)).toBe(false);
    }
  });
});

describe('isSafePort', () => {
  it('accepts a positive integer as number or string', () => {
    expect(isSafePort(6432)).toBe(true);
    expect(isSafePort('5432')).toBe(true);
  });

  it('rejects zero, negatives, blanks and non-integers', () => {
    for (const bad of [0, -1, '', ' ', 'abc', '54.3']) {
      expect(isSafePort(bad)).toBe(false);
    }
  });
});
```

- [ ] **Step 6: Test `buildTenantUrl`**

Create `packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTenantUrl, type DatabaseConfig } from './tenant-connection';

const base: DatabaseConfig = {
  provider: 'postgresql',
  username: 'tenant_user',
  password: 'p@ss word',
  host: 'db.example.com',
  port: 6432,
  database: 'carmen',
  schema: 'TENANT',
};

describe('buildTenantUrl', () => {
  it('percent-encodes the credential, the database and the schema', () => {
    expect(buildTenantUrl({ ...base, database: 'car men', schema: 'a&b' })).toBe(
      'postgresql://tenant_user:p%40ss%20word@db.example.com:6432/car%20men?schema=a%26b',
    );
  });

  it('round-trips the schema back through URLSearchParams', () => {
    const url = buildTenantUrl({ ...base, schema: 'a&b' });
    expect(new URL(url).searchParams.get('schema')).toBe('a&b');
  });

  it('rejects a host that could break out of the authority', () => {
    expect(() => buildTenantUrl({ ...base, host: 'evil.com/x' })).toThrow(/Invalid host/);
  });

  it('rejects a non-numeric port', () => {
    expect(() => buildTenantUrl({ ...base, port: 'abc' })).toThrow(/Invalid port/);
  });
});
```

This module calls `dotenvx.config()` at import time and imports both generated Prisma clients, whose `dist` builds are present — so the import resolves. If it does **not** resolve in your environment, report `DONE_WITH_CONCERNS` with the exact error rather than weakening the test to avoid the import.

- [ ] **Step 7: Run the package tests**

Run: `cd packages/prisma-shared-schema-tenant && bun run test`
Expected: PASS, including the pre-existing `src/client.test.ts`, `src/seed-data/running-code.spec.ts` and `prisma/workflow-recipients.spec.ts`.

- [ ] **Step 8: Build the package**

Run: `cd packages/prisma-shared-schema-tenant && bun run build`
Expected: clean. This step is mandatory, not optional — the package's `.` export points at `./dist/src/index.js`, so Task 3 cannot see `isSafeHost` / `isSafePort` until this build runs. If it fails with a missing generated Prisma client, run `bun run db:generate` in the same directory first, then re-run `bun run build`.

- [ ] **Step 9: Commit**

```bash
git add packages/prisma-shared-schema-tenant/src/db-connection-url.ts \
        packages/prisma-shared-schema-tenant/src/db-connection-url.test.ts \
        packages/prisma-shared-schema-tenant/src/index.ts \
        packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.ts \
        packages/prisma-shared-schema-tenant/prisma/lib/tenant-connection.test.ts
git commit -m "$(cat <<'EOF'
fix(tenant-schema): encode database/schema in buildTenantUrl

The CLI seeder's URL builder percent-encoded the credential but
interpolated database and schema raw, so a stored schema containing `&`
appended extra connection parameters — and db_connection is
operator-editable from the Business Unit admin page.

Encode both, and reject a malformed host or port up front. host/port are
validated rather than encoded so IPv6 literals survive. schemaOf still
round-trips the original value, since URLSearchParams decodes on read.

The two validators land in src/db-connection-url.ts and are exported from
the package barrel, so the runtime builder in micro-business can share
them instead of carrying a second copy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend runtime — encode `database` / `schema` in `getConnectionString`

**Repo:** `carmen-turborepo-backend-v2` · **Branch:** `fix/tenant-url-component-encoding` (created in Task 2, Step 1)

**Files:**
- Modify: `apps/micro-business/src/tenant/tenant.service.ts` (imports; `getConnectionString` at lines 438-463)
- Modify: `apps/micro-business/src/tenant/tenant.service.spec.ts` (add three cases to the existing `TenantService.getConnectionString` describe block)

**Interfaces:**
- Consumes, from `@repo/prisma-shared-schema-tenant` (created in Task 2): `isSafeHost(host: string): boolean` and `isSafePort(port: number | string): boolean`. Task 2's Step 8 build must have run, or these will not resolve.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import the shared validators**

In `apps/micro-business/src/tenant/tenant.service.ts`, add `isSafeHost` and `isSafePort` to the existing `@repo/prisma-shared-schema-tenant` import if one is present in this file, or add a new import line next to the other `@repo/...` imports:

```ts
import { isSafeHost, isSafePort } from '@repo/prisma-shared-schema-tenant';
```

Do not re-declare these functions locally — they exist exactly once, in the package.

- [ ] **Step 2: Guard and encode inside `getConnectionString`**

Leave lines 439-448 untouched — the four-line explanatory comment, `const provider = …`, `const username = …`, the `const { password, host, port, database, schema } = db_connection;` destructure, and the two-line credential comment plus `const credential = …`. Insert the guard directly after the `credential` line, then encode in the three network-provider branches:

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

- [ ] **Step 3: Add three cases to the existing spec**

In `apps/micro-business/src/tenant/tenant.service.spec.ts`, inside the existing
`describe('TenantService.getConnectionString', …)` block (which already defines a `base` fixture with `password: 'secret'`, `host: 'db.example.com'`, `port: 6432`, `database: 'postgres'`, `schema: 'TENANT'`), append:

```ts
  it('percent-encodes the database and the schema', () => {
    expect(
      service.getConnectionString({ ...base, user: 'developer', database: 'car men', schema: 'a&b' }),
    ).toBe('postgres://developer:secret@db.example.com:6432/car%20men?schema=a%26b');
  });

  it('returns undefined for a host that could break out of the authority', () => {
    expect(
      service.getConnectionString({ ...base, user: 'developer', host: 'evil.com/x' }),
    ).toBeUndefined();
  });

  it('returns undefined for a non-numeric port', () => {
    expect(
      service.getConnectionString({ ...base, user: 'developer', port: 'abc' }),
    ).toBeUndefined();
  });
```

If `port: 'abc'` does not type-check against the local `DatabaseConfig`, cast it at that call site (`port: 'abc' as unknown as number`) rather than widening the shared type.

The pre-existing cases in this block must keep passing untouched. Note that the mysql case's `database` fixture is `'car men'` (not alphanumeric) — that was deliberately changed by a later fix precisely so it exercises encoding; the rest of the pre-existing fixture values are alphanumeric, so `encodeURIComponent` is a no-op and the guards accept them.

- [ ] **Step 4: Run the scoped unit tests**

Run: `cd apps/micro-business && bun run test -- src/tenant/tenant.service.spec.ts --forceExit`
Expected: PASS — eight cases in the `getConnectionString` block.

- [ ] **Step 5: Type-check the app**

Run: `cd apps/micro-business && bun run check-types`
Expected: clean. If `isSafeHost` / `isSafePort` fail to resolve from `@repo/prisma-shared-schema-tenant`, Task 2's Step 8 build did not run — run `cd packages/prisma-shared-schema-tenant && bun run build` and retry.

- [ ] **Step 6: Regression-check the tenant seed specs**

Run: `cd apps/micro-business && bun run test -- src/authen/tenant_seed --forceExit`
Expected: PASS. These specs use a fake `TenantDb` and never build a URL — this run confirms nothing in the package export surface shifted under them.

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/tenant/tenant.service.ts \
        apps/micro-business/src/tenant/tenant.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(tenant): encode database/schema when building the tenant URL

getConnectionString percent-encoded the credential but interpolated
database and schema raw. schema lands in the query string as
?schema=${schema}, so a stored value containing `&` appended arbitrary
connection parameters — and db_connection is operator-editable from the
Business Unit admin page.

Encode both, and validate host/port with the shared helpers from
@repo/prisma-shared-schema-tenant instead of encoding them, so IPv6
literals survive. A malformed record returns undefined, the same signal
callers already handle for an unsupported provider. The sqlite branch is
left alone: it builds a filesystem path, not an authority.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Pre-flight rulings

Both were raised before execution and decided by the human partner; they override the plan's original text and the standing project rules they collide with:

1. **Tests vs. the "skip automated tests" project rule** → tests win. Every task adds coverage for the behavior it introduces.
2. **Shared helper vs. deliberate duplication** → shared helper wins. `isSafeHost` / `isSafePort` live only in `packages/prisma-shared-schema-tenant/src/db-connection-url.ts`. This is why Task 2 (the package) precedes Task 3 (its consumer).

## Deferred to a follow-up (do not implement here)

Recorded so a reader does not mistake them for oversights — all are documented in the spec's *Out of scope* section:

- Running the seed against DEV (backend PR #256 has not been deployed there yet). Once it is,
  the manual check from the spec applies: open a Business Unit, press **Check status**, and
  confirm that both `Running codes` and `Vendor business types` appear with the right badges,
  that a fully-seeded set's checkbox is disabled, and that the button reads `Nothing to seed`
  when nothing is selectable.
- **B2** — replacing `UNIQUE(name, deleted_at)` with a partial `UNIQUE(name) WHERE deleted_at IS NULL`. Pre-existing repo-wide pattern, needs its own migration.
- **B3** — deduplicating `definedKeys` in `vendorBusinessTypeSeedSet`. Cosmetic; all 12 current names are unique.
- **B4** — a fourth connection-string builder, `packages/prisma-shared-schema-platform/prisma/apply-tenant-views.ts`, was found by the final review to share B1's bug class (raw `host`/`port`/`database`, no guard, no encoding, around line 107) plus a separate SQL-identifier injection into `psql -c` (raw `schema` inside a double-quoted identifier, around line 121; a `quoteIdent` precedent exists in `apps/micro-business/src/sql-query/sql-query.service.ts`). Not touched by this branch — the bug class is not closed repo-wide.
- The pre-existing `listActiveConnections` reporting gap in `apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts`: it silently omits any BU it cannot resolve (it already skipped BUs with no `db_connection` before this branch), while `deployAllStream` / `deployAll` / `statusAll` report `total` as the post-filter count — so a batch report can read `failed: 0` while a BU was silently skipped. This branch widens the set of inputs that reach that path but does not change the counting behavior.
