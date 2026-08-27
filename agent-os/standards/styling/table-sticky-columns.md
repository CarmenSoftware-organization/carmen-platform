# Frozen Table Columns

`DataTable` always freezes the **first two** left columns (checkbox + `#`) — `.table-sticky-left`
is unconditional. The **last** column is frozen only when it is genuinely an action column:
`DataTable` checks `columns.at(-1)?.id === 'actions'` and adds `.table-sticky-right` from that.
Extra frozen left columns are opt-in and capped at four.

## The right column

A table whose last column holds data (Status, Period, Reference No) must not freeze it — the
reader then cannot scroll it away and gains nothing. The check is automatic, so a new table
needs nothing; a table whose action column uses a different `id` opts in explicitly:

```tsx
<DataTable stickyRightColumn columns={…} />        // force on
<DataTable stickyRightColumn={false} columns={…} />  // force off
```

A hand-written `<table>` outside `DataTable` opts in with the class itself, and **must gate it on
the same condition that renders the action column** — a `{canManage && <th/>}` header means the
last column becomes a data column for read-only users:

```tsx
<table className={`w-full text-sm${canManage ? ' table-sticky-right [--sticky-right-bg:var(--card)]' : ''}`}>
```

`--sticky-right-bg` names the opaque surface under the frozen cell; it defaults to `--background`
(what a `DataTable` sits on) and a table inside a Card must pass `var(--card)`. Skipping it paints
a grey stripe down the frozen column in both themes — see rule 2 below.

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
