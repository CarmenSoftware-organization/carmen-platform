# Business Unit — Editable DB Connection Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only Database Connection section on the Business Unit edit page with an editable Hybrid form (fixed inputs for known keys + dynamic key/value rows for the rest).

**Architecture:** Hold `db_connection` in form state as a structured array `DbConnectionField[]` (mirrors the existing `config[]` pattern) so Edit/Cancel restore, the `useUnsavedChanges` dirty-check, and `doc_version` optimistic locking keep working unchanged. Two pure helpers convert between the backend object and the editable array. The known/extra split is purely a render concern in the section component.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + React Testing Library, shadcn/ui (Input/Label/Button), lucide-react icons.

## Global Constraints

- **No new dependencies** — use existing shadcn/ui primitives + lucide-react only.
- **Never modify `src/components/ui/`** primitives. `src/components/DbConnectionView.tsx` stays **unchanged**.
- **Known fields (fixed display order):** `host`, `port`, `database`, `schema`, `user`, `password`, `ssl`.
- **`port`** serializes to a **number** when numeric; **`ssl`** serializes to a **boolean**; everything else stays a string.
- **`db_connection` is omitted from the save payload entirely when empty** (matches current behavior).
- Tests: co-located `*.test.ts(x)` beside source, **explicit `vitest` imports** (no globals), assert behavior not snapshots.
- Spec: `docs/superpowers/specs/2026-06-30-business-unit-db-connection-form-design.md`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/utils/dbConnection.ts` | `DbConnectionField` type + `objectToDbFields` / `dbFieldsToObject` helpers (alongside existing `parseDbConnection`) | 1 |
| `src/utils/dbConnection.test.ts` | Unit tests for the two new helpers | 1 |
| `src/pages/businessUnitEdit/types.ts` | `db_connection` field type → `DbConnectionField[]`; `initialFormData` | 2 |
| `src/pages/BusinessUnitEdit.tsx` | load mapping, `buildPayload`, `hasDbConnection`, 4 handlers, pass props | 2, 3 |
| `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx` | thread the 4 new handler props to the section | 3 |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` | read-only serialize (T2) → Hybrid edit form (T3) → inline validation (T4) | 2, 3, 4 |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` | Component tests (edit form, validation) | 3, 4 |

> **Layering note:** `DbConnectionField` is defined in `src/utils/dbConnection.ts` (next to the helpers that produce/consume it) and **imported** by `businessUnitEdit/types.ts`. This keeps the shared util from depending on a page module.

---

## Task 1: DB connection conversion helpers

**Files:**
- Modify: `src/utils/dbConnection.ts` (append type + two functions)
- Test: `src/utils/dbConnection.test.ts` (create)

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces:
  - `interface DbConnectionField { key: string; value: string }`
  - `objectToDbFields(obj: unknown): DbConnectionField[]`
  - `dbFieldsToObject(fields: DbConnectionField[]): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dbConnection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { objectToDbFields, dbFieldsToObject } from './dbConnection';

describe('objectToDbFields', () => {
  it('maps an object to {key,value} string fields preserving order', () => {
    expect(objectToDbFields({ host: 'localhost', port: 5432, ssl: true })).toEqual([
      { key: 'host', value: 'localhost' },
      { key: 'port', value: '5432' },
      { key: 'ssl', value: 'true' },
    ]);
  });

  it('returns [] for null / undefined / non-object', () => {
    expect(objectToDbFields(null)).toEqual([]);
    expect(objectToDbFields(undefined)).toEqual([]);
    expect(objectToDbFields('conn-str')).toEqual([]);
    expect(objectToDbFields(['a'])).toEqual([]);
  });

  it('stringifies nested objects and renders null as empty string', () => {
    expect(objectToDbFields({ opts: { a: 1 }, x: null })).toEqual([
      { key: 'opts', value: '{"a":1}' },
      { key: 'x', value: '' },
    ]);
  });
});

describe('dbFieldsToObject', () => {
  it('coerces port to number and ssl to boolean', () => {
    expect(dbFieldsToObject([
      { key: 'host', value: 'localhost' },
      { key: 'port', value: '5432' },
      { key: 'ssl', value: 'true' },
    ])).toEqual({ host: 'localhost', port: 5432, ssl: true });
  });

  it('skips entries with empty key or empty value', () => {
    expect(dbFieldsToObject([
      { key: 'host', value: '' },
      { key: '', value: 'orphan' },
      { key: 'user', value: 'carmen' },
    ])).toEqual({ user: 'carmen' });
  });

  it('keeps ssl=false (non-empty) and leaves a non-numeric port as a string', () => {
    expect(dbFieldsToObject([
      { key: 'ssl', value: 'false' },
      { key: 'port', value: 'abc' },
    ])).toEqual({ ssl: false, port: 'abc' });
  });

  it('round-trips with objectToDbFields', () => {
    const obj = { host: 'db', port: 5432, user: 'u', password: 'p', ssl: true };
    expect(dbFieldsToObject(objectToDbFields(obj))).toEqual(obj);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/utils/dbConnection.test.ts`
Expected: FAIL — `objectToDbFields`/`dbFieldsToObject` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/dbConnection.ts` (keep everything already in the file):

```ts
export interface DbConnectionField {
  key: string;
  value: string; // always a string in form state; coerced at save time
}

/** Keys coerced away from string on save (case-insensitive). */
const NUMBER_KEYS = new Set(['port']);
const BOOLEAN_KEYS = new Set(['ssl']);

/**
 * Backend db_connection object -> editable {key,value} fields (display strings),
 * preserving the object's key order. null/undefined/non-object -> [] (defensive;
 * in practice the value is always an object).
 */
export const objectToDbFields = (obj: unknown): DbConnectionField[] => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
    key,
    value:
      value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
};

/**
 * Editable fields -> db_connection object. Skips entries with an empty key OR an
 * empty value. Coerces `port` to a number (when finite) and `ssl` to a boolean.
 */
export const dbFieldsToObject = (fields: DbConnectionField[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const { key, value } of fields) {
    const k = key.trim();
    if (!k || value === '') continue;
    const lower = k.toLowerCase();
    if (NUMBER_KEYS.has(lower)) {
      const n = Number(value);
      out[k] = Number.isFinite(n) ? n : value;
    } else if (BOOLEAN_KEYS.has(lower)) {
      out[k] = value === 'true';
    } else {
      out[k] = value;
    }
  }
  return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/utils/dbConnection.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/dbConnection.ts src/utils/dbConnection.test.ts
git commit -m "feat(bu): add db_connection object<->fields helpers"
```

---

## Task 2: Switch form state to `DbConnectionField[]` (refactor, behavior unchanged)

This is a representation refactor. After it, the section is still read-only — but
`db_connection` flows through state as an array. It must keep the build green and
the existing suite passing.

**Files:**
- Modify: `src/pages/businessUnitEdit/types.ts`
- Modify: `src/pages/BusinessUnitEdit.tsx` (load `~149`, buildPayload `~249-252`, `hasDbConnection` `~486`)
- Modify: `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx`

**Interfaces:**
- Consumes: `objectToDbFields`, `dbFieldsToObject`, `DbConnectionField` (Task 1).
- Produces: `BusinessUnitFormData.db_connection: DbConnectionField[]`.

- [ ] **Step 1: Update the form-data type**

In `src/pages/businessUnitEdit/types.ts`:

Add the import at the top (after the existing `import type { BusinessUnitConfig }` line):

```ts
import type { DbConnectionField } from '../../utils/dbConnection';
```

Change the field declaration in `BusinessUnitFormData`:

```ts
  // Config & Connection
  db_connection: DbConnectionField[];
  config: BusinessUnitConfig[];
```

Change the default in `initialFormData`:

```ts
  db_connection: [],
```

- [ ] **Step 2: Update load + save + flag in `BusinessUnitEdit.tsx`**

Add the import (next to the other `../utils` imports near the top):

```ts
import { objectToDbFields, dbFieldsToObject } from '../utils/dbConnection';
```

In `fetchBusinessUnit` (the `loaded` object, ~line 149) replace:

```ts
        db_connection: toJsonString(bu.db_connection, ''),
```

with:

```ts
        db_connection: objectToDbFields(bu.db_connection),
```

In `buildPayload` (~lines 249-252) replace:

```ts
    // Parse db_connection from JSON string to object
    if (data.db_connection) {
      payload.db_connection = tryParseJson(data.db_connection);
    }
```

with:

```ts
    // db_connection is held as editable fields; serialize back to an object.
    // Omit it entirely when empty (matches the other optional fields).
    const dbConnObj = dbFieldsToObject(data.db_connection);
    if (Object.keys(dbConnObj).length > 0) {
      payload.db_connection = dbConnObj;
    } else {
      delete payload.db_connection;
    }
```

> Note: the generic loop above `buildPayload` copies `data.db_connection` (an array)
> into `payload` first; the block above overwrites or deletes it. The `delete` is
> required because the array is truthy and would otherwise leak into the payload.

In the `TenantMigrationCard` render (~line 486) replace:

```ts
            hasDbConnection={!!formData.db_connection?.trim()}
```

with:

```ts
            hasDbConnection={formData.db_connection.length > 0}
```

- [ ] **Step 3: Update the section to serialize for the read-only view**

Replace the whole body of `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` with:

```tsx
import React from 'react';
import { Label } from '../../../components/ui/label';
import DbConnectionView from '../../../components/DbConnectionView';
import { dbFieldsToObject } from '../../../utils/dbConnection';
import { CollapsibleSection } from '../shared';
import type { SectionFieldProps } from '../types';

const DatabaseConnectionSection: React.FC<SectionFieldProps> = ({ formData }) => (
  <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)" forceOpen>
    <div className="space-y-2">
      <Label htmlFor="db_connection">Connection Config</Label>
      <DbConnectionView value={JSON.stringify(dbFieldsToObject(formData.db_connection))} />
    </div>
  </CollapsibleSection>
);

export default DatabaseConnectionSection;
```

- [ ] **Step 4: Typecheck + run the full suite (this task's verification)**

Run: `bunx vitest run`
Expected: PASS — entire existing suite still green (no test references the old string shape).

Run: `bun run build`
Expected: build succeeds with no TypeScript errors (confirms every `db_connection`
consumer was updated).

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/types.ts src/pages/BusinessUnitEdit.tsx src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx
git commit -m "refactor(bu): hold db_connection as editable fields array"
```

---

## Task 3: Hybrid edit form + handlers + props threading

Adds the actual editable form. Known fields render in fixed slots; remaining keys
render as add/remove extra rows. Read-only mode is unchanged from Task 2.

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx` (add 4 handlers; pass to `BusinessUnitFormFields`)
- Modify: `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx` (thread the 4 props)
- Modify: `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` (full edit form)
- Test: `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` (create)

**Interfaces:**
- Consumes: `DbConnectionField`, `dbFieldsToObject`, `SectionFieldProps`, `formData.db_connection`.
- Produces (handlers on the page, props on the section):
  - `onDbFieldChange(key: string, value: string): void`
  - `onDbExtraChange(index: number, field: 'key' | 'value', value: string): void`
  - `onAddDbExtraRow(): void`
  - `onRemoveDbExtraRow(index: number): void`

- [ ] **Step 1: Write the failing component test**

Create `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatabaseConnectionSection from './DatabaseConnectionSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

type DbProps = SectionFieldProps & {
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
};

const baseProps = (over: Partial<DbProps> = {}): DbProps => ({
  formData: {
    ...initialFormData,
    db_connection: [
      { key: 'host', value: 'localhost' },
      { key: 'password', value: 'secret' },
      { key: 'poolSize', value: '10' },
    ],
  },
  editing: true,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  onDbFieldChange: vi.fn(),
  onDbExtraChange: vi.fn(),
  onAddDbExtraRow: vi.fn(),
  onRemoveDbExtraRow: vi.fn(),
  ...over,
});

describe('DatabaseConnectionSection (edit mode)', () => {
  it('renders the known fields holding their loaded values', () => {
    render(<DatabaseConnectionSection {...baseProps()} />);
    expect(screen.getByLabelText('Host')).toHaveValue('localhost');
    expect(screen.getByLabelText('Port')).toHaveValue(null); // empty number input
    expect(screen.getByLabelText('User')).toHaveValue('');
  });

  it('calls onDbFieldChange when editing a known field', async () => {
    const user = userEvent.setup();
    const onDbFieldChange = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onDbFieldChange })} />);
    await user.type(screen.getByLabelText('Host'), 'X');
    expect(onDbFieldChange).toHaveBeenCalledWith('host', expect.any(String));
  });

  it('masks the password but reveals it on toggle', async () => {
    const user = userEvent.setup();
    render(<DatabaseConnectionSection {...baseProps()} />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /reveal password/i }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('renders unknown keys as extra rows and adds a row', async () => {
    const user = userEvent.setup();
    const onAddDbExtraRow = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onAddDbExtraRow })} />);
    expect(screen.getByDisplayValue('poolSize')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add field/i }));
    expect(onAddDbExtraRow).toHaveBeenCalled();
  });

  it('shows the masked read-only view when not editing', () => {
    render(<DatabaseConnectionSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('localhost')).toBeInTheDocument();
    expect(screen.queryByLabelText('Host')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`
Expected: FAIL — section has no edit form / no `Host` input / no reveal button.

- [ ] **Step 3: Implement the full edit form**

Replace the whole body of `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` with:

```tsx
import React, { useState } from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import DbConnectionView from '../../../components/DbConnectionView';
import { dbFieldsToObject } from '../../../utils/dbConnection';
import { CollapsibleSection } from '../shared';
import type { SectionFieldProps } from '../types';

const KNOWN_DB_FIELDS = [
  { key: 'host', label: 'Host', type: 'text' },
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'database', label: 'Database', type: 'text' },
  { key: 'schema', label: 'Schema', type: 'text' },
  { key: 'user', label: 'User', type: 'text' },
  { key: 'password', label: 'Password', type: 'password' },
  { key: 'ssl', label: 'SSL', type: 'boolean' },
] as const;

const KNOWN_KEYS: readonly string[] = KNOWN_DB_FIELDS.map((f) => f.key);

interface DatabaseConnectionSectionProps extends SectionFieldProps {
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
}

const DatabaseConnectionSection: React.FC<DatabaseConnectionSectionProps> = ({
  formData,
  editing,
  onDbFieldChange,
  onDbExtraChange,
  onAddDbExtraRow,
  onRemoveDbExtraRow,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const fields = formData.db_connection;
  const valueOf = (key: string) => fields.find((f) => f.key === key)?.value ?? '';
  const extras = fields
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !KNOWN_KEYS.includes(f.key));

  if (!editing) {
    return (
      <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)" forceOpen>
        <div className="space-y-2">
          <Label htmlFor="db_connection">Connection Config</Label>
          <DbConnectionView value={JSON.stringify(dbFieldsToObject(fields))} />
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Database Connection" description="Database connection configuration" forceOpen>
      <div className="space-y-4">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          {KNOWN_DB_FIELDS.map((field) => {
            if (field.type === 'boolean') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <label className="flex h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={valueOf(field.key) === 'true'}
                      onChange={(e) => onDbFieldChange(field.key, e.target.checked ? 'true' : 'false')}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-muted-foreground">Enabled</span>
                  </label>
                </div>
              );
            }
            if (field.type === 'password') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`db_${field.key}`}>{field.label}</Label>
                  <div className="relative">
                    <Input
                      id={`db_${field.key}`}
                      type={showPassword ? 'text' : 'password'}
                      value={valueOf(field.key)}
                      onChange={(e) => onDbFieldChange(field.key, e.target.value)}
                      placeholder={field.label}
                      className="pr-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-9 w-9"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Reveal password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`db_${field.key}`}>{field.label}</Label>
                <Input
                  id={`db_${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={valueOf(field.key)}
                  onChange={(e) => onDbFieldChange(field.key, e.target.value)}
                  placeholder={field.label}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-xs text-muted-foreground">Additional fields</Label>
          {extras.map(({ f, i }) => (
            <div key={i} className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input value={f.key} onChange={(e) => onDbExtraChange(i, 'key', e.target.value)} placeholder="Key" />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input value={f.value} onChange={(e) => onDbExtraChange(i, 'value', e.target.value)} placeholder="Value" />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemoveDbExtraRow(i)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={onAddDbExtraRow}>
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
};

export default DatabaseConnectionSection;
```

- [ ] **Step 4: Add the handlers in `BusinessUnitEdit.tsx`**

Insert these four handlers right after `removeConfigRow` (~line 217, before `buildPayload`):

```ts
  const handleDbFieldChange = (key: string, value: string) => {
    setFormData(prev => {
      const fields = [...prev.db_connection];
      const idx = fields.findIndex(f => f.key === key);
      if (idx >= 0) fields[idx] = { ...fields[idx], value };
      else fields.push({ key, value });
      return { ...prev, db_connection: fields };
    });
  };

  const handleDbExtraChange = (index: number, field: 'key' | 'value', value: string) => {
    setFormData(prev => {
      const fields = [...prev.db_connection];
      fields[index] = { ...fields[index], [field]: value };
      return { ...prev, db_connection: fields };
    });
  };

  const addDbExtraRow = () => {
    setFormData(prev => ({ ...prev, db_connection: [...prev.db_connection, { key: '', value: '' }] }));
  };

  const removeDbExtraRow = (index: number) => {
    setFormData(prev => ({ ...prev, db_connection: prev.db_connection.filter((_, i) => i !== index) }));
  };
```

- [ ] **Step 5: Thread the props through `BusinessUnitFormFields.tsx`**

Add to `BusinessUnitFormFieldsProps` (after `onRemoveConfigRow`):

```ts
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
```

Add them to the destructured params (after `onRemoveConfigRow,`):

```ts
  onDbFieldChange,
  onDbExtraChange,
  onAddDbExtraRow,
  onRemoveDbExtraRow,
```

Replace the `DatabaseConnectionSection` render (Section 9) with:

```tsx
    {/* Section 9: Database Connection */}
    <DatabaseConnectionSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onDbFieldChange={onDbFieldChange}
      onDbExtraChange={onDbExtraChange}
      onAddDbExtraRow={onAddDbExtraRow}
      onRemoveDbExtraRow={onRemoveDbExtraRow}
    />
```

- [ ] **Step 6: Pass the handlers from `BusinessUnitEdit.tsx` into `BusinessUnitFormFields`**

In the `<BusinessUnitFormFields ... />` render (~line 469), after `onRemoveConfigRow={removeConfigRow}` add:

```tsx
          onDbFieldChange={handleDbFieldChange}
          onDbExtraChange={handleDbExtraChange}
          onAddDbExtraRow={addDbExtraRow}
          onRemoveDbExtraRow={removeDbExtraRow}
```

- [ ] **Step 7: Run the section test + full suite**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`
Expected: PASS (all 5 cases green).

Run: `bunx vitest run`
Expected: PASS (whole suite green).

Run: `bun run build`
Expected: build succeeds (props wired through with no TS errors).

- [ ] **Step 8: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx src/pages/businessUnitEdit/BusinessUnitFormFields.tsx src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx
git commit -m "feat(bu): editable hybrid db_connection form"
```

---

## Task 4: Inline validation (light, non-blocking)

Adds derived, render-time validation messages. No state plumbing, no save gate —
`dbFieldsToObject` already drops empties and falls back gracefully.

**Files:**
- Modify: `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx`
- Test: `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` (extend)

**Interfaces:**
- Consumes: `KNOWN_KEYS`, `valueOf`, `extras` (already defined in Task 3).
- Produces: no new exports (internal UI only).

- [ ] **Step 1: Write the failing tests (append to the existing describe block)**

Append these cases inside the existing `describe('DatabaseConnectionSection (edit mode)', ...)` in `DatabaseConnectionSection.test.tsx`:

```tsx
  it('warns when port is non-numeric', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: 'port', value: 'abc' }] },
    })} />);
    expect(screen.getByText(/port must be a number/i)).toBeInTheDocument();
  });

  it('does not warn for a numeric port', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: 'port', value: '5432' }] },
    })} />);
    expect(screen.queryByText(/port must be a number/i)).not.toBeInTheDocument();
  });

  it('warns when an extra row has a value but no key', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: '', value: 'orphan' }] },
    })} />);
    expect(screen.getByText(/key is required/i)).toBeInTheDocument();
  });
```

> **Scope note (collision):** the spec listed a "key collides with a known field"
> warning, but it is **architecturally unreachable** — any entry whose key exactly
> equals a known key is filtered OUT of `extras` (Task 3's `filter`), so an extra
> row can never display a known key. Per YAGNI it is **not implemented** and has no
> test. (A different-cased key like `Host` is genuinely a distinct extra key and is
> intended to be editable as-is, not flagged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`
Expected: FAIL — no validation messages rendered yet.

- [ ] **Step 3: Add the validation UI**

In `DatabaseConnectionSection.tsx`, add a helper above the `return` for the
known `port` field error and render messages.

First, just below `const extras = ...`, add the port-validity derivation:

```tsx
  const portValue = valueOf('port');
  const portInvalid = portValue !== '' && !Number.isFinite(Number(portValue));
```

In the known-fields `.map`, for the **non-boolean, non-password** branch (the final
`return`), add a port error line after the `<Input ... />`:

```tsx
              <Input
                id={`db_${field.key}`}
                type={field.type === 'number' ? 'number' : 'text'}
                value={valueOf(field.key)}
                onChange={(e) => onDbFieldChange(field.key, e.target.value)}
                placeholder={field.label}
              />
              {field.key === 'port' && portInvalid && (
                <p className="text-xs text-destructive">Port must be a number.</p>
              )}
```

In the extra-rows `.map`, after the value `<Input />` column add per-row messages.
Replace the value column `<div className="space-y-2">...</div>` with:

```tsx
              <div className="space-y-2">
                <Label>Value</Label>
                <Input value={f.value} onChange={(e) => onDbExtraChange(i, 'value', e.target.value)} placeholder="Value" />
                {f.value.trim() !== '' && f.key.trim() === '' && (
                  <p className="text-xs text-destructive">Key is required.</p>
                )}
              </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`
Expected: PASS — port-invalid warning shows, numeric port shows none, empty-key
warning shows.

- [ ] **Step 5: Run the full suite + build**

Run: `bunx vitest run`
Expected: PASS (whole suite green).

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx
git commit -m "feat(bu): inline validation for db_connection form"
```

---

## Final Verification (after all tasks)

- [ ] `bunx vitest run` — full unit/component suite green.
- [ ] `bun run build` — production build succeeds (no TS/ESLint errors; `CI=true bun run build` to treat warnings as errors).
- [ ] Manual smoke (`bun start`, open `/business-units/:id/edit`):
  - Read-only: known + extra keys shown, password masked with reveal.
  - Edit: change `host`/`port`, toggle `ssl`, edit `password`, add/remove an extra row → Save → reload shows persisted values.
  - Cancel after edits restores the loaded values (savedFormData restore).
  - Non-numeric `port` shows the inline warning.

## Self-Review Notes

- **Spec coverage:** data model (T1/T2), helpers (T1), Hybrid form known+extra (T3), password reveal (T3), read-only `DbConnectionView` untouched (T2/T3), load/save/`hasDbConnection` (T2), validation (T4), tests (T1/T3/T4) — all mapped.
- **Type consistency:** `DbConnectionField {key,value}`, `objectToDbFields`/`dbFieldsToObject`, and the four handler signatures are identical across `dbConnection.ts`, `types.ts`, the page, `BusinessUnitFormFields`, and the section.
- **Known deviations from spec:** (1) `DbConnectionField` lives in `utils/dbConnection.ts` (not `businessUnitEdit/types.ts`) to avoid a shared-util→page dependency; `types.ts` imports it. (2) The spec's "extra-row key collides with a known key" warning is **dropped** (YAGNI): it is unreachable because exact known keys are filtered out of the extra rows by construction, so the branch could never render.
