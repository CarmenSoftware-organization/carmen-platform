# Dark Mode

Class-based (`darkMode: ["class"]`). `ThemeProvider` (`src/hooks/useDarkMode.tsx`) adds/removes
`.dark` on `<html>`; `theme` is `'light' | 'dark' | 'system'`, persisted in
`localStorage('theme')`, defaulting to `system`.

## Adding a token — both blocks, always

A new custom property MUST be declared in **`:root` and `.dark`**. Declaring it in one is a
silent failure: the value simply doesn't exist in the other theme, so the colour falls back to
transparent/inherited with no build error and no test failure. Nothing enforces this — the
review is the enforcement.

```css
:root  { --chart-2: 32 85% 45%; }
.dark  { --chart-2: 36 88% 58%; }   /* required, not optional */
```

Dark values are not the light values darkened — they are retuned (higher lightness on
`--primary`, lower saturation on grounds). Pick them against the dark ground, not by formula.

### Exposing a new token as a utility — `@theme inline`, never plain `@theme`

Tailwind v4 lets you mint utilities from CSS, but only the `inline` form survives a theme
switch:

```css
:root { --brand: 221 61% 48%; }
.dark { --brand: 217 70% 60%; }
@theme inline { --color-brand: hsl(var(--brand)); }   /* → bg-brand, text-brand, border-brand */
```

`inline` tells Tailwind not to mint its own variable, so `bg-brand` compiles to
`background-color:hsl(var(--brand))` and keeps following `.dark`. Writing
`@theme { --color-brand: hsl(221 61% 48%); }` instead compiles to one frozen value
(`#2f5fc5`) that is **identical in both themes** — the same silent failure as declaring a
token in one block only, and just as invisible to the build and the test suite.

Plain `@theme` is correct only for values that genuinely don't vary by theme (spacing,
radius, a fixed brand colour).

## Reading the theme

- Need the current mode in a component → `useDarkMode()` (throws outside `ThemeProvider`).
- **Never** branch on `useMediaQuery('(prefers-color-scheme: dark)')` for styling. It answers
  the OS question, not the app question, and disagrees with `ThemeProvider` whenever the user
  has picked an explicit mode. `useMediaQuery` is for **layout** breakpoints (`(min-width: …)`).

## Chart colours

`--chart-1` / `--chart-2` exist so a series never reuses `--success` / `--warning` (which mean
a status) or lands on the same hue twice — `--primary` and `--info` are currently identical, so
using both for two series produces one indistinguishable chart. Add `--chart-3` (in both
blocks) rather than borrowing a status token.

### Why the existing tokens stay in `tailwind.config.js`

`@theme` and the legacy `@config` coexist — Tailwind merges both into one theme, so nothing here
needs migrating. `@utility`, `@custom-variant`, `@container`, and oklch all work against the
current setup (verified, not assumed).

The **existing** 36 tokens stay where they are: `tailwind.config.js` maps utility names onto
`hsl(var(--token))`, and their values live in `:root` / `.dark` as bare HSL triplets
(`--background: 40 9% 97.5%`, no `hsl()` wrapper) so `hsl(var(--x) / 0.4)` opacity works. Don't
"modernise" those into full colour values — 9 files pass them to JS as `hsl(var(--x))` (Recharts,
the summary Legends) and would break. Moving the old tokens into `@theme` was considered and
**deliberately declined**: it buys consistency, not capability.
