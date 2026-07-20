# Wire CharacterCountInput into BusinessUnitEdit — Design

**Date:** 2026-07-20
**Status:** Approved (pending spec review)
**Branch:** `feature/character-count-input` (continues PR #54 — component + first consumer ship together)

## Purpose

Give five BusinessUnitEdit fields a live character counter by rendering the
`CharacterCountInput` primitive inside `InlineField`'s edit mode, while
preserving the page's edit-in-place interaction model and its existing
validation.

## Fields (counter in edit mode)

| Field | maxLength | multiline | Existing validation |
|---|---|---|---|
| `description` | 500 | yes | none |
| `code` | 20 | no | `validateField` (2-20 `[A-Za-z0-9_-]`), required |
| `alias_name` | 3 | no | `validateField` (1-3 alphanumeric) |
| `hotel_name` | 100 | no | none |
| `company_name` | 100 | no | none |

## Core decision: the counter is not a second validator

`code` and `alias_name` already validate via `validateField` (charset + length).
To avoid two error systems fighting:

- Pass **only `maxLength`** into `CharacterCountInput` (never `minLength`).
- With `minLength = 0` (default) and `hardCap = true`, the parsed value is always
  valid (`0 <= len <= max`), so `CharacterCountInput`'s own error `<p>` and
  `border-destructive` never fire.
- Real validation is unchanged: `validateField` owns `code`/`alias_name`;
  `description`/`hotel_name`/`company_name` stay unvalidated (as today).
- `CharacterCountInput` contributes exactly the counter, the near-limit warning
  color, and the hard cap. Its counter turns red only on over-max, which
  `hardCap` prevents — so it can never collide with a `validateField` message.

## Component change: `CharacterCountInput` (backward-compatible)

Four additive, backward-compatible props, all added to the component's explicit
`sharedProps` object (the component has no rest-spread, so each pass-through
attribute must be a named prop):

1. `label?: string` — now **optional** (was required). When present, render the
   `<Label>` as today (with `htmlFor`). When absent, render no `<Label>`.
2. `ariaLabel?: string` — the field's accessible name when `label` is omitted.
   `sharedProps['aria-label'] = label ? undefined : ariaLabel` (when a visible
   label exists the `htmlFor` association names the field; when it doesn't, the
   `aria-label` does — so `getByRole('textbox', { name })` keeps working).
3. `ariaRequired?: boolean` — `sharedProps['aria-required'] = ariaRequired`, for
   a11y parity with `InlineField`'s raw-input path on the required `code` field.
4. `autoFocus?: boolean` — `sharedProps.autoFocus = autoFocus`, so edit-in-place
   focuses the control the user just opened. Guarded with
   `// eslint-disable-next-line jsx-a11y/no-autofocus` on the `sharedProps`
   definition, matching `InlineField`.

Existing callers pass `label` and none of the new props, so they are unaffected.
No event-passthrough props are added — `InlineField` drives blur/keydown from a
wrapper (see below).

## `InlineField` change

Add one prop and one edit-mode branch:

- New prop: `maxLength?: number`.
- In edit mode, when `maxLength != null` **and** `type !== 'select'`, render
  `CharacterCountInput` instead of the raw `<input>`/`<textarea>`:

```tsx
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
```

- The wrapper reuses the existing commit/revert semantics via bubbling:
  `onBlur={commit}` (React blur bubbles, and only the field is focusable inside),
  and a small `ccKeyDown` that mirrors the current handler using `e.target`
  (not `e.currentTarget`, which would be the wrapper):

```tsx
const ccKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && type !== 'textarea') {
    e.preventDefault();
    (e.target as HTMLElement).blur();   // -> wrapper onBlur -> commit(), single path
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
};
```

- `aria-required` and the error-driven border (`border-destructive` vs
  `border-primary`) are threaded through so parity with the raw-input path holds:
  the border still reflects a `validateField` error, and `aria-required` is still
  announced. `CharacterCountInput`'s own `showError` never fires here (always
  valid), so the passed `className` border wins via tailwind-merge.
- When `maxLength` is undefined, `InlineField` renders exactly as today.

The `ariaLabel`, `ariaRequired`, and `autoFocus` props consumed here are the
named props added to `CharacterCountInput` above (see "Component change") — they
land on the field via its `sharedProps`, since the component has no rest-spread.

## `BusinessUnitDocument` change

Extend the `inline()` helper's `opts` with `maxLength?: number`, forward it to
`InlineField`, and set it on the five fields:

```tsx
inline('code', 'Code', { mono: true, validate: true, required: true, maxLength: 20 })
inline('alias_name', 'Alias', { validate: true, maxLength: 3 })
inline('description', 'Description', { type: 'textarea', maxLength: 500 })
inline('hotel_name', 'Hotel name', { maxLength: 100 })
inline('company_name', 'Company', { maxLength: 100 })
```

All other `inline()` calls are unchanged (no `maxLength` → raw controls).

## Files touched

- `src/components/ui/character-count-input.tsx` — `label` optional + `ariaLabel`
  + `autoFocus`; render `<Label>` only when `label` present; field
  `aria-label = label ?? ariaLabel`. Update `character-count-input.test.tsx`.
- `src/pages/businessUnitEdit/InlineField.tsx` — `maxLength` prop + the
  CharacterCountInput edit-mode branch + `ccKeyDown`. Update `InlineField.test.tsx`.
- `src/pages/businessUnitEdit/BusinessUnitDocument.tsx` — `maxLength` in `inline()`
  opts on the five fields. `BusinessUnitDocument.test.tsx` exists — extend only if
  a new behavior needs coverage there.

## Testing

- `character-count-input.test.tsx`: with no `label`, renders no `<label>` element
  but the field carries `aria-label` (accessible via `getByRole('textbox', { name })`);
  `autoFocus` focuses the field; existing labelled tests still pass.
- `InlineField.test.tsx`: a `maxLength` field in edit mode renders a counter
  (`current / max`), hard-caps typing past `maxLength`, still commits on blur and
  reverts on Escape, is focused on open, and still shows the `validateField` error
  border (`border-destructive`) when an `error` is passed.
- Full suite + `bun run build` green before finishing.

## Out of scope (YAGNI)

- No new validation for `description`/`hotel_name`/`company_name` (counter only).
- No change to `validateField` for `code`/`alias_name`.
- No `minLength` passed to `CharacterCountInput` (would surface a duplicate error).
- No event-passthrough props on `CharacterCountInput` (`onBlur`/`onKeyDown`) — the
  wrapper handles commit/revert via bubbling.
- Fields not listed (name, addresses, tax, formats) are untouched.

## Branch / delivery

Continue on `feature/character-count-input`; the wiring is the component's first
real consumer, so PR #54 grows to "add CharacterCountInput + wire into
BusinessUnitEdit" — reviewers see the primitive and its usage together.
