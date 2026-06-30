# Business Unit — Editable DB Connection Form

**Date:** 2026-06-30
**Status:** Approved (design)
**Scope:** `BusinessUnitEdit` → Database Connection section

## Problem

The Database Connection section on the Business Unit edit page
(`/business-units/:id/edit`) is **read-only**. `db_connection` is stored as a JSON
string in form state and rendered through `DbConnectionView` (masked key/value rows
with per-field reveal). Even in edit mode there is no way to change the connection
config — an admin must edit the raw JSON elsewhere.

Goal: let admins **edit** the connection config through a structured form instead of
raw JSON.

## Decisions (locked during brainstorming)

- **Form shape:** Hybrid — fixed inputs for known keys + dynamic key/value rows for
  the rest.
- **Known fields (display order fixed):** `host`, `port`, `database`, `schema`,
  `user`, `password`, `ssl`. (`user`, not `username`, per Prisma datasource style.)
- **`db_connection` is always a JSON object** in practice — no bare
  connection-string fallback UI is needed.
- **State representation (Approach A):** hold `db_connection` in form state as a
  structured array `{ key, value }[]` (mirrors the existing `config[]` pattern), so
  Edit/Cancel restore, the `useUnsavedChanges` dirty-check, and `doc_version`
  optimistic locking keep working with no special handling.

### Micro-decisions (defaults, confirmed)

1. `ssl` renders as a **checkbox** (boolean). If real data ever stores a string
   (e.g. `"require"`), revisit as a text/select.
2. `port` is serialized as a **number** on save (when numeric).
3. Extra rows are **plain text** in edit mode (not masked). Read-only view still
   masks via `DbConnectionView`.
4. Saved object key order follows array order (backend is order-insensitive).

## Data Model

`src/pages/businessUnitEdit/types.ts`:

```ts
export interface DbConnectionField {
  key: string;
  value: string; // always a string in state; coerced at save time
}
```

Change `BusinessUnitFormData`:

```ts
db_connection: string          →  db_connection: DbConnectionField[]
```

`initialFormData`:

```ts
db_connection: ''              →  db_connection: []
```

Known-field config (lives in the section component):

```ts
const KNOWN_DB_FIELDS = [
  { key: 'host',     label: 'Host',     type: 'text' },
  { key: 'port',     label: 'Port',     type: 'number' },
  { key: 'database', label: 'Database', type: 'text' },
  { key: 'schema',   label: 'Schema',   type: 'text' },
  { key: 'user',     label: 'User',     type: 'text' },
  { key: 'password', label: 'Password', type: 'password' }, // masked + reveal toggle
  { key: 'ssl',      label: 'SSL',      type: 'boolean' },  // checkbox
] as const;
```

The array holds **all** entries (known + extra). The known/extra split is a render
concern only: an entry whose `key` matches one of `KNOWN_DB_FIELDS` renders in its
fixed slot; everything else renders as an extra row.

## Helpers — `src/utils/dbConnection.ts`

Add next to the existing `parseDbConnection` (which stays for the read-only view):

```ts
// load: backend object → editable fields. Preserves backend insertion order.
// boolean/number values become display strings (true → "true", 5432 → "5432").
objectToDbFields(obj: unknown): DbConnectionField[]

// save: editable fields → object. Skips entries with empty key OR empty value.
// Coercion: port → Number (only if it parses to a finite number, else string);
//           ssl  → boolean ("true" → true, else false);
//           everything else → string as-is.
dbFieldsToObject(fields: DbConnectionField[]): Record<string, unknown>
```

- `objectToDbFields(null | undefined | non-object)` → `[]` (defensive; the data is
  always an object in practice).
- A `ssl` entry with value `"false"` coerces to boolean `false` and **is kept**
  (meaningful), but is dropped only if its value string is empty.

## Form UI — `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` (rewrite)

Wrapped in `CollapsibleSection title="Database Connection" forceOpen`.

### Edit mode

- **Known fields** — grid `lg:grid-cols-2` (matches Edit-page convention):
  - `host`, `database`, `schema`, `user` — `Input type="text"`
  - `port` — `Input type="number"` (inputmode numeric)
  - `password` — masked `Input`, with an Eye/EyeOff button toggling type
    `password`↔`text`; local `showPassword` state (reset on unmount, never persisted)
  - `ssl` — checkbox; checked ⇒ entry value `"true"`, unchecked ⇒ `"false"`
  - Each input reads its value from the array by key; editing calls
    `onDbFieldChange(key, value)` which upserts the entry.
- **Additional fields (extra)** — copy the `ConfigurationSection` pattern:
  - rows `[ key Input ] [ value Input ] [ 🗑 ]`, addressed by their index in the
    **full array** (map with index, then filter to non-known keys, keep original
    index)
  - `Add field` button (`Plus` icon) appends `{ key: '', value: '' }`
  - `🗑` removes by full-array index

### Read-only mode

- Render the existing `<DbConnectionView value={serialized} />`, where
  `serialized = JSON.stringify(dbFieldsToObject(formData.db_connection))`.
  `DbConnectionView` is **not modified** (its existing behavior/tests stay intact).

## Handlers — `src/pages/BusinessUnitEdit.tsx`

Mirror the existing `config` handlers:

```ts
handleDbFieldChange(key: string, value: string)            // upsert known field by key
handleDbExtraChange(index: number, field: 'key' | 'value', value: string)
addDbExtraRow()                                            // append { key:'', value:'' }
removeDbExtraRow(index: number)                            // remove by full-array index
```

- **load** (~line 149): `db_connection: objectToDbFields(bu.db_connection)`
- **buildPayload** (~line 249): replace the string `tryParseJson` branch with
  ```ts
  const dbObj = dbFieldsToObject(data.db_connection);
  if (Object.keys(dbObj).length > 0) payload.db_connection = dbObj;
  ```
  (omit `db_connection` entirely when empty — matches current behavior)
- **`hasDbConnection`** (~line 486): `formData.db_connection.length > 0`

Pass the new handlers to `DatabaseConnectionSection` via a props interface that
extends `SectionFieldProps` (same approach as `ConfigurationSection`).

## Validation (light, client-side)

- `port` must be numeric → inline `text-xs text-destructive` error when non-numeric.
- Extra row with a non-empty `value` must have a `key`.
- Extra-row `key` colliding with a known key → inline warning ("use the dedicated
  field above"). Non-blocking; the known slot wins on display.

These are light guards, not a full validation gate. No change to
`utils/validation.ts`.

## Tests

- `src/utils/dbConnection.test.ts`
  - `objectToDbFields` ↔ `dbFieldsToObject` round-trip
  - coercion: `port` → number, `ssl` → boolean
  - skips empty key / empty value; `objectToDbFields(null)` → `[]`
- `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`
  - renders the 7 known fields with loaded values
  - editing a known field calls `onDbFieldChange`
  - password reveal toggle flips input type
  - add / remove extra row
  - read-only mode masks sensitive values (via `DbConnectionView`)

Co-located, explicit `vitest` imports, behavior assertions (no snapshots), per the
repo testing conventions.

## Files Touched

| File | Change |
|------|--------|
| `src/pages/businessUnitEdit/types.ts` | `DbConnectionField` type; `db_connection` → `DbConnectionField[]`; `initialFormData` |
| `src/utils/dbConnection.ts` | add `objectToDbFields`, `dbFieldsToObject` |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` | rewrite to Hybrid edit form + read-only view |
| `src/pages/BusinessUnitEdit.tsx` | load mapping, `buildPayload`, `hasDbConnection`, 4 handlers, pass props |
| `src/utils/dbConnection.test.ts` | new |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` | new |

## Out of Scope / Non-goals

- No backend changes (write contract unchanged: `db_connection` is a JSON object).
- No bare connection-string editor.
- No masking of extra rows in edit mode.
- No `doc_version` changes (already handled at the page level).
