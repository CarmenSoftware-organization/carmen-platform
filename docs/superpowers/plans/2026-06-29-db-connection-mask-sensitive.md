# Mask Sensitive db_connection Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-JSON `<pre>` dump in the Business Unit "Database Connection" section with a structured key/value view that masks sensitive values by default (default-deny allowlist) and offers a per-field reveal toggle.

**Architecture:** A pure parsing util (`src/utils/dbConnection.ts`) turns the raw `db_connection` string into `{ key, value, sensitive }` entries; a presentational component (`src/components/DbConnectionView.tsx`) renders those rows with per-field reveal state; `BusinessUnitEdit.tsx` swaps its `<pre>` for the component. Display-only — `formData.db_connection` is never mutated, so save round-trips unchanged.

**Tech Stack:** React 18 + TypeScript, Tailwind, shadcn/ui (`Button`), lucide-react (`Eye`/`EyeOff`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-29-db-connection-mask-sensitive-design.md`

## Global Constraints

- **No new libraries** — use existing `Button` primitive and lucide-react icons only.
- **Never modify `src/components/ui/`** primitives — the new component lives in `src/components/`.
- **Display-only:** never mutate `formData.db_connection`; the component only reads its `value` prop.
- **Masking is shoulder-surfing protection, not redaction** — the full value is still in the API response. Do not claim it as a security boundary.
- **No unit-test runner is configured** (Vitest pending). Fast feedback per task: `bunx tsc --noEmit` (tsconfig.json present). The pure util is verified with a throwaway `bun run` script (created at repo root, run, then deleted — never committed). UI behavior is verified manually via `bun start` (dev server on :3304, reads `.env.development`).
- **Safe-key allowlist (verbatim):** `host, hostname, port, schema, database, db, dialect, type, ssl, sslmode` — case-insensitive. Everything else is masked.
- **Mask string:** `••••••••` (fixed 8 dots, independent of the real value's length).

---

### Task 1: Pure masking util

**Files:**
- Create: `src/utils/dbConnection.ts`
- Verify (throwaway, not committed): `tmp-check-dbconn.ts` at repo root

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SAFE_DB_CONNECTION_KEYS: string[]`
  - `isSafeKey(key: string): boolean`
  - `interface DbConnectionEntry { key: string; value: string; sensitive: boolean }`
  - `type ParsedDbConnection = { ok: true; entries: DbConnectionEntry[] } | { ok: false; raw: string }`
  - `parseDbConnection(raw: string): ParsedDbConnection`

- [ ] **Step 1: Write the util**

Create `src/utils/dbConnection.ts`:

```ts
/**
 * Keys whose values are safe to show in plain text. Default-deny: everything
 * NOT listed here is masked. Case-insensitive. Extend this list (the only place)
 * if a benign key needs to render in the clear.
 */
export const SAFE_DB_CONNECTION_KEYS = [
  'host', 'hostname', 'port', 'schema', 'database', 'db',
  'dialect', 'type', 'ssl', 'sslmode',
];

export interface DbConnectionEntry {
  key: string;
  value: string;       // display string (objects/arrays -> JSON)
  sensitive: boolean;  // true when the key is NOT in the safe allowlist
}

export type ParsedDbConnection =
  | { ok: true; entries: DbConnectionEntry[] }
  | { ok: false; raw: string };

/** True when a key is in the safe allowlist (case-insensitive). */
export const isSafeKey = (key: string): boolean =>
  SAFE_DB_CONNECTION_KEYS.includes(key.trim().toLowerCase());

const toDisplayString = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Parse the raw db_connection string into maskable entries.
 * - empty / whitespace            -> { ok: true, entries: [] }
 * - JSON object                   -> { ok: true, entries: [...] } (sensitive = !isSafeKey)
 * - parse error / non-object      -> { ok: false, raw }  (e.g. a bare connection string)
 */
export const parseDbConnection = (raw: string): ParsedDbConnection => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, entries: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, raw: trimmed };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, raw: trimmed };
  }

  const entries: DbConnectionEntry[] = Object.entries(parsed as Record<string, unknown>).map(
    ([key, value]) => ({ key, value: toDisplayString(value), sensitive: !isSafeKey(key) }),
  );
  return { ok: true, entries };
};
```

- [ ] **Step 2: Write a throwaway verification script**

Create `tmp-check-dbconn.ts` at the repo root:

```ts
import { parseDbConnection, isSafeKey } from './src/utils/dbConnection';

console.log('isSafeKey HOST     ->', isSafeKey('HOST'), '(expect true)');
console.log('isSafeKey password ->', isSafeKey('password'), '(expect false)');
console.log('empty   ->', JSON.stringify(parseDbConnection('   ')));
console.log('object  ->', JSON.stringify(parseDbConnection('{"host":"h","port":5432,"username":"u","password":"p"}')));
console.log('nested  ->', JSON.stringify(parseDbConnection('{"ssl":{"rejectUnauthorized":false},"secret":"x"}')));
console.log('string  ->', JSON.stringify(parseDbConnection('postgres://u:p@h:5432/db')));
console.log('bad     ->', JSON.stringify(parseDbConnection('{not json')));
```

- [ ] **Step 3: Run it (expected to fail first — util not yet imported correctly / typos)**

Run: `bun run tmp-check-dbconn.ts`
Expected output:
```
isSafeKey HOST     -> true (expect true)
isSafeKey password -> false (expect false)
empty   -> {"ok":true,"entries":[]}
object  -> {"ok":true,"entries":[{"key":"host","value":"h","sensitive":false},{"key":"port","value":"5432","sensitive":false},{"key":"username","value":"u","sensitive":true},{"key":"password","value":"p","sensitive":true}]}
nested  -> {"ok":true,"entries":[{"key":"ssl","value":"{\"rejectUnauthorized\":false}","sensitive":false},{"key":"secret","value":"x","sensitive":true}]}
string  -> {"ok":false,"raw":"postgres://u:p@h:5432/db"}
bad     -> {"ok":false,"raw":"{not json"}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Delete the throwaway script and commit only the util**

```bash
rm tmp-check-dbconn.ts
git add src/utils/dbConnection.ts
git commit -m "feat(business-units): add db_connection masking util (default-deny allowlist)"
```

---

### Task 2: DbConnectionView component

**Files:**
- Create: `src/components/DbConnectionView.tsx`

**Interfaces:**
- Consumes: `parseDbConnection` from `../utils/dbConnection` (Task 1).
- Produces: default export `DbConnectionView` — `(props: { value: string }) => JSX.Element`.

- [ ] **Step 1: Write the component**

Create `src/components/DbConnectionView.tsx`:

```tsx
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { parseDbConnection } from '../utils/dbConnection';

const MASK = '••••••••';

interface DbConnectionViewProps {
  value: string;
}

/**
 * Read-only structured view of a BU's db_connection. Sensitive values (any key
 * not in the safe allowlist) are masked with a per-field reveal toggle. Reveal
 * state is local only — it resets on unmount/navigation and is never persisted.
 * Display-only: never mutates the source value.
 */
export const DbConnectionView = ({ value }: DbConnectionViewProps) => {
  const parsed = parseDbConnection(value);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setRevealed((prev) => ({ ...prev, [k]: !prev[k] }));

  // empty
  if (parsed.ok && parsed.entries.length === 0) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  // fallback: unparseable / bare connection string -> single masked row
  if (!parsed.ok) {
    const shown = !!revealed.raw;
    return (
      <div className="rounded-md border border-input bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
            Connection string
          </span>
          <span className="flex-1 break-all font-mono text-sm">{shown ? parsed.raw : MASK}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => toggle('raw')}
            aria-label={shown ? 'Hide connection string' : 'Reveal connection string'}
          >
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // structured rows
  return (
    <div className="divide-y rounded-md border border-input bg-muted/50">
      {parsed.entries.map((e) => {
        const shown = !e.sensitive || !!revealed[e.key];
        return (
          <div key={e.key} className="flex items-center gap-2 px-3 py-2">
            <span className="w-32 shrink-0 break-all text-xs font-medium text-muted-foreground">
              {e.key}
            </span>
            <span className="flex-1 break-all font-mono text-sm">{shown ? e.value : MASK}</span>
            {e.sensitive && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => toggle(e.key)}
                aria-label={revealed[e.key] ? `Hide ${e.key}` : `Reveal ${e.key}`}
              >
                {revealed[e.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DbConnectionView;
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DbConnectionView.tsx
git commit -m "feat(business-units): add DbConnectionView with per-field sensitive masking"
```

---

### Task 3: Wire into BusinessUnitEdit

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx` (add import near the other component imports; replace the `<pre>` inside the "Database Connection" `CollapsibleSection`, ~lines 1470-1477)

**Interfaces:**
- Consumes: `DbConnectionView` default export from `../components/DbConnectionView` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Add the import**

Near the top of `src/pages/BusinessUnitEdit.tsx`, with the other `../components/...` imports, add:

```tsx
import DbConnectionView from '../components/DbConnectionView';
```

- [ ] **Step 2: Replace the `<pre>` block**

Find (inside the "Database Connection" `CollapsibleSection`):

```tsx
              <Label htmlFor="db_connection">Connection Config</Label>
              <pre className={`w-full rounded-md border border-input px-3 py-2 text-sm font-mono min-h-[4.5rem] whitespace-pre-wrap break-all overflow-auto max-h-60 ${editing ? 'bg-transparent' : 'bg-muted/50'}`}>
                {formData.db_connection ? (() => { try { return JSON.stringify(JSON.parse(formData.db_connection), null, 2); } catch { return formData.db_connection; } })() : '-'}
              </pre>
```

Replace with:

```tsx
              <Label htmlFor="db_connection">Connection Config</Label>
              <DbConnectionView value={formData.db_connection} />
```

(Leave the surrounding `<CollapsibleSection>` and `<div className="space-y-2">` unchanged.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `bun start` (dev server on :3304), then open `http://localhost:3304/business-units/72195b8e-d0d0-4816-9937-4d3436deb122/edit` and confirm:
- Safe keys (host/port/schema) render in plain text; non-safe keys (e.g. username/password) show `••••••••` with an eye toggle.
- Clicking the eye reveals the real value; clicking again re-masks; navigating away and back re-masks.
- A BU whose `db_connection` is a bare string shows a single masked "Connection string" row.
- A BU with empty `db_connection` shows `-`.
- Enter edit mode and Save without touching the connection → the BU saves successfully (round-trip unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx
git commit -m "feat(business-units): use DbConnectionView in the edit page (mask sensitive fields)"
```

---

## Self-Review

**Spec coverage:**
- Structured key/value display → Task 2 (rows) + Task 3 (wiring). ✓
- Default-deny allowlist masking → Task 1 (`SAFE_DB_CONNECTION_KEYS`, `isSafeKey`). ✓
- Per-field reveal, local state, re-mask on navigation → Task 2 (`revealed` state, resets on unmount). ✓
- Fallback for unparseable / bare connection string → Task 1 (`{ ok: false }`) + Task 2 (single masked row). ✓
- Empty `db_connection` → `-` → Task 1 (`entries: []`) + Task 2 (muted `-`). ✓
- Display-only / round-trip safety → component reads `value` only; Task 3 Step 4 verifies a save. ✓
- Reveal available to anyone on the page (no extra gating) → component has no auth prop. ✓

**Placeholder scan:** none — every code step has full code; commands have expected output.

**Type consistency:** `parseDbConnection` / `ParsedDbConnection` / `DbConnectionEntry` names and the `{ value: string }` prop match across Tasks 1→2→3.
