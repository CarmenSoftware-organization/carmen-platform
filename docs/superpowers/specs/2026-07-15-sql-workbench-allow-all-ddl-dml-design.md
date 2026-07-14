# SQL Workbench — Allow all DDL/DML + show Tables

**Date:** 2026-07-15
**Page:** `/sql-workbench` (`src/pages/sqlWorkbench/`)
**Status:** Approved design, pending implementation plan

## Problem

Two limitations on the SQL Workbench:

1. **Restricted statement types.** The client-side validator (`src/utils/sqlValidator.ts`) blocks everything except read-only statements. The **Run** path allows only `SELECT / WITH / SHOW / EXPLAIN / DESCRIBE / DESC` (single statement). The **Save** path allows only `CREATE` or `SELECT / WITH`. A hard `FORBIDDEN_LEADING` set (`DROP, TRUNCATE, GRANT, REVOKE, COPY, VACUUM, CLUSTER, REASSIGN, REINDEX, ALTER`) is rejected regardless of the allowlist. Operators cannot run arbitrary DDL/DML (INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE/…) against a tenant DB.

2. **Tables are not shown.** The backend `/db-objects` endpoint already returns `tables: DbObject[]` (see `DbObjectsResponse` in `src/types/index.ts`), but `DbObjectTree.tsx` renders only **Views** and **Procedures / Functions**. There is no way to browse tables.

## Goal

- Let the Run editor execute **any** DDL/DML, including multiple statements in one run.
- Keep a **confirmation gate** for destructive statements (guard against accidental data loss on a live tenant DB).
- Show all **tables** in the object tree; clicking a table drops a `SELECT` into the editor.

## Non-goals

- No per-statement client-side splitting/sequencing — the backend `/execute` receives the whole script.
- No EXPLAIN/dry-run preview.
- No column expansion under tables.
- No identifier quoting in the generated snippet (matches the existing unquoted ref style).
- **No backend changes in this repo.** This is a frontend-only repo. The client validator is UI-only and explicitly bypassable; the backend is the source of truth. If `/api/config/:buCode/execute` still rejects DDL/DML server-side, that must be addressed separately in `carmen-turborepo-backend-v2`. Once the frontend stops pre-blocking, any backend rejection surfaces through the existing catch → error toast.

## Requirement A — Allow all DDL/DML

### A1. `src/utils/sqlValidator.ts` — gatekeeper → classifier

- **Remove** the `FORBIDDEN_LEADING` hard-block entirely.
- `validateSqlSafety(sql, opts)` keeps only structural guards:
  - throw on empty SQL.
  - throw when no statement is parsed.
  - when `allowMultiple === false` and more than one statement is present, throw (option retained; callers pass `allowMultiple: true`).
  - **No keyword blocking** — drop the `allowedLeading` allowlist check.
- **Add** `classifyStatements(sql): SqlClassification`:

  ```ts
  interface SqlClassification {
    statements: string[];        // top-level statements
    leadingKeywords: string[];   // uppercase leading keyword per statement
    destructive: boolean;        // any leading keyword in DESTRUCTIVE
    destructiveKeywords: string[]; // distinct destructive keywords found
    unguardedWrite: boolean;     // any DELETE/UPDATE with no WHERE clause
  }
  ```

  - `DESTRUCTIVE = { DROP, TRUNCATE, DELETE, UPDATE, ALTER, GRANT, REVOKE }`.
  - `unguardedWrite`: a statement whose leading keyword is `DELETE` or `UPDATE` and whose body (comments already handled by the extractor) has no top-level `\bWHERE\b`. Best-effort; used only to strengthen the confirm message, never to block.
- **Export** the existing `extractTopLevelStatements` and `leadingKeyword` helpers (currently module-private) so `classifyStatements` and the tests can reuse them.
- Keep the `typeof window === 'undefined'` client-only guard in `validateSqlSafety`.

### A2. `SqlWorkbench.tsx` — Run flow with confirm gate

- Extract the current execute body into `runSql(code: string, sqlToRun: string)` (unchanged try/catch, stale-BU discard, result/error state).
- New state: `const [confirmSql, setConfirmSql] = useState<string | null>(null)`.
- `handleRun(sqlToRun)`:
  1. guard `buCode` (existing toast).
  2. `validateSqlSafety(sqlToRun, { allowMultiple: true })` inside try/catch → toast on throw (empty only).
  3. `const c = classifyStatements(sqlToRun)`.
  4. if `c.destructive` → `setConfirmSql(sqlToRun)` (open dialog); else → `runSql(buCode, sqlToRun)`.
- Render a `ConfirmDialog` driven by `open={confirmSql !== null}`:
  - `confirmVariant="destructive"`, `confirmText="Run anyway"`.
  - `title`: e.g. `Run destructive SQL?`
  - `description`: lists `c.destructiveKeywords`; if `c.unguardedWrite`, add an explicit warning that a DELETE/UPDATE has no WHERE (affects all rows).
  - `onConfirm`: `runSql(buCode, confirmSql)` then `setConfirmSql(null)`.
  - `onOpenChange(false)`: `setConfirmSql(null)`.
  - Note: classification for the description is recomputed from `confirmSql` at render time (cheap) or stored alongside — implementer's choice.

### A3. `handleSave` — drop the allowlist

- Replace both `validateSqlSafety(..., { allowedLeading: [...] })` calls with a single `validateSqlSafety(formSqlText, { allowMultiple: true })`.
- Keep the existing name check and `query_type` handling untouched.
- No confirm gate on Save (object-persist flow, low destructive risk).

## Requirement B — Show Tables in the object tree

### B1. `DbObjectTree.tsx`

- Widen the `onSelect` type union to include `'table'`:
  `onSelect: (obj: { type: 'view' | 'procedure' | 'function' | 'table'; schema: string; name: string }) => void`.
- Add a **Tables** section, rendered first (above Views), using the `Table` icon from `lucide-react`.
- New state `openTables` (default `true`); include `tables` in the search filter and the `isSearching` show/hide logic, mirroring views/procedures.
- Update the search input placeholder to `Search tables, views, procedures...`.
- A table row calls `onSelect({ type: 'table', schema, name })`. Tables need no badge and no `getDefinition` loading spinner semantics beyond the standard row.

### B2. `SqlWorkbench.handlePickDbObject`

- Accept the widened union (`'table'` added).
- Early branch: if `obj.type === 'table'`:
  - `setFormSqlText(\`SELECT * FROM ${obj.schema}.${obj.name} LIMIT 100;\`)`
  - `setLoadedObject(null)` (a table is not an editable saved object)
  - `resetResult()`
  - return — **do not** call `sqlQueryService.getDefinition`.
- Otherwise: existing behavior unchanged.

## Data flow (Run)

```
SqlEditor (Run / Ctrl+Enter)
  -> handleRun(sql)
       -> validateSqlSafety(sql, { allowMultiple: true })   // empty guard only
       -> classifyStatements(sql)
            destructive? -> ConfirmDialog -> onConfirm -> runSql -> executeSql API
            safe?        -> runSql -> executeSql API
```

## Data flow (Table click)

```
DbObjectTree table row
  -> onSelect({ type: 'table', schema, name })
  -> handlePickDbObject -> setFormSqlText('SELECT * FROM schema.name LIMIT 100;')
  (user presses Run to execute)
```

## Tests

- **`src/utils/sqlValidator.test.ts`** — rewrite:
  - remove the forbidden/allowlist assertions.
  - `validateSqlSafety`: empty throws; multi-statement throws only when `allowMultiple: false`; passes for DROP/INSERT/etc.
  - `classifyStatements`: detects each destructive keyword; `destructive=false` for SELECT/INSERT-with-values? (INSERT is **not** in the destructive set — verify); `unguardedWrite=true` for `DELETE FROM t` / `UPDATE t SET ...` with no WHERE and `false` when WHERE present; multi-statement collects all leading keywords.
- **`src/pages/sqlWorkbench/SqlWorkbench.test.tsx`** — add:
  - destructive SQL opens the ConfirmDialog and only calls `executeSql` after confirm.
  - non-destructive SQL runs directly (no dialog).
  - multi-statement Run is not blocked.
  - clicking a table sets the editor to the `SELECT * FROM … LIMIT 100;` snippet and does not call `getDefinition`.
  - (mock `sqlQueryService`, keep routing real per repo test convention.)

## Files touched

| File | Change |
|------|--------|
| `src/utils/sqlValidator.ts` | remove FORBIDDEN_LEADING; slim `validateSqlSafety`; add `classifyStatements`; export helpers |
| `src/utils/sqlValidator.test.ts` | rewrite for new behavior |
| `src/pages/sqlWorkbench/SqlWorkbench.tsx` | `runSql` split; confirm gate; `confirmSql` state + ConfirmDialog; loosen `handleSave`; table branch in `handlePickDbObject` |
| `src/pages/sqlWorkbench/DbObjectTree.tsx` | Tables section; widen `onSelect`; placeholder |
| `src/pages/sqlWorkbench/SqlWorkbench.test.tsx` | add confirm/table/multi-stmt tests |

## Risk / rollback

- Client validator is UI-only; loosening it cannot grant more than the backend already permits. Worst case if backend is open: a destructive statement runs on a tenant DB — mitigated by the confirm gate and the read/write badge in `ConnectionBar`.
- Purely additive on the tables side; no backend contract change.
- Rollback is a straight revert of the touched frontend files.
