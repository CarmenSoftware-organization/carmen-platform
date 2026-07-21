# Wire CharacterCountInput into BusinessUnitEdit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give five BusinessUnitEdit fields a live character counter by rendering `CharacterCountInput` inside `InlineField`'s edit mode, preserving edit-in-place and existing validation.

**Architecture:** Three small, additive changes on `feature/character-count-input`: (1) make `CharacterCountInput` embeddable (label optional + `ariaLabel`/`ariaRequired`/`autoFocus`); (2) teach `InlineField` to render `CharacterCountInput` in edit mode when a `maxLength` is given, wrapped in a div that keeps the existing commit-on-blur / revert-on-Escape; (3) pass `maxLength` to the five fields in `BusinessUnitDocument`.

**Tech Stack:** React 19 + TS, Tailwind, Vitest + React Testing Library + `@testing-library/user-event`.

## Global Constraints

- Branch `feature/character-count-input` (continues PR #54).
- Backward-compatible: existing `CharacterCountInput` callers pass `label` and none of the new props — do not break them. `label` becomes optional; the `<Label>` renders only when `label` is present.
- `CharacterCountInput` contributes **counter + warning color + hard cap only** here. **Never pass `minLength`** into it for these fields; real validation stays with `validateField` (`code`, `alias_name`) or stays absent (`description`, `hotel_name`, `company_name`).
- The embedded field MUST carry `aria-label={label}` — the existing `BusinessUnitDocument.test.tsx` `it.each` resolves each field via `getByLabelText(label)`; without the aria-label it throws.
- Do NOT modify shadcn primitives (`input.tsx`, `textarea.tsx`, `label.tsx`). Only `character-count-input.tsx`, `InlineField.tsx`, `BusinessUnitDocument.tsx` (+ their tests) change.
- Fields + limits: `code` 20, `alias_name` 3, `description` 500 (textarea), `hotel_name` 100, `company_name` 100.
- Tests: explicit `vitest` imports at top (no globals), RTL + `user-event`, assert behavior/roles/attributes — no snapshots.
- Run `bun run test -- <file>` per task; `bun run test` (full) + `bun run build` before finishing Task 3.

---

## Task 1: Make CharacterCountInput embeddable

Add optional `label`, plus `ariaLabel` / `ariaRequired` / `autoFocus`, so the primitive can live inside a host that owns its label, focus, and validation.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Produces: `CharacterCountInputProps` with `label?: string`, `ariaLabel?: string`, `ariaRequired?: boolean`, `autoFocus?: boolean`. When `label` is omitted, no `<Label>` renders and the field's accessible name comes from `aria-label` (= `ariaLabel`). `aria-required` and `autoFocus` land on the field via `sharedProps`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ui/character-count-input.test.tsx`:

```tsx
describe('CharacterCountInput - embeddable (no visible label)', () => {
  it('renders no <label> element when label is omitted, naming the field via aria-label', () => {
    render(<CharacterCountInput ariaLabel="Alias" value="" onChange={vi.fn()} maxLength={3} />);
    expect(document.querySelector('label')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Alias' })).toBeInTheDocument();
  });

  it('still renders a visible label when label is provided', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} />);
    expect(screen.getByText('Bio').tagName).toBe('LABEL');
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
  });

  it('focuses the field on mount when autoFocus is set', () => {
    render(<CharacterCountInput ariaLabel="Alias" value="" onChange={vi.fn()} autoFocus />);
    expect(screen.getByRole('textbox', { name: 'Alias' })).toHaveFocus();
  });

  it('marks the field required for assistive tech when ariaRequired', () => {
    render(<CharacterCountInput ariaLabel="Code" value="" onChange={vi.fn()} ariaRequired />);
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveAttribute('aria-required', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL at runtime (Vitest/esbuild strips types, so this is not a TS error). With no label handling and no `ariaLabel`/`autoFocus`/`ariaRequired` wired: the field has no accessible name → `getByRole('textbox', { name: 'Alias' })` throws; an empty `<label>` still renders → `querySelector('label')` is non-null; the field is not focused and has no `aria-required`.

- [ ] **Step 3: Implement**

In `src/components/ui/character-count-input.tsx`:

(a) Make `label` optional and add the three props in the interface (replace the interface body's field list start):

```tsx
export interface CharacterCountInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  multiline?: boolean;
  hardCap?: boolean;
  onValidChange?: (isValid: boolean, error?: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the field when no visible `label` is rendered. */
  ariaLabel?: string;
  /** Sets aria-required on the field (no visual change). */
  ariaRequired?: boolean;
  /** Focus the field on mount (edit-in-place hosts). */
  autoFocus?: boolean;
}
```

(b) Destructure the new props (add after `className,`):

```tsx
  className,
  ariaLabel,
  ariaRequired,
  autoFocus,
}: CharacterCountInputProps) {
```

(c) Extend `sharedProps` with `autoFocus`, `aria-label`, `aria-required` (add these three keys; leave the rest as-is):

```tsx
  const sharedProps = {
    id: fieldId,
    name,
    value,
    placeholder,
    disabled,
    autoFocus,
    onChange: handleChange,
    onBlur: () => setTouched(true),
    'aria-label': label ? undefined : ariaLabel,
    'aria-required': ariaRequired,
    'aria-invalid': showError,
    'aria-describedby': showError ? `${counterId} ${errorId}` : counterId,
    className: cn(
      'transition-colors',
      multiline ? 'resize-none pb-6' : 'pr-16',
      showError && 'border-destructive',
      className,
    ),
  };
```

(Note: `autoFocus` as an object property spread through `{...sharedProps}` is not flagged by `jsx-a11y/no-autofocus`, which only detects a literal JSX `autoFocus` attribute — so no eslint-disable is needed, and adding one would be an unused-directive error.)

(d) Render the `<Label>` only when `label` is present (replace the label line):

```tsx
    <div className="space-y-2">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <div className="relative">
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS — all previous tests (labelled usage) plus the four new embeddable tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): optional label + ariaLabel/ariaRequired/autoFocus for embedding"
```

---

## Task 2: Render CharacterCountInput in InlineField edit mode

When a `maxLength` is provided, `InlineField` renders `CharacterCountInput` (label-less) in edit mode, keeping commit-on-blur and revert-on-Escape via a wrapper.

**Files:**
- Modify: `src/pages/businessUnitEdit/InlineField.tsx`
- Test: `src/pages/businessUnitEdit/InlineField.test.tsx`

**Interfaces:**
- Consumes: `CharacterCountInput` from `../../components/ui/character-count-input`.
- Produces: `InlineFieldProps` gains `maxLength?: number`. In edit mode, `maxLength != null && type !== 'select'` renders the CharacterCountInput branch.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/businessUnitEdit/InlineField.test.tsx`:

```tsx
describe('InlineField (character count)', () => {
  const setupCC = (props: Partial<React.ComponentProps<typeof InlineField>> = {}) => {
    const onCommit = vi.fn();
    render(<InlineField name="alias" label="Alias" value="AB" maxLength={3} onCommit={onCommit} {...props} />);
    return { onCommit };
  };

  it('shows a character counter and focuses the field on open', async () => {
    const user = userEvent.setup();
    setupCC();
    await user.click(screen.getByRole('button', { name: /ab/i }));
    const field = screen.getByRole('textbox', { name: 'Alias' });
    expect(field).toHaveFocus();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('hard-caps typing at maxLength', async () => {
    const user = userEvent.setup();
    setupCC({ value: '' });
    await user.click(screen.getByRole('button', { name: /set alias/i }));
    const field = screen.getByRole('textbox', { name: 'Alias' });
    await user.type(field, 'ABCD');
    expect(field).toHaveValue('ABC');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('commits the changed value on blur', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupCC({ value: '' });
    await user.click(screen.getByRole('button', { name: /set alias/i }));
    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'XY');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('alias', 'XY');
  });

  it('reverts on Escape without committing', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupCC();
    await user.click(screen.getByRole('button', { name: /ab/i }));
    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'C{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /ab/i })).toBeInTheDocument();
  });

  it('shows the destructive border when a validateField error is present', async () => {
    const user = userEvent.setup();
    setupCC({ error: 'Bad' });
    await user.click(screen.getByRole('button', { name: /ab/i }));
    expect(screen.getByRole('textbox', { name: 'Alias' }).className).toContain('border-destructive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- InlineField`
Expected: FAIL — `maxLength` is not a prop and the edit mode still renders the raw `<input>` (no counter, no hard cap).

- [ ] **Step 3: Implement**

In `src/pages/businessUnitEdit/InlineField.tsx`:

(a) Add the import (below the existing imports):

```tsx
import { CharacterCountInput } from '../../components/ui/character-count-input';
```

(b) Add `maxLength?: number;` to `InlineFieldProps` (after `required?: boolean;`), and destructure `maxLength` in the function params (after `required,`).

(c) Add a `ccKeyDown` handler next to the existing `onKeyDown` (inside the component body):

```tsx
  // Same commit/revert semantics as onKeyDown, but the handler sits on the
  // wrapper div, so blur the event target (the field) rather than currentTarget.
  const ccKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };
```

(d) Insert the CharacterCountInput branch into the edit-mode ternary — between the `select` branch and the `textarea` branch. The edit chain becomes:

```tsx
        {editing ? (
          type === 'select' ? (
            <select
              /* ...unchanged select branch... */
            >
              {/* ...unchanged... */}
            </select>
          ) : maxLength != null ? (
            <div className="max-w-sm" onBlur={commit} onKeyDown={ccKeyDown}>
              <CharacterCountInput
                ariaLabel={label}
                ariaRequired={required}
                value={draft}
                onChange={setDraft}
                maxLength={maxLength}
                multiline={type === 'textarea'}
                autoFocus
                placeholder={promptText}
                className={cn(error ? 'border-destructive' : 'border-primary', mono && 'font-mono')}
              />
            </div>
          ) : type === 'textarea' ? (
            <textarea
              /* ...unchanged textarea branch... */
            />
          ) : (
            <input
              /* ...unchanged input branch... */
            />
          )
        ) : (
          <button
            /* ...unchanged read button... */
          />
        )}
```

Leave the `select`, `textarea`, `input`, and `button` branches exactly as they are — only the `maxLength != null` branch is new.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- InlineField`
Expected: PASS — the new character-count tests plus all existing InlineField tests (raw input/select paths unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/InlineField.tsx src/pages/businessUnitEdit/InlineField.test.tsx
git commit -m "feat(business-unit-edit): render CharacterCountInput in InlineField edit mode when maxLength is set"
```

---

## Task 3: Pass maxLength to the five BusinessUnitDocument fields

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx`
- Test: `src/pages/businessUnitEdit/BusinessUnitDocument.test.tsx`

**Interfaces:**
- Consumes: `InlineField`'s new `maxLength` prop.
- Produces: the `inline()` helper forwards `opts.maxLength`; five fields set it.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/businessUnitEdit/BusinessUnitDocument.test.tsx`:

```tsx
describe('BusinessUnitDocument - character counters', () => {
  it('shows a 0 / 500 counter when editing the description', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /^set description…$/i }));
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('shows a / 20 counter when editing the code', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /set code/i }));
    expect(screen.getByText('0 / 20')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- BusinessUnitDocument`
Expected: FAIL — no counter renders (fields have no `maxLength` yet).

- [ ] **Step 3: Implement**

In `src/pages/businessUnitEdit/BusinessUnitDocument.tsx`:

(a) Add `maxLength?: number;` to the `inline()` helper's `opts` type and forward it to `InlineField`:

```tsx
  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: {
      type?: 'text' | 'number' | 'email' | 'textarea' | 'select';
      options?: InlineOption[];
      mono?: boolean;
      validate?: boolean;
      required?: boolean;
      maxLength?: number;
    },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      options={opts?.options}
      mono={opts?.mono}
      required={opts?.required}
      maxLength={opts?.maxLength}
      error={fieldErrors[name]}
      disabled={!canEdit}
      onCommit={onCommit}
      onValidate={opts?.validate ? onValidate : undefined}
    />
  );
```

(b) Set `maxLength` on the five fields (edit these five `inline(...)` calls in place):

```tsx
          {inline('code', 'Code', { mono: true, validate: true, required: true, maxLength: 20 })}
          {inline('alias_name', 'Alias', { validate: true, maxLength: 3 })}
```
```tsx
          {inline('description', 'Description', { type: 'textarea', maxLength: 500 })}
```
```tsx
          {inline('hotel_name', 'Hotel name', { maxLength: 100 })}
```
```tsx
          {inline('company_name', 'Company', { maxLength: 100 })}
```

Leave every other `inline(...)` call unchanged.

- [ ] **Step 4: Run tests, full suite, and build**

Run: `bun run test -- BusinessUnitDocument`
Expected: PASS — the two new counter tests AND the existing `it.each(EDITABLE_FIELDS)` suite (which reaches `code`/`alias_name`/`description`/`hotel_name`/`company_name` via `getByLabelText(label)` — resolved by the `aria-label` wired in Task 1 — and commits `'12'` on tab).

Then:

```bash
bun run test
bun run build
```
Expected: full suite green; build succeeds with no type/unused-import errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/BusinessUnitDocument.tsx src/pages/businessUnitEdit/BusinessUnitDocument.test.tsx
git commit -m "feat(business-unit-edit): add character counters to code, alias, description, hotel/company name"
```

---

## Self-review (controller, after writing)

- **Spec coverage:** label-optional + ariaLabel/ariaRequired/autoFocus (Task 1); InlineField maxLength branch + commit/revert/focus/border (Task 2); five fields wired (Task 3). ✓
- **Type consistency:** `maxLength?: number` on both `InlineFieldProps` and the `inline()` opts; `ariaLabel`/`ariaRequired`/`autoFocus` names identical across component, InlineField call, and tests. ✓
- **Load-bearing risk:** the existing `BusinessUnitDocument` `it.each` depends on the embedded field exposing `aria-label={label}` (Task 1) — called out in Task 3 Step 4. ✓
- **No minLength** passed anywhere → no duplicate validation. ✓
