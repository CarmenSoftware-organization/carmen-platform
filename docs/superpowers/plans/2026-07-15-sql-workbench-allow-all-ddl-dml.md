# SQL Workbench Allow-All DDL/DML + Show Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/sql-workbench` run any DDL/DML (with a destructive-op confirm gate and multi-statement support) and browse all tables in the object tree.

**Architecture:** Turn the client-side `sqlValidator` from an allow/deny gatekeeper into a structural validator + destructive-statement classifier. The Run flow validates only for emptiness, then routes destructive SQL through a `ConfirmDialog` before executing. The object tree gains a Tables section; clicking a table drops a `SELECT` into the shared editor. No backend changes — the client validator is UI-only and the backend remains the source of truth.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Vitest + React Testing Library + `@testing-library/user-event`, shadcn/ui (`ConfirmDialog`), lucide-react, sonner.

## Global Constraints

- Vitest tests: co-located `*.test.ts(x)`, **explicit imports** (`import { describe, it, expect, vi } from 'vitest'`), assert behavior not snapshots. Do not touch `tsconfig.json` / `vite.config.ts`.
- **Never modify `src/components/ui/`** — only consume `ConfirmDialog` (`components/ui/confirm-dialog.tsx`).
- The client validator is **UI-only, intentionally bypassable, never a security gate** — keep the `typeof window === 'undefined'` guard in `validateSqlSafety`.
- Destructive confirmation MUST use `<ConfirmDialog>` — never `window.confirm()`. User feedback via `toast.*` — never `alert()`.
- **No backend changes** in this repo. If the backend still rejects a statement, the existing catch → error toast surfaces its message.
- Destructive leading-keyword set (verbatim): `DROP, TRUNCATE, DELETE, UPDATE, ALTER, GRANT, REVOKE`. `INSERT`, `CREATE`, `SELECT`, `WITH` are **not** destructive.
- Generated table snippet (verbatim, unquoted identifiers): `SELECT * FROM ${schema}.${name} LIMIT 100;`
- Run test suite with: `bun run test` (one-shot). Single file: `bunx vitest run <path>`.

---

## Task 1: `sqlValidator` — gatekeeper → classifier

**Files:**
- Modify: `src/utils/sqlValidator.ts` (full rewrite of the exports; helper bodies unchanged)
- Test: `src/utils/sqlValidator.test.ts` (rewrite)

**Interfaces:**
- Consumes: nothing (leaf util).
- Produces:
  - `validateSqlSafety(sql: string, opts?: { allowMultiple?: boolean }): void` — throws on empty, on no-statement, and (when `allowMultiple` is false) on multiple statements. **No keyword blocking.**
  - `classifyStatements(sql: string): SqlClassification` where
    `SqlClassification = { statements: string[]; leadingKeywords: string[]; destructive: boolean; destructiveKeywords: string[]; unguardedWrite: boolean }`.
  - Named exports `extractTopLevelStatements(sql: string): string[]`, `leadingKeyword(stmt: string): string`.
  - **Removed:** the `allowedLeading` option and the `FORBIDDEN_LEADING` behavior.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `src/utils/sqlValidator.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { validateSqlSafety, classifyStatements } from './sqlValidator';

describe('validateSqlSafety', () => {
  it('throws on empty SQL', () => {
    expect(() => validateSqlSafety('   ')).toThrow(/empty/i);
  });

  it('allows any leading keyword (DROP no longer blocked)', () => {
    expect(() =>
      validateSqlSafety('DROP TABLE users', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('allows DML', () => {
    expect(() =>
      validateSqlSafety('UPDATE t SET a = 1', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('rejects multiple statements when allowMultiple is false', () => {
    expect(() =>
      validateSqlSafety('SELECT 1; SELECT 2', { allowMultiple: false }),
    ).toThrow(/Multiple statements/i);
  });

  it('permits multiple statements when allowMultiple is true', () => {
    expect(() =>
      validateSqlSafety('DELETE FROM a; DROP TABLE b', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('ignores semicolons inside string literals', () => {
    expect(() =>
      validateSqlSafety("SELECT ';' AS x", { allowMultiple: false }),
    ).not.toThrow();
  });
});

describe('classifyStatements', () => {
  it('flags DROP as destructive', () => {
    const c = classifyStatements('DROP TABLE users');
    expect(c.destructive).toBe(true);
    expect(c.destructiveKeywords).toEqual(['DROP']);
  });

  it('does not flag SELECT or INSERT as destructive', () => {
    expect(classifyStatements('SELECT * FROM t').destructive).toBe(false);
    expect(classifyStatements('INSERT INTO t VALUES (1)').destructive).toBe(false);
  });

  it('flags an UPDATE without WHERE as an unguarded write', () => {
    const c = classifyStatements('UPDATE t SET a = 1');
    expect(c.destructive).toBe(true);
    expect(c.unguardedWrite).toBe(true);
  });

  it('does not flag a DELETE with WHERE as unguarded', () => {
    const c = classifyStatements('DELETE FROM t WHERE id = 1');
    expect(c.destructive).toBe(true);
    expect(c.unguardedWrite).toBe(false);
  });

  it('collects distinct destructive keywords across multiple statements', () => {
    const c = classifyStatements('DELETE FROM a WHERE x=1; DROP TABLE b; SELECT 1');
    expect(c.leadingKeywords).toEqual(['DELETE', 'DROP', 'SELECT']);
    expect(c.destructiveKeywords.slice().sort()).toEqual(['DELETE', 'DROP']);
    expect(c.destructive).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/utils/sqlValidator.test.ts`
Expected: FAIL — `classifyStatements` is not exported yet, and the old signature still enforces `allowedLeading`.

- [ ] **Step 3: Rewrite `sqlValidator.ts`**

Replace the entire contents of `src/utils/sqlValidator.ts` with:

```ts
/**
 * Client-side SQL classifier — UI feedback only. The backend validator is the
 * source of truth; nothing here is a security gate and it is intentionally
 * bypassable. It exists to (a) reject structurally empty / accidental multi-
 * statement input and (b) flag destructive statements so the UI can confirm
 * before executing.
 */

export function extractTopLevelStatements(sql: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      buf += '/*'; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { buf += sql[i]; i++; }
      if (i < n) { buf += '*/'; i += 2; }
      continue;
    }
    if (ch === "'") {
      buf += ch; i++;
      while (i < n) {
        const c = sql[i]; buf += c; i++;
        if (c === "'") {
          if (sql[i] === "'") { buf += sql[i]; i++; continue; }
          break;
        }
      }
      continue;
    }
    if (ch === '"') {
      buf += ch; i++;
      while (i < n) {
        const c = sql[i]; buf += c; i++;
        if (c === '"') {
          if (sql[i] === '"') { buf += sql[i]; i++; continue; }
          break;
        }
      }
      continue;
    }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_]\w*)?\$/);
      if (m) {
        const tag = m[0];
        buf += tag; i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end < 0) { buf += sql.slice(i); i = n; }
        else { buf += sql.slice(i, end + tag.length); i = end + tag.length; }
        continue;
      }
    }
    if (ch === ';') {
      const t = buf.trim();
      if (t) stmts.push(t);
      buf = ''; i++;
      continue;
    }
    buf += ch; i++;
  }
  const last = buf.trim();
  if (last) stmts.push(last);
  return stmts;
}

export function leadingKeyword(stmt: string): string {
  const cleaned = stmt
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, '')
    .trimStart();
  const m = cleaned.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '';
}

const DESTRUCTIVE_LEADING = new Set([
  'DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'ALTER', 'GRANT', 'REVOKE',
]);

export interface SqlValidationOptions {
  allowMultiple?: boolean;
}

export function validateSqlSafety(
  sql: string,
  opts: SqlValidationOptions = {},
): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'validateSqlSafety is client-only — use the server validator instead',
    );
  }
  if (!sql?.trim()) throw new Error('SQL is empty');

  const stmts = extractTopLevelStatements(sql);
  if (stmts.length === 0) throw new Error('No SQL statement found');
  if (!opts.allowMultiple && stmts.length > 1) {
    throw new Error(
      `Multiple statements are not allowed (found ${stmts.length}). Send one statement at a time.`,
    );
  }
}

export interface SqlClassification {
  statements: string[];
  leadingKeywords: string[];
  destructive: boolean;
  destructiveKeywords: string[];
  unguardedWrite: boolean;
}

function stripComments(stmt: string): string {
  return stmt.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function classifyStatements(sql: string): SqlClassification {
  const statements = extractTopLevelStatements(sql);
  const leadingKeywords = statements.map(leadingKeyword);
  const destructiveKeywords = Array.from(
    new Set(leadingKeywords.filter((kw) => DESTRUCTIVE_LEADING.has(kw))),
  );
  const unguardedWrite = statements.some((stmt, i) => {
    const kw = leadingKeywords[i];
    if (kw !== 'DELETE' && kw !== 'UPDATE') return false;
    return !/\bWHERE\b/i.test(stripComments(stmt));
  });
  return {
    statements,
    leadingKeywords,
    destructive: destructiveKeywords.length > 0,
    destructiveKeywords,
    unguardedWrite,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/utils/sqlValidator.test.ts`
Expected: PASS (all cases in both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/utils/sqlValidator.ts src/utils/sqlValidator.test.ts
git commit -m "feat(sql-workbench): sqlValidator classifies instead of blocking DDL/DML"
```

---

## Task 2: Run flow — destructive confirm gate + multi-statement

**Files:**
- Modify: `src/pages/sqlWorkbench/SqlWorkbench.tsx`
- Test: `src/pages/sqlWorkbench/SqlWorkbench.test.tsx`

**Interfaces:**
- Consumes: `validateSqlSafety(sql, { allowMultiple })` and `classifyStatements(sql)` from Task 1; `ConfirmDialog` from `components/ui/confirm-dialog.tsx`.
- Produces: `handleRun` now confirms destructive SQL; internal `runSql(code, sqlToRun)` helper (used again nowhere else, but referenced by the ConfirmDialog `onConfirm`).

- [ ] **Step 1: Update the test file — teach the mock editor to Run, add Run tests**

In `src/pages/sqlWorkbench/SqlWorkbench.test.tsx`, replace the `vi.mock('./SqlEditor', …)` block (currently a bare textarea) with one that also exposes a Run button:

```tsx
// CodeMirror needs layout APIs jsdom lacks; stub the editor to a textarea + Run button.
vi.mock('./SqlEditor', () => ({
  SqlEditor: ({
    value,
    onChange,
    onRun,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRun?: (sql: string) => void;
  }) => (
    <div>
      <textarea aria-label="sql" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onRun?.(value)}>Run</button>
    </div>
  ),
}));
```

Then add these three tests inside the `describe('SqlWorkbench', …)` block (after the existing tests):

```tsx
  it('runs a non-destructive statement without confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'SELECT * FROM t');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'SELECT * FROM t'),
    );
    expect(screen.queryByText(/run destructive sql/i)).not.toBeInTheDocument();
  });

  it('confirms before running a destructive statement', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'DROP TABLE users');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    // Dialog shown, nothing executed yet.
    expect(await screen.findByText(/run destructive sql/i)).toBeInTheDocument();
    expect(sqlQueryService.executeSql).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /run anyway/i }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'DROP TABLE users'),
    );
  });

  it('allows a multi-statement run', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'SELECT 1; SELECT 2');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'SELECT 1; SELECT 2'),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/pages/sqlWorkbench/SqlWorkbench.test.tsx`
Expected: FAIL — the destructive test fails because there is no confirm dialog yet (DROP is currently rejected by the old validator; `executeSql` never fires and no dialog text exists). The multi-statement test also fails (old validator blocks multiple statements on Run).

- [ ] **Step 3: Add imports to `SqlWorkbench.tsx`**

Change the validator import (line ~17) from:

```tsx
import { validateSqlSafety } from '../../utils/sqlValidator';
```

to:

```tsx
import { validateSqlSafety, classifyStatements } from '../../utils/sqlValidator';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
```

- [ ] **Step 4: Add the `confirmSql` state**

Immediately after `const [isDropping, setIsDropping] = useState(false);`, add:

```tsx
  const [confirmSql, setConfirmSql] = useState<string | null>(null);
```

- [ ] **Step 5: Replace `handleRun` with `runSql` + `handleRun`**

Replace the entire existing `handleRun` function with:

```tsx
  const runSql = async (code: string, sqlToRun: string) => {
    setIsRunning(true);
    resetResult();
    try {
      const result = await sqlQueryService.executeSql(code, sqlToRun);
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale result
      setExecuteResult(result);
    } catch (e) {
      if (code !== buCodeRef.current) return; // BU changed mid-flight — discard stale error
      setExecuteError(e instanceof Error ? e.message : 'Failed to execute SQL');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun = async (sqlToRun: string) => {
    if (!buCode) {
      toast.error('Select a business unit first');
      return;
    }
    try {
      validateSqlSafety(sqlToRun, { allowMultiple: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid SQL');
      return;
    }
    if (classifyStatements(sqlToRun).destructive) {
      setConfirmSql(sqlToRun);
      return;
    }
    await runSql(buCode, sqlToRun);
  };
```

- [ ] **Step 6: Render the ConfirmDialog**

Immediately after the `<BuSwitcher … />` element in the returned JSX, insert:

```tsx
        {confirmSql !== null &&
          (() => {
            const c = classifyStatements(confirmSql);
            return (
              <ConfirmDialog
                open
                onOpenChange={(o) => {
                  if (!o) setConfirmSql(null);
                }}
                title="Run destructive SQL?"
                description={
                  `This runs ${c.destructiveKeywords.join(', ')} on the ` +
                  `${selectedBu?.code ?? 'tenant'} database and cannot be undone.` +
                  (c.unguardedWrite
                    ? ' A DELETE/UPDATE has no WHERE clause and will affect ALL rows.'
                    : '')
                }
                confirmText="Run anyway"
                confirmVariant="destructive"
                onConfirm={async () => {
                  await runSql(buCode, confirmSql);
                  setConfirmSql(null);
                }}
              />
            );
          })()}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bunx vitest run src/pages/sqlWorkbench/SqlWorkbench.test.tsx`
Expected: PASS (existing tests + the three new ones).

- [ ] **Step 8: Commit**

```bash
git add src/pages/sqlWorkbench/SqlWorkbench.tsx src/pages/sqlWorkbench/SqlWorkbench.test.tsx
git commit -m "feat(sql-workbench): confirm destructive SQL and allow multi-statement Run"
```

---

## Task 3: Save flow — drop the CREATE/SELECT allowlist

**Files:**
- Modify: `src/pages/sqlWorkbench/SqlWorkbench.tsx` (`handleSave`)
- Test: `src/pages/sqlWorkbench/SqlWorkbench.test.tsx`

**Interfaces:**
- Consumes: `validateSqlSafety(sql, { allowMultiple })` from Task 1.
- Produces: `handleSave` no longer restricts by leading keyword; the `startsWithCreate` variable is still used for the name-required check (do not delete it).

- [ ] **Step 1: Add the Save test**

Add this test inside the `describe('SqlWorkbench', …)` block:

```tsx
  it('saves SQL that the old CREATE/SELECT allowlist would have blocked', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.saveDdl).mockResolvedValue({
      type: 'view', name: 't', schema: 'public', executed_sql: 'CREATE TABLE t (id int)',
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'CREATE TABLE t (id int)');
    await user.type(screen.getByLabelText(/object name/i), 't');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(sqlQueryService.saveDdl).toHaveBeenCalled());
  });
```

(`CREATE TABLE` is not matched by the `startsWithCreate` view/proc/func regex, so the old `else` branch enforced `allowedLeading: ['SELECT','WITH']` and rejected it. Filling Object Name satisfies the view name-required check.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/pages/sqlWorkbench/SqlWorkbench.test.tsx -t "old CREATE/SELECT allowlist"`
Expected: FAIL — the current validator rejects `CREATE TABLE` under `allowedLeading: ['SELECT','WITH']`, so `saveDdl` is never called.

- [ ] **Step 3: Loosen the `handleSave` validation**

In `handleSave`, replace this block:

```tsx
    try {
      if (startsWithCreate) {
        validateSqlSafety(formSqlText, { allowedLeading: ['CREATE'], allowMultiple: true });
      } else {
        validateSqlSafety(formSqlText, {
          allowedLeading: ['SELECT', 'WITH'],
          allowMultiple: false,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid SQL', { duration: 8000 });
      return;
    }
```

with:

```tsx
    try {
      validateSqlSafety(formSqlText, { allowMultiple: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid SQL', { duration: 8000 });
      return;
    }
```

Leave the earlier `const stripped = …` / `const startsWithCreate = …` lines and the `if (formQueryType === 'view' && !formName.trim() && !startsWithCreate)` name check unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/pages/sqlWorkbench/SqlWorkbench.test.tsx`
Expected: PASS (all tests, including the new Save test).

- [ ] **Step 5: Commit**

```bash
git add src/pages/sqlWorkbench/SqlWorkbench.tsx src/pages/sqlWorkbench/SqlWorkbench.test.tsx
git commit -m "feat(sql-workbench): allow any statement type on Save"
```

---

## Task 4: Tables in the object tree + click-to-SELECT

**Files:**
- Modify: `src/pages/sqlWorkbench/DbObjectTree.tsx`
- Modify: `src/pages/sqlWorkbench/SqlWorkbench.tsx` (`handlePickDbObject`)
- Test: `src/pages/sqlWorkbench/DbObjectTree.test.tsx` (create)
- Test: `src/pages/sqlWorkbench/SqlWorkbench.test.tsx`

**Interfaces:**
- Consumes: `DbObjectsResponse.tables` (already returned by `getDbObjects`).
- Produces: `DbObjectTree`'s `onSelect` now accepts `type: 'view' | 'procedure' | 'function' | 'table'`; `SqlWorkbench.handlePickDbObject` handles `'table'` by writing `SELECT * FROM ${schema}.${name} LIMIT 100;` into `formSqlText` (no `getDefinition` call).

> Note: `DbObjectTree`'s `onSelect` union and `handlePickDbObject`'s parameter type must widen together — TypeScript strict mode fails the build if only one side changes. Do both before running the suite.

- [ ] **Step 1: Create `DbObjectTree.test.tsx`**

Create `src/pages/sqlWorkbench/DbObjectTree.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DbObjectTree } from './DbObjectTree';
import type { DbObjectsResponse } from '../../types';

const data: DbObjectsResponse = {
  tables: [{ schema: 'public', name: 'orders' }],
  views: [{ schema: 'public', name: 'v_test' }],
  procedures: [],
  columns: [],
};

describe('DbObjectTree', () => {
  it('renders a Tables section from data.tables', () => {
    render(
      <DbObjectTree
        data={data}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Tables')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('calls onSelect with type "table" when a table row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DbObjectTree
        data={data}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText('orders'));
    expect(onSelect).toHaveBeenCalledWith({ type: 'table', schema: 'public', name: 'orders' });
  });
});
```

- [ ] **Step 2: Add the table-click test to `SqlWorkbench.test.tsx`**

Add this test inside the `describe('SqlWorkbench', …)` block:

```tsx
  it('drops a SELECT into the editor when a table is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.getDbObjects).mockResolvedValueOnce({
      tables: [{ schema: 'public', name: 'orders' }],
      views: [],
      procedures: [],
      columns: [],
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.click(await screen.findByText('orders'));
    expect(screen.getByLabelText('sql')).toHaveValue('SELECT * FROM public.orders LIMIT 100;');
    expect(sqlQueryService.getDefinition).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/pages/sqlWorkbench/DbObjectTree.test.tsx src/pages/sqlWorkbench/SqlWorkbench.test.tsx`
Expected: FAIL — no Tables section is rendered, and clicking a table currently does nothing / no table is shown.

- [ ] **Step 4: Add the Tables section to `DbObjectTree.tsx`**

4a. Add the `Table` icon to the lucide import:

```tsx
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FunctionSquare,
  Loader2,
  Search,
  Database,
  Table,
} from 'lucide-react';
```

4b. Widen the `onSelect` prop type:

```tsx
  onSelect: (obj: {
    type: 'view' | 'procedure' | 'function' | 'table';
    schema: string;
    name: string;
  }) => void;
```

4c. Add the `openTables` state next to the other section state:

```tsx
  const [openTables, setOpenTables] = useState(true);
  const [openViews, setOpenViews] = useState(true);
  const [openProcs, setOpenProcs] = useState(true);
```

4d. Include `tables` in the filter — replace the `filtered` IIFE with:

```tsx
  const filtered = (() => {
    if (!data) return { tables: [], views: [], procedures: [] };
    const match = (o: DbObject) => {
      if (!lower) return true;
      const fq = `${o.schema}.${o.name}`.toLowerCase();
      return fq.includes(lower);
    };
    return {
      tables: data.tables.filter(match),
      views: data.views.filter(match),
      procedures: data.procedures.filter(match),
    };
  })();
```

4e. Add the `showTables` derived flag next to the others:

```tsx
  const showTables = isSearching ? filtered.tables.length > 0 : openTables;
  const showViews = isSearching ? filtered.views.length > 0 : openViews;
  const showProcs = isSearching ? filtered.procedures.length > 0 : openProcs;
```

4f. Update the search placeholder:

```tsx
            placeholder="Search tables, views, procedures..."
```

4g. Render a Tables `<Section>` as the **first** child inside the `<>…</>` that currently begins with the Views `<Section>` (i.e. immediately after the `) : (` of the not-loading/not-error branch, before `<Section title="Views" …>`):

```tsx
            <Section
              title="Tables"
              icon={<Table className="size-3.5" />}
              count={filtered.tables.length}
              total={data?.tables.length ?? 0}
              open={showTables}
              onToggle={() => setOpenTables((v) => !v)}
            >
              {filtered.tables.map((t) => (
                <ItemRow
                  key={keyOf('table', t)}
                  schema={t.schema}
                  name={t.name}
                  loading={loadingKey === keyOf('table', t)}
                  onClick={() =>
                    onSelect({ type: 'table', schema: t.schema, name: t.name })
                  }
                />
              ))}
              {filtered.tables.length === 0 && (
                <EmptyHint>{search ? 'No matches' : 'No tables'}</EmptyHint>
              )}
            </Section>
```

- [ ] **Step 5: Handle the `'table'` type in `handlePickDbObject`**

In `SqlWorkbench.tsx`, widen the `handlePickDbObject` parameter type and add an early table branch. Replace the function's opening:

```tsx
  const handlePickDbObject = async (obj: {
    type: 'view' | 'procedure' | 'function';
    schema: string;
    name: string;
  }) => {
    if (!buCode) return;
    const code = buCode;
```

with:

```tsx
  const handlePickDbObject = async (obj: {
    type: 'view' | 'procedure' | 'function' | 'table';
    schema: string;
    name: string;
  }) => {
    if (!buCode) return;
    if (obj.type === 'table') {
      setFormSqlText(`SELECT * FROM ${obj.schema}.${obj.name} LIMIT 100;`);
      setLoadedObject(null);
      resetResult();
      return;
    }
    const code = buCode;
```

(Leave the rest of `handlePickDbObject` unchanged. The early `return` narrows `obj.type` to the three editable kinds for the existing `getDefinition` path.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx vitest run src/pages/sqlWorkbench/DbObjectTree.test.tsx src/pages/sqlWorkbench/SqlWorkbench.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full suite + commit**

Run: `bun run test`
Expected: PASS (whole suite green).

```bash
git add src/pages/sqlWorkbench/DbObjectTree.tsx src/pages/sqlWorkbench/DbObjectTree.test.tsx src/pages/sqlWorkbench/SqlWorkbench.tsx src/pages/sqlWorkbench/SqlWorkbench.test.tsx
git commit -m "feat(sql-workbench): list tables in object tree, click to SELECT"
```

---

## Self-Review

**Spec coverage:**
- A1 (validator classifier, remove FORBIDDEN_LEADING, add `classifyStatements`, export helpers) → Task 1.
- A2 (Run confirm gate, `runSql` split, `confirmSql` + ConfirmDialog, `unguardedWrite` warning) → Task 2.
- A3 (Save drop allowlist) → Task 3.
- B1 (Tables section, widen `onSelect`, placeholder) → Task 4 Step 4.
- B2 (`handlePickDbObject` table branch, SELECT snippet, no `getDefinition`) → Task 4 Step 5.
- Backend non-goal → honored (no backend files touched; error surfacing unchanged).
- Tests (rewrite `sqlValidator.test.ts`; Run/Save/table/multi-stmt cases) → Tasks 1–4.

**Placeholder scan:** none — every code step contains full code; every run step has an exact command + expected result.

**Type consistency:** `classifyStatements` / `validateSqlSafety` signatures identical across Tasks 1–3. `onSelect` union `'view' | 'procedure' | 'function' | 'table'` matches `handlePickDbObject`'s widened parameter (Task 4 Steps 4b + 5). `SqlClassification` fields (`destructive`, `destructiveKeywords`, `unguardedWrite`, `leadingKeywords`, `statements`) used consistently in the ConfirmDialog and tests. `SaveDdlResult` mock shape (`type, name, schema, executed_sql`) matches `src/types/index.ts`.
