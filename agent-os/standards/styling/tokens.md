# Colour Tokens

Every colour is an HSL triple declared in `src/index.css` (`:root` + `.dark`) and consumed by
name. Outside tests, raw Tailwind palette classes (`bg-amber-500`, `text-slate-400`, …) survive
in exactly **two** files, both deliberate (see Exceptions). Keep it at two.

## How to use a token

| Situation | Use |
|---|---|
| A Tailwind class | the semantic name: `bg-card` `text-muted-foreground` `border-input` `bg-primary` |
| Status pill | `<Badge variant="success" \| "secondary" \| "destructive">` — never a colour class |
| A prop that takes a colour string (Recharts, CodeMirror, inline `style`, SVG `stroke`) | `hsl(var(--token))` |
| A Tailwind class the theme has no name for | arbitrary value over the token: `fill-[hsl(var(--warning))]` |

```tsx
// CORRECT — Recharts takes a string, so pass the token through hsl(var(…))
<CartesianGrid stroke="hsl(var(--border))" />
<Legend color="hsl(var(--success))" label="In sync" />

// WRONG — a hex freezes one theme into a component that renders in both
<CartesianGrid stroke="#e5e3e0" />
```

Alpha goes in the same expression: `hsl(var(--muted-foreground) / 0.4)`.

## Roles

`--primary` is the single blue accent; `--accent` is a **neutral warm surface**, not a brand
hue — reach for `--primary` when you mean "the accent colour". `--success` / `--warning` /
`--info` carry status meaning. `--chart-1` / `--chart-2` exist so a chart series never borrows
a status colour (see `dark-mode.md`).

`--zebra-*`, `--shadow-*` and `--bu-chip-*` are consumed by raw CSS in `index.css`, not by
Tailwind classes — they are `var(--x)` (already complete values), not `hsl(var(--x))`.

## Exceptions — permanent, do not extend

Two components deliberately opt out of the theme. Both are correct; neither is a precedent.

- `components/ui/dev-debug-sheet.tsx` — `bg-amber-500`. The dev-only trigger must read as *not
  part of the product UI*. A themed colour would make it blend in, which is the opposite of
  what it is for.
- `pages/tenantMigration/DeployConsole.tsx` — `text-slate-*`. A deploy log rendered as a fixed
  dark terminal in both themes.

Anything else needs a token.
