# Frozen Table Columns

`DataTable` always freezes the **first two** left columns (checkbox + `#`) and the **last**
column (actions) — `.table-sticky-left` + `.table-sticky-right` are unconditional. Extra frozen
columns are opt-in and capped at four.

## Opting in

```tsx
<DataTable stickyLeftColumns={3} … />   // # + Code + Name   (clusters, BUs, tenant migrations)
<DataTable stickyLeftColumns={4} … />   // select + # + avatar + username (users)
```

- `stickyLeftColumns` ≥ 3 adds `.table-sticky-left-3`; ≥ 4 adds **both** `-3` and `-4`.
- **Default (2) unless the table is genuinely wide.** Every frozen column is width the reader
  cannot scroll away.
- **4 is the ceiling.** A 5th needs new CSS in `index.css`, not a bigger number — the rules are
  written per `nth-child`. Add it deliberately, don't grow it by accident.

## The three rules the CSS depends on

1. **Offsets are measured, not hard-coded.** Under `table-auto` the browser decides column
   widths, so `DataTable` measures the header cells in a `useLayoutEffect` and publishes
   `--sticky-c2-left … --sticky-cN-left` on the `<table>` (re-measured via `ResizeObserver`).
   The literals in `index.css` (`40px`, `136px`, `176px`) are first-paint fallbacks only —
   don't "fix" a misaligned column by editing them.

2. **Translucent tints layer over an opaque base.** A frozen cell overlays scrolled content, so
   its background must be opaque. `--zebra-even` is a 2% alpha; applied as `background-color`
   alone it lets the cell underneath bleed through. Apply the tint as `background-image`:

   ```css
   background-color: hsl(var(--background));
   background-image: linear-gradient(var(--zebra-even), var(--zebra-even));
   ```

3. **The edge cue is a translucent shadow on the rightmost frozen column only.** Fading to
   `hsl(var(--background))` paints the page colour over the neighbouring cell and greys out its
   first character. When you freeze one more column, move the `::after` — set `content: none`
   on the previous last one, exactly as `-3` and `-4` do.
