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
