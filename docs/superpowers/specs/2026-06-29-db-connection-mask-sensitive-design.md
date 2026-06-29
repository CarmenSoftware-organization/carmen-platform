# Mask sensitive data in the Database Connection card

**Date:** 2026-06-29
**Status:** Approved (design)
**Page:** `src/pages/BusinessUnitEdit.tsx` — "Database Connection" section

## Problem

The "Database Connection" section of the BU edit page currently dumps the entire
`db_connection` JSON into a read-only `<pre>` block, unredacted. If a tenant
config carries credentials (`username`, `password`, connection-string URLs, …),
they are shown in full to anyone who opens the page and to anyone glancing at the
screen. We want to mask sensitive values by default while keeping the field's
non-sensitive parts useful.

### Security caveat (load-bearing — keep in mind, do not over-claim)

This is a **UI / shoulder-surfing measure, not a security boundary.** The full
`db_connection` value still arrives in the `GET /api-system/business-units/:id`
response and is therefore visible in browser devtools and in the dev-only debug
Sheet. Masking the card prevents casual on-screen exposure; it does **not** redact
the secret from a determined viewer. The real fix for that would be backend
redaction, which is out of scope here.

## Current behavior (what we're replacing)

`BusinessUnitEdit.tsx` (~line 1469):
```tsx
<CollapsibleSection title="Database Connection" description="…(JSON)" forceOpen>
  <div className="space-y-2">
    <Label htmlFor="db_connection">Connection Config</Label>
    <pre …>{formData.db_connection ? prettyJson : '-'}</pre>
  </div>
</CollapsibleSection>
```
`db_connection`:
- Is loaded into `formData.db_connection` as a JSON **string** (`toJsonString`).
- Is **not editable** in the UI (always a read-only display, even in edit mode).
- Is parsed back to an object and included in the save payload (`tryParseJson`).

Swagger models it as an open/arbitrary object (`x-nestjs_zod-empty-type`); the
sample value is `{"host":"tenant-db.internal","port":5432,"schema":"cbr_prod"}`,
but real configs may contain credential-bearing keys.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Display format | Structured key/value rows (replaces the raw-JSON `<pre>`) |
| What to mask | **Default-deny**: show only keys in a safe allowlist; mask everything else |
| Reveal | Per-field reveal toggle, available to **anyone with edit access** (= anyone who can open this page) |

## Design

### Masking strategy — default-deny allowlist

A value renders in plain text **only if its key is in the safe allowlist**
(case-insensitive). Every other key is masked. This fails safe: an unexpected
secret-bearing key in an arbitrary config object is hidden by default.

```ts
// src/utils/dbConnection.ts
export const SAFE_DB_CONNECTION_KEYS = [
  'host', 'hostname', 'port', 'schema', 'database', 'db',
  'dialect', 'type', 'ssl', 'sslmode',
];
```
Tight on purpose; trivially extended in this one place. Anything credential-like
(`user`, `username`, `password`, `pass`, `secret`, `token`, `key`, `url`, `uri`,
`dsn`, `connectionString`, …) is **not** listed and is therefore masked.

### Util — `src/utils/dbConnection.ts` (new, pure)

```ts
export interface DbConnectionEntry {
  key: string;
  value: string;       // pre-stringified display value (objects → JSON)
  sensitive: boolean;  // !isSafeKey(key)
}
export type ParsedDbConnection =
  | { ok: true; entries: DbConnectionEntry[] }
  | { ok: false; raw: string };   // unparseable / non-object → mask whole value

export const isSafeKey = (key: string): boolean =>
  SAFE_DB_CONNECTION_KEYS.includes(key.trim().toLowerCase());

export function parseDbConnection(raw: string): ParsedDbConnection;
```

`parseDbConnection` behavior:
- Empty / whitespace `raw` → `{ ok: true, entries: [] }` (card shows `-`).
- `JSON.parse(raw)` yields a **plain object** → map each entry: stringify the
  value (objects/arrays via `JSON.stringify`, primitives via `String`), set
  `sensitive = !isSafeKey(key)`.
- Parse fails, or parses to a non-object (string/number/array, e.g. a bare
  connection string) → `{ ok: false, raw }`. The whole value is treated as
  sensitive (a connection string typically embeds credentials).

Pure and dependency-free → unit-testable when Vitest lands (a pending project item).

### Component — `src/components/DbConnectionView.tsx` (new, presentational)

Props: `{ value: string }` (the raw `formData.db_connection` string).
Local state: `revealed: Record<string, boolean>` keyed by entry key (and a single
`rawRevealed: boolean` for the `ok: false` fallback). Reveal state is **local
only** — it resets on unmount/navigation and is never persisted.

Render:
- `ok: true, entries: []` → muted `-` (matches today's empty rendering).
- `ok: true, entries: [...]` → a two-column definition-list / borderless table:
  - **Key** column: `text-xs font-medium text-muted-foreground`.
  - **Value** column: `text-sm font-mono`.
    - Non-sensitive → value shown as-is.
    - Sensitive → `••••••••` (fixed 8 dots, independent of real length) plus a
      `size="icon"` ghost button with `Eye` / `EyeOff` (`h-4 w-4`) toggling
      `revealed[key]`; revealed shows the real (stringified) value in `font-mono`.
- `ok: false` → single masked row labeled "Connection string" → `••••••••` with the
  same reveal toggle; revealed shows `raw`.

Always read-only regardless of the page's `editing` flag (consistent with today —
`db_connection` is not editable here). The reveal toggle works in both view and
edit mode.

### Reveal access

The `/business-units/:id/edit` route already requires `cluster.update`, so
everyone who can open this page has edit access. Therefore the reveal toggle is
**always rendered** on this page — no additional permission prop is needed. (If
this component is ever reused on a less-privileged surface, gate it with a
`canReveal` prop then; not now — YAGNI.)

### Wiring into `BusinessUnitEdit.tsx`

Inside the existing "Database Connection" `CollapsibleSection`, replace the
`<pre>` block with:
```tsx
<Label>Connection Config</Label>
<DbConnectionView value={formData.db_connection} />
```
No change to how `db_connection` is loaded, stored, or saved. `formData.db_connection`
remains the untouched source of truth and round-trips on save exactly as before —
`DbConnectionView` only reads it.

## Round-trip safety (must hold)

`DbConnectionView` never mutates `formData`. The save payload still derives from
`formData.db_connection` (parsed via the existing `tryParseJson`). Masking and
reveal are display concerns only — a save after viewing (revealed or not) sends
the identical `db_connection` it loaded.

## Non-goals (YAGNI)

- Editing `db_connection` (stays read-only).
- Copy-to-clipboard on revealed values.
- A "reveal all" card-level toggle (per-field only).
- Redacting the dev-only debug Sheet (stripped from prod builds; value is in the
  API response regardless).
- Backend redaction of `db_connection`.
- Parsing/splitting credentials out of connection-string URLs (default-deny masks
  the whole string instead).

## Verification

Manual on the BU edit page:
1. A BU whose `db_connection` is `{host, port, schema, username, password}` →
   host/port/schema show in plain text; username/password show `••••••••` with a
   reveal toggle.
2. Click reveal on a field → real value appears; navigate away and back → re-masked.
3. A BU with a non-object / bare connection-string `db_connection` → one masked
   "Connection string" row with a reveal toggle.
4. A BU with empty `db_connection` → shows `-`.
5. Edit the BU and Save without touching the connection → the saved `db_connection`
   is byte-for-byte what was loaded (round-trip unaffected).

No automated tests (Vitest setup still pending); the util is written pure so it can
be covered later.
