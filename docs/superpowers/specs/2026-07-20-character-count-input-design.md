# CharacterCountInput — Design

**Date:** 2026-07-20
**Status:** Approved (pending spec review)
**Component:** `src/components/ui/character-count-input.tsx`

## Purpose

A reusable, controlled text-input primitive that shows a live character count
against a maximum length and validates with Zod. Renders an `<input>` or a
`<textarea>`, surfaces validity to the parent for submit-gating, and reflects
normal / warning / error visual states. All features apply equally to both the
single-line and multiline variants.

## Decisions (locked)

| Question | Decision |
|---|---|
| Where it lives / which rules win | Inside carmen-platform, following project conventions, **plus** Zod added as a real dependency |
| Validation library | **Zod** `^3.24` (v3 stable; `z.string().min().max()` API-identical to v4; zero runtime deps) |
| Styling | **Tailwind + HSL tokens** (`--warning`, `--destructive`, `--muted-foreground`, `--input`, `--ring`). No standalone `.css` file. |
| Error-message display timing | After **blur** (`touched`). Counter value and warning color update in real time. |
| Surface `isValid` to parent | **`onValidChange?: (isValid, error?) => void`** callback |
| Hard-cap typing past `maxLength` | **`hardCap` prop, default `true`** |
| textarea resize | **`resize-none`** by default (avoids the resize-grip / counter collision) |

## Placement & files

- Create `src/components/ui/character-count-input.tsx` — component + exported
  `CharacterCountInputProps` type (page/component-local props stay in the file,
  not `src/types/index.ts`).
- Create `src/components/ui/character-count-input.test.tsx` — co-located Vitest +
  React Testing Library.
- Edit `package.json` (+ `zod`) and the lockfile.
- Usage example lives as a doc comment at the top of the component file (no new
  app page is created).

Naming is kebab-case to match the sibling primitives (`chip-input.tsx`,
`json-viewer.tsx`, …).

## Dependency

Add `zod` (`^3.24`). Install with `bun add zod` (or
`npm i zod --legacy-peer-deps`). Zod has no transitive runtime dependencies, so
it does not interact with the existing `overrides`/`resolutions` pins.

## Props / TypeScript

```ts
interface CharacterCountInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;        // default 200
  minLength?: number;        // default 0
  placeholder?: string;
  multiline?: boolean;       // true -> <textarea>, false -> <input type="text">
  hardCap?: boolean;         // default true — block typing past maxLength
  onValidChange?: (isValid: boolean, error?: string) => void;
  id?: string;               // omitted -> generated with useId()
  name?: string;
  disabled?: boolean;
  className?: string;        // merged onto the field element via cn()
}
```

## Validation

The Zod schema is rebuilt only when the bounds change:

```ts
const schema = useMemo(
  () => z.string().min(minLength).max(maxLength),
  [minLength, maxLength]
);
const result = schema.safeParse(value);           // never throws
const isValid = result.success;
const error = result.success ? undefined : result.error.issues[0].message;
```

- `onValidChange` fires from a `useEffect` keyed on `[isValid, error,
  onValidChange]` (the callback is included to satisfy
  `react-hooks/exhaustive-deps` and to avoid calling a stale callback).
  `isValid`/`error` are primitives, so with a stable callback identity the
  parent is notified only when validity actually changes. A parent passing an
  inline callback re-fires the effect every render; this is harmless (React
  bails on an identical `setState`), but expensive consumers should memoize
  `onValidChange`.
- Length is measured with `value.length` (UTF-16 code units) — the **same unit
  Zod `.max()` uses**, so the counter and the validation boundary never disagree.
  Astral characters (most emoji) count as 2. This limitation is documented in the
  component's doc comment.
- With `minLength = 0`, an empty string is valid. A parent that needs a required
  field sets `minLength = 1` — there is no separate `required` prop (YAGNI).

## Visual states

Validity and visual state are separate concerns. A value can be valid yet render
an amber counter (near the limit).

Let `len = value.length`, `warnAt = Math.ceil(maxLength * 0.9)`, and
`showError = touched && !isValid`.

| State | Condition | Counter color | Border | Message |
|---|---|---|---|---|
| normal | not warning, not error | `text-muted-foreground` | `border-input` | — |
| warning | `len >= warnAt && len <= maxLength` | `text-warning` | unchanged | — |
| error (visual counter) | `len > maxLength` | `text-destructive` | see below | — |
| error (border + message) | `showError` | `text-destructive` | `border-destructive` | Zod message shown |

Rules:

- **Counter color precedence:** error (`len > maxLength`) > warning
  (`len >= warnAt`) > normal. Over-max wins even though it also satisfies the
  warning threshold.
- **Under-min does not color the counter.** A too-short value leaves the counter
  neutral (`text-muted-foreground`); the red border + message convey it after
  blur. The counter only signals proximity to / overflow of the *upper* bound.
- **Counter color is real time.** Over the max → red immediately; within 10% of
  the limit → amber immediately.
- **Border + error message are gated on `touched`.** They appear after the first
  blur while the value is invalid — covering both under-min and over-max. This
  keeps the field from scolding a user who is still typing their first characters.
- `transition-colors` on the border and counter for a smooth change.
- Focus uses `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`,
  matching the `Input` primitive.

### Counter placement (per variant)

| Variant | Position | Text-clearance padding | Resize |
|---|---|---|---|
| `input` (single-line) | right, vertically centered: `right-3 top-1/2 -translate-y-1/2` | `pr-16` on the field | — |
| `textarea` (multiline) | bottom-right: `bottom-2 right-3` | `pb-6` on the field | `resize-none` |

Both variants wrap the field in a `relative` container and overlay the counter
absolutely. Counter format is `current / max` (e.g. `45 / 200`).

## Accessibility

- `<Label htmlFor={id}>` (the existing `Label` primitive) is bound to the field's
  `id`. `id` is generated with `useId()` when not supplied.
- `aria-invalid={showError}` on the field.
- `aria-describedby` always includes `${id}-counter`, and additionally
  `${id}-error` when `showError` is true.
- The counter element carries `aria-live="polite"` so assistive tech announces
  count changes; the error text uses `role="alert"`.

## Behavior

- **Hard cap:** in the shared `onChange` handler, when `hardCap` is true and the
  next value's length exceeds `maxLength`, the change is rejected (the parent's
  `onChange` is not called). Validation still runs against whatever `value` the
  parent passes in, so a value supplied **over** the limit (e.g. loaded from an
  API) still reports an over-max error — this is the "hard-cap while still letting
  Zod report the boundary" case.
- **touched:** set to `true` on `onBlur`.
- **multiline switch:** because the counter, hard-cap, `touched`, and Zod checks
  all key off the `value` string rather than the DOM node, toggling `multiline`
  changes only which element renders — every behavior is identical across
  variants. The multiline branch renders the `Textarea` primitive; the single-line
  branch renders the `Input` primitive. Error border is merged on via `cn()`.
- **disabled:** forwarded to the field; no separate read-only rendering mode in
  this version.

## Test plan (Vitest + RTL, co-located)

1. Counter text updates as the user types (`12 / 200`).
2. Counter turns amber (`text-warning`) at/after 90% of `maxLength`.
3. `hardCap` (default) blocks typing past `maxLength` — on both `input` and
   `textarea`.
4. Error message does **not** appear while typing; appears after `blur` when
   invalid — on both `input` and `textarea`.
5. Under-min value shows its Zod message after blur.
6. A `value` passed in over `maxLength` reports the over-max error and shows a red
   counter.
7. `onValidChange` is called with the correct `(isValid, error)`.
8. `multiline` renders a `<textarea>`; default renders an `<input type="text">`.
9. a11y: `aria-invalid` flips on error; `aria-describedby` references the counter
   always and the error node when shown; label is associated with the field.
10. textarea renders with `resize-none` and a bottom-right counter.

## Usage example

```tsx
const [bio, setBio] = useState('');
const [valid, setValid] = useState(false);

<form onSubmit={handleSubmit}>
  <CharacterCountInput
    label="Bio"
    value={bio}
    onChange={setBio}
    minLength={10}
    maxLength={200}
    multiline
    placeholder="Tell us about yourself"
    onValidChange={(ok) => setValid(ok)}
  />
  <Button type="submit" disabled={!valid}>Save</Button>
</form>
```

## Out of scope (YAGNI)

- Grapheme-accurate counting (emoji as one) — `value.length` is intentional.
- A read-only display mode like `ChipInput`'s (`disabled` covers the current need).
- Custom per-message overrides — Zod's default messages are surfaced as-is.
- Wiring the component into any existing carmen page.

## Learning-mode note

During implementation, the scaffold and Zod wiring are provided, but the
`deriveCounterState(len, warnAt, maxLength) -> 'normal' | 'warning' | 'error'`
helper (~8 lines) is left for the user to write. It encodes the counter-color
precedence above (error > warning > normal, real time, upper-bound only —
`touched` and `minLength` are not inputs). `showError = touched && !isValid` is a
separate, provided expression that drives the border and message.
