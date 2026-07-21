# CharacterCountInput Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, controlled `CharacterCountInput` primitive with a live character count and Zod validation that works identically as an `<input>` or a `<textarea>`.

**Architecture:** One focused component file in `src/components/ui/`, built up test-first across six tasks. Validity is computed from a memoized Zod schema against the `value` prop; visual state (counter color) is derived by a small pure helper; the error border/message are gated behind first blur. Both variants share one change handler, one validation path, and one `touched` flag.

**Tech Stack:** React 19 + TypeScript, Zod, Tailwind + shadcn primitives (`Input`, `Textarea`, `Label`), Vitest + React Testing Library.

## Global Constraints

- Component lives at `src/components/ui/character-count-input.tsx`; test co-located at `src/components/ui/character-count-input.test.tsx`. Kebab-case filename.
- Styling is **Tailwind + HSL tokens only** — no `.css` file. Use `--warning` (`text-warning`), `--destructive` (`text-destructive`/`border-destructive`), `--muted-foreground`, `--input`, `--ring`.
- New dependency **`zod` `^3`** is permitted (explicitly approved). No other new libraries.
- Do **not** modify `src/components/ui/` existing primitives (`input.tsx`, `textarea.tsx`, `label.tsx`).
- Tests: explicit `vitest` imports (no globals), RTL, assert behavior/roles/attributes — no snapshots.
- Length is counted with `String.length` (UTF-16 code units) — same unit as Zod `.max()`.
- Counter color precedence: error (`len > maxLength`) > warning (`len >= ceil(maxLength*0.9)`) > normal. Under-min never colors the counter.
- Error message + red border appear only after first blur (`touched && !isValid`). Counter value and color update in real time.
- `hardCap` default `true`. `maxLength` default `200`, `minLength` default `0`.
- Run `bun run test` (Vitest, one-shot) to verify; `bun run build` before finishing to catch unused imports / type errors.

---

## Setup (do once, before Task 1)

- [ ] **Create feature branch**

```bash
git checkout -b feature/character-count-input
```

- [ ] **Install Zod**

```bash
bun add zod@^3    # npm fallback: npm i zod@^3 --legacy-peer-deps
```

Expected: `package.json` `dependencies` gains a `"zod": "^3.x"` entry; lockfile updated.

- [ ] **Commit the approved design doc, this plan, and the dependency**

```bash
git add docs/superpowers/specs/2026-07-20-character-count-input-design.md \
        docs/superpowers/plans/2026-07-20-character-count-input.md \
        package.json bun.lock
git commit -m "chore(character-count-input): add spec, plan, and zod dependency"
```

(If the lockfile is `package-lock.json`, stage that instead of `bun.lock`.)

---

## Task 1: Scaffold — label, input, live counter

Renders the field and a counter that reflects `value.length`. No validation, colors, hard-cap, or multiline yet.

**Files:**
- Create: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Consumes: `Input` (`./input`), `Label` (`./label`), `cn` (`../../lib/utils`).
- Produces: `CharacterCountInput` (named + default export) and `CharacterCountInputProps`. Counter node has `id={`${fieldId}-counter`}` and text `` `${len} / ${maxLength}` ``.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/character-count-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterCountInput } from './character-count-input';

describe('CharacterCountInput — scaffold', () => {
  it('associates the label with a single-line text input', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} />);
    const field = screen.getByLabelText('Bio');
    expect(field).toBeInTheDocument();
    expect(field.tagName).toBe('INPUT');
  });

  it('shows the counter as `current / max` using the default max of 200', () => {
    render(<CharacterCountInput label="Bio" value="hello" onChange={vi.fn()} />);
    expect(screen.getByText('5 / 200')).toBeInTheDocument();
  });

  it('honors a custom maxLength in the counter', () => {
    render(
      <CharacterCountInput label="Bio" value="hi" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — cannot resolve `./character-count-input`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ui/character-count-input.tsx`:

```tsx
import { useId } from 'react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '../../lib/utils';

export interface CharacterCountInputProps {
  label: string;
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
}

export function CharacterCountInput({
  label,
  value,
  onChange,
  maxLength = 200,
  placeholder,
  id,
  name,
  disabled,
  className,
}: CharacterCountInputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const counterId = `${fieldId}-counter`;
  const len = value.length;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={counterId}
          className={cn('pr-16', className)}
        />
        <span
          id={counterId}
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
        >
          {len} / {maxLength}
        </span>
      </div>
    </div>
  );
}

export default CharacterCountInput;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): scaffold field with live counter"
```

---

## Task 2: Counter color states (`deriveCounterState`)

Add a pure helper that maps length to `normal | warning | error`, and color the counter from it in real time.

> **Learning-mode note (execution only):** the executor should ask the user to author `deriveCounterState` (~8 lines) before revealing the reference below. The reference is the acceptance target — the user's version must pass the Step-1 tests.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Produces: `deriveCounterState(len: number, warnAt: number, maxLength: number): CounterState` and `type CounterState = 'normal' | 'warning' | 'error'` (both exported). `warnAt = Math.ceil(maxLength * 0.9)`.

- [ ] **Step 1: Write the failing tests**

Append to `character-count-input.test.tsx`:

```tsx
import { deriveCounterState } from './character-count-input';

describe('deriveCounterState', () => {
  it('is normal below the warning threshold', () => {
    expect(deriveCounterState(5, 9, 10)).toBe('normal');
  });
  it('is warning at/above the threshold and up to max', () => {
    expect(deriveCounterState(9, 9, 10)).toBe('warning');
    expect(deriveCounterState(10, 9, 10)).toBe('warning');
  });
  it('is error above max (over-max wins over warning)', () => {
    expect(deriveCounterState(11, 9, 10)).toBe('error');
  });
});

describe('CharacterCountInput — counter color', () => {
  it('shows amber (text-warning) within 10% of the limit', () => {
    render(
      <CharacterCountInput label="Bio" value="123456789" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');
  });

  it('shows neutral (text-muted-foreground) well below the limit', () => {
    render(
      <CharacterCountInput label="Bio" value="12345678" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('8 / 10')).toHaveClass('text-muted-foreground');
  });

  it('shows red (text-destructive) when the value is over max', () => {
    render(
      <CharacterCountInput label="Bio" value={'x'.repeat(11)} onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('11 / 10')).toHaveClass('text-destructive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — `deriveCounterState` is not exported; color classes not applied.

- [ ] **Step 3: Implement**

In `character-count-input.tsx`, add above the props interface:

```tsx
export type CounterState = 'normal' | 'warning' | 'error';

export function deriveCounterState(
  len: number,
  warnAt: number,
  maxLength: number,
): CounterState {
  if (len > maxLength) return 'error';
  if (len >= warnAt) return 'warning';
  return 'normal';
}

const counterColor: Record<CounterState, string> = {
  normal: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
};
```

Inside the component, after `const len = value.length;` add:

```tsx
  const warnAt = Math.ceil(maxLength * 0.9);
  const counterState = deriveCounterState(len, warnAt, maxLength);
```

Replace the counter `<span>`'s static `className` with a `cn(...)` that appends the state color:

```tsx
        <span
          id={counterId}
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors',
            counterColor[counterState],
          )}
        >
          {len} / {maxLength}
        </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): color the counter by state"
```

---

## Task 3: Hard cap typing past maxLength

Block user input beyond `maxLength` when `hardCap` (default true); still allow an over-limit `value` supplied by the parent.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Produces: a `handleChange` that ignores changes whose next length `> maxLength` when `hardCap` is true.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```tsx
import { fireEvent } from '@testing-library/react';

describe('CharacterCountInput — hard cap', () => {
  it('blocks a change that would exceed maxLength (default hardCap)', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Code" value="12345" onChange={onChange} maxLength={5} />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows a change within maxLength', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Code" value="123" onChange={onChange} maxLength={5} />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234' } });
    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('allows exceeding when hardCap is false', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput
        label="Code"
        value="12345"
        onChange={onChange}
        maxLength={5}
        hardCap={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    expect(onChange).toHaveBeenCalledWith('123456');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — the first test fails because `onChange` still fires on over-limit input.

- [ ] **Step 3: Implement**

Add `hardCap = true` to the destructured props. Add a `ChangeEvent` type import and a `handleChange` function:

```tsx
import { useId, type ChangeEvent } from 'react';
```

Inside the component (after `counterState`):

```tsx
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (hardCap && next.length > maxLength) return;
    onChange(next);
  };
```

Replace the `Input`'s `onChange={(e) => onChange(e.target.value)}` with `onChange={handleChange}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): hard-cap input at maxLength"
```

---

## Task 4: Zod validation, blur-gated error, a11y

Validate with a memoized Zod schema; show the error border + message only after blur; wire `aria-invalid`/`aria-describedby`.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Consumes: `z` from `zod`.
- Produces: `schema = z.string().min(minLength).max(maxLength)`; `isValid`/`error` from `safeParse`; `showError = touched && !isValid`; error `<p>` with `id={`${fieldId}-error`}` and `role="alert"`.

- [ ] **Step 1: Write the failing tests**

Append:

```tsx
describe('CharacterCountInput — validation & a11y', () => {
  it('does not show an error while typing (before blur)', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows the Zod min-length error after blur', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} />,
    );
    const field = screen.getByLabelText('Bio');
    fireEvent.blur(field);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/at least/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveClass('border-destructive');
  });

  it('links the field to the error node via aria-describedby after blur', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} id="bio" />,
    );
    const field = screen.getByLabelText('Bio');
    fireEvent.blur(field);
    expect(field.getAttribute('aria-describedby')).toContain('bio-error');
    expect(field.getAttribute('aria-describedby')).toContain('bio-counter');
  });

  it('reports an over-max error for an externally supplied value', () => {
    render(
      <CharacterCountInput label="Bio" value={'x'.repeat(11)} onChange={vi.fn()} maxLength={10} />,
    );
    fireEvent.blur(screen.getByLabelText('Bio'));
    expect(screen.getByRole('alert').textContent).toMatch(/at most/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — no `alert`, `aria-invalid` absent/unmanaged, no `border-destructive`.

- [ ] **Step 3: Implement**

Add imports and `useState`/`useMemo`:

```tsx
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { z } from 'zod';
```

Add `minLength = 0` to the destructured props. Inside the component, near the top of the body:

```tsx
  const errorId = `${fieldId}-error`;
  const [touched, setTouched] = useState(false);

  const schema = useMemo(
    () => z.string().min(minLength).max(maxLength),
    [minLength, maxLength],
  );
  const result = schema.safeParse(value);
  const isValid = result.success;
  const error = result.success ? undefined : result.error.issues[0].message;
```

After `counterState`, add:

```tsx
  const showError = touched && !isValid;
```

Update the `Input` element: add `onBlur`, `aria-invalid`, dynamic `aria-describedby`, and the error border:

```tsx
        <Input
          id={fieldId}
          name={name}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          aria-describedby={showError ? `${counterId} ${errorId}` : counterId}
          className={cn('pr-16', showError && 'border-destructive', className)}
        />
```

After the counter `<span>`'s wrapping `</div>`, add the error paragraph:

```tsx
      {showError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): zod validation with blur-gated error and a11y"
```

---

## Task 5: `onValidChange` callback

Notify the parent of validity so it can gate submit.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Produces: a `useEffect` keyed on `[isValid, error, onValidChange]` that calls `onValidChange?.(isValid, error)`.

- [ ] **Step 1: Write the failing tests**

Append:

```tsx
describe('CharacterCountInput — onValidChange', () => {
  it('reports invalid on mount and valid after the value satisfies the bounds', () => {
    const onValidChange = vi.fn();
    const { rerender } = render(
      <CharacterCountInput
        label="Bio" value="ab" onChange={vi.fn()} minLength={3} onValidChange={onValidChange}
      />,
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false, expect.any(String));

    rerender(
      <CharacterCountInput
        label="Bio" value="abc" onChange={vi.fn()} minLength={3} onValidChange={onValidChange}
      />,
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true, undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — `onValidChange` is never called.

- [ ] **Step 3: Implement**

Add `useEffect` to the React import and `onValidChange` to the destructured props:

```tsx
import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
```

After the `error` computation, add:

```tsx
  // Redundant calls with an unchanged value are harmless (React bails on an
  // identical setState); parents doing expensive work should memoize onValidChange.
  useEffect(() => {
    onValidChange?.(isValid, error);
  }, [isValid, error, onValidChange]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): surface validity via onValidChange"
```

---

## Task 6: Multiline (`<textarea>`) variant + usage doc

Render a `<textarea>` when `multiline`, sharing every behavior; place the counter bottom-right and disable resize. Add the usage doc comment.

**Files:**
- Modify: `src/components/ui/character-count-input.tsx`
- Test: `src/components/ui/character-count-input.test.tsx`

**Interfaces:**
- Consumes: `Textarea` (`./textarea`).
- Produces: a `sharedProps` object spread onto either `Textarea` or `Input`; textarea field class includes `resize-none pb-6`, counter class switches to `bottom-2 right-3`.

- [ ] **Step 1: Write the failing tests**

Append:

```tsx
describe('CharacterCountInput — multiline', () => {
  it('renders a textarea when multiline', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} multiline />);
    const field = screen.getByLabelText('Bio');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveClass('resize-none');
  });

  it('applies the hard cap on the textarea too', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Bio" value="12345" onChange={onChange} maxLength={5} multiline />,
    );
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '123456' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies warning color and blur-gated error on the textarea', () => {
    render(
      <CharacterCountInput label="Bio" value="123456789" onChange={vi.fn()} maxLength={10} multiline />,
    );
    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');

    render(
      <CharacterCountInput label="Note" value="hey" onChange={vi.fn()} minLength={10} multiline />,
    );
    const field = screen.getByLabelText('Note');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(field);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- character-count-input`
Expected: FAIL — multiline still renders an `<input>`.

- [ ] **Step 3: Implement**

Add the `Textarea` import:

```tsx
import { Textarea } from './textarea';
```

Add `multiline = false` to the destructured props. Replace the field markup (the `Input` element and the counter `<span>`) with the shared-props form. The full component body from `handleChange` onward becomes:

```tsx
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (hardCap && next.length > maxLength) return;
    onChange(next);
  };

  const sharedProps = {
    id: fieldId,
    name,
    value,
    placeholder,
    disabled,
    onChange: handleChange,
    onBlur: () => setTouched(true),
    'aria-invalid': showError,
    'aria-describedby': showError ? `${counterId} ${errorId}` : counterId,
    className: cn(
      multiline ? 'resize-none pb-6' : 'pr-16',
      showError && 'border-destructive',
      className,
    ),
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        {multiline ? (
          <Textarea {...sharedProps} />
        ) : (
          <Input type="text" {...sharedProps} />
        )}
        <span
          id={counterId}
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute text-xs transition-colors',
            multiline ? 'bottom-2 right-3' : 'right-3 top-1/2 -translate-y-1/2',
            counterColor[counterState],
          )}
        >
          {len} / {maxLength}
        </span>
      </div>
      {showError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
```

Add the usage doc comment at the very top of the file (above the imports) — see the Appendix for the full final file including this comment.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- character-count-input`
Expected: PASS (all tasks' tests).

- [ ] **Step 5: Build check + commit**

```bash
bun run build
```

Expected: build succeeds with no TS/unused-import errors. Then:

```bash
git add src/components/ui/character-count-input.tsx src/components/ui/character-count-input.test.tsx
git commit -m "feat(character-count-input): add multiline textarea variant and usage doc"
```

---

## Appendix: Final `character-count-input.tsx` (authoritative)

```tsx
/**
 * CharacterCountInput — a controlled text field with a live character count and
 * Zod validation. Renders an <input> or a <textarea> (multiline); the counter
 * and warning color update in real time, while the error border + message
 * appear only after the first blur while the value is invalid. Surface validity
 * to a parent via onValidChange to gate submit.
 *
 * @example
 * const [bio, setBio] = useState('');
 * const [valid, setValid] = useState(false);
 * <form onSubmit={handleSubmit}>
 *   <CharacterCountInput
 *     label="Bio" value={bio} onChange={setBio}
 *     minLength={10} maxLength={200} multiline
 *     onValidChange={(ok) => setValid(ok)}
 *   />
 *   <Button type="submit" disabled={!valid}>Save</Button>
 * </form>
 *
 * Note: length is counted with String.length (UTF-16 code units); astral
 * characters such as most emoji count as 2 — the same unit Zod's .max() uses.
 */
import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { z } from 'zod';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { cn } from '../../lib/utils';

export type CounterState = 'normal' | 'warning' | 'error';

export function deriveCounterState(
  len: number,
  warnAt: number,
  maxLength: number,
): CounterState {
  if (len > maxLength) return 'error';
  if (len >= warnAt) return 'warning';
  return 'normal';
}

const counterColor: Record<CounterState, string> = {
  normal: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
};

export interface CharacterCountInputProps {
  label: string;
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
}

export function CharacterCountInput({
  label,
  value,
  onChange,
  maxLength = 200,
  minLength = 0,
  placeholder,
  multiline = false,
  hardCap = true,
  onValidChange,
  id,
  name,
  disabled,
  className,
}: CharacterCountInputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const counterId = `${fieldId}-counter`;
  const errorId = `${fieldId}-error`;

  const [touched, setTouched] = useState(false);

  const schema = useMemo(
    () => z.string().min(minLength).max(maxLength),
    [minLength, maxLength],
  );
  const result = schema.safeParse(value);
  const isValid = result.success;
  const error = result.success ? undefined : result.error.issues[0].message;

  // Redundant calls with an unchanged value are harmless (React bails on an
  // identical setState); parents doing expensive work should memoize onValidChange.
  useEffect(() => {
    onValidChange?.(isValid, error);
  }, [isValid, error, onValidChange]);

  const len = value.length;
  const warnAt = Math.ceil(maxLength * 0.9);
  const counterState = deriveCounterState(len, warnAt, maxLength);
  const showError = touched && !isValid;

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (hardCap && next.length > maxLength) return;
    onChange(next);
  };

  const sharedProps = {
    id: fieldId,
    name,
    value,
    placeholder,
    disabled,
    onChange: handleChange,
    onBlur: () => setTouched(true),
    'aria-invalid': showError,
    'aria-describedby': showError ? `${counterId} ${errorId}` : counterId,
    className: cn(
      multiline ? 'resize-none pb-6' : 'pr-16',
      showError && 'border-destructive',
      className,
    ),
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        {multiline ? (
          <Textarea {...sharedProps} />
        ) : (
          <Input type="text" {...sharedProps} />
        )}
        <span
          id={counterId}
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute text-xs transition-colors',
            multiline ? 'bottom-2 right-3' : 'right-3 top-1/2 -translate-y-1/2',
            counterColor[counterState],
          )}
        >
          {len} / {maxLength}
        </span>
      </div>
      {showError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default CharacterCountInput;
```

## Notes on running a single test file

`bun run test` maps to `vitest run`. Pass a filename filter after `--`:
`bun run test -- character-count-input`. Drop the filter to run the whole suite before the final commit.
