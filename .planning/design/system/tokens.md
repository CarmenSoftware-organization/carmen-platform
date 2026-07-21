# Carmen Platform — Design Tokens

> **Documented from the live system**, not generated. This file mirrors the actual
> tokens shipped in the "calm-corporate reskin" (PR #38, merged to `main`).
>
> **Source of truth:** `src/index.css` (CSS custom properties) + `tailwind.config.js`
> (Tailwind → variable bindings). If those files change, update this doc — never the
> other way around. HSL triplets are canonical; hex values are computed references.

**Personality:** calm / corporate / restrained-enterprise · warm-neutral ground with a
single trustworthy blue accent · flat surfaces (glassmorphism removed) · both light and
dark themes.

**Format note:** carmen-platform follows the shadcn/ui convention — CSS variables hold
**space-separated HSL channels without the `hsl()` wrapper** (e.g. `221 61% 48%`), and
Tailwind consumes them as `hsl(var(--token))`. This lets any color take an opacity
modifier, e.g. `bg-primary/50` → `hsl(var(--primary) / 0.5)`.

---

## Colors

Two themes. Dark theme is toggled by the `.dark` class on a root element
(`darkMode: ["class"]`). Every role below exists in both themes.

### Light theme (`:root`)

| Role | Variable | HSL (canonical) | Hex (approx) | Usage |
|------|----------|-----------------|--------------|-------|
| Background | `--background` | `40 9% 97.5%` | `#F9F9F8` | App canvas — warm off-white |
| Foreground | `--foreground` | `30 7% 12%` | `#211F1C` | Primary text (warm near-black) |
| Card | `--card` | `0 0% 100%` | `#FFFFFF` | Card / panel surface |
| Card foreground | `--card-foreground` | `30 7% 12%` | `#211F1C` | Text on cards |
| Popover | `--popover` | `0 0% 100%` | `#FFFFFF` | Dropdowns, tooltips, sheets |
| Popover foreground | `--popover-foreground` | `30 7% 12%` | `#211F1C` | Text in popovers |
| **Primary** | `--primary` | `221 61% 48%` | `#305FC5` | Buttons, links, active states, focus ring |
| Primary foreground | `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| Secondary | `--secondary` | `40 8% 94%` | `#F1F0EE` | Secondary buttons, subtle fills |
| Secondary foreground | `--secondary-foreground` | `30 10% 20%` | `#38332E` | Text on secondary |
| Muted | `--muted` | `40 8% 95.5%` | `#F4F4F3` | Muted surfaces, read-only field bg |
| Muted foreground | `--muted-foreground` | `33 5% 43%` | `#736E68` | Subtitles, meta, placeholder text |
| Accent | `--accent` | `40 8% 94%` | `#F1F0EE` | Hover fills, subtle emphasis (**neutral, not a brand hue**) |
| Accent foreground | `--accent-foreground` | `30 10% 20%` | `#38332E` | Text on accent |
| Destructive | `--destructive` | `0 72% 51%` | `#DC2828` | Delete/danger actions, errors |
| Destructive foreground | `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| Border | `--border` | `40 8% 90%` | `#E8E6E3` | 1px borders on all surfaces |
| Input | `--input` | `40 8% 87%` | `#E1DFDB` | Form control borders |
| Ring | `--ring` | `221 61% 48%` | `#305FC5` | Focus-visible outline |

### Light theme — status accents

Status uses **dedicated tokens**, never raw Tailwind greens/ambers (repo rule 5).

| Role | Variable | HSL | Hex (approx) | Usage |
|------|----------|-----|--------------|-------|
| Success | `--success` | `152 40% 36%` | `#37815E` | Active/healthy badges, positive state |
| Success foreground | `--success-foreground` | `0 0% 100%` | `#FFFFFF` | Text on success |
| Warning | `--warning` | `32 90% 44%` | `#D5770B` | Warnings, at-risk state |
| Warning foreground | `--warning-foreground` | `0 0% 100%` | `#FFFFFF` | Text on warning |
| Info | `--info` | `221 61% 48%` | `#305FC5` | Informational (mirrors primary) |
| Info foreground | `--info-foreground` | `0 0% 100%` | `#FFFFFF` | Text on info |

### Dark theme (`.dark`)

| Role | Variable | HSL (canonical) | Hex (approx) | Usage |
|------|----------|-----------------|--------------|-------|
| Background | `--background` | `30 6% 9%` | `#181716` | App canvas — warm near-black |
| Foreground | `--foreground` | `40 8% 90%` | `#E8E6E3` | Primary text |
| Card | `--card` | `30 6% 12%` | `#201F1D` | Card / panel surface |
| Card foreground | `--card-foreground` | `40 8% 90%` | `#E8E6E3` | Text on cards |
| Popover | `--popover` | `30 6% 12%` | `#201F1D` | Dropdowns, tooltips, sheets |
| Popover foreground | `--popover-foreground` | `40 8% 90%` | `#E8E6E3` | Text in popovers |
| **Primary** | `--primary` | `217 70% 60%` | `#5288E0` | Lighter blue — reads on dark ground |
| Primary foreground | `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| Secondary | `--secondary` | `30 5% 17%` | `#2E2B29` | Secondary buttons, subtle fills |
| Secondary foreground | `--secondary-foreground` | `40 8% 95%` | `#F4F3F1` | Text on secondary |
| Muted | `--muted` | `30 5% 16%` | `#2B2927` | Muted surfaces |
| Muted foreground | `--muted-foreground` | `35 6% 62%` | `#A49F98` | Subtitles, meta, placeholders |
| Accent | `--accent` | `30 5% 18%` | `#302E2C` | Hover fills, subtle emphasis |
| Accent foreground | `--accent-foreground` | `40 8% 95%` | `#F4F3F1` | Text on accent |
| Destructive | `--destructive` | `0 62% 45%` | `#BA2C2C` | Delete/danger, errors |
| Destructive foreground | `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| Border | `--border` | `30 5% 20%` | `#363330` | 1px borders |
| Input | `--input` | `30 5% 22%` | `#3B3835` | Form control borders |
| Ring | `--ring` | `217 70% 60%` | `#5288E0` | Focus-visible outline |
| Success | `--success` | `152 45% 45%` | `#3FA676` | Positive state |
| Warning | `--warning` | `38 92% 55%` | `#F6A823` | Warning state |
| Warning foreground | `--warning-foreground` | `20 14% 8%` | `#171310` | Dark text on bright warning |
| Info | `--info` | `217 70% 60%` | `#5288E0` | Informational |

### Special-purpose tokens

Not part of the standard shadcn set — carmen-specific.

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--zebra-even` | `rgba(24,20,16,0.02)` | `rgba(255,255,255,0.015)` | Even-row zebra striping in tables (`.zebra-row`) |
| `--zebra-hover` | `hsl(221 61% 48% / 0.045)` | `hsl(217 70% 60% / 0.08)` | Row hover fill |
| `--zebra-hover-accent` | `hsl(221 61% 48% / 0.5)` | `hsl(217 70% 60% / 0.4)` | 3px inset left bar on hover |
| `--bu-chip-s` / `--bu-chip-l` | `62%` / `46%` | `58%` / `58%` | Per-Business-Unit color identity (SQL Workbench). Hue derives from the BU code; S/L are theme-tuned |

---

## Typography

Single family, loaded from Google Fonts in `index.html`.

- **Font family (UI):** `Inter, system-ui, -apple-system, sans-serif`
- **Font family (code/mono):** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- **Loaded weights:** 400, 500, 600, 700
- **Base:** `font-feature-settings: "rlig" 1, "calt" 1`; body `line-height: 1.5`
- **Tabular numbers:** `.tabular-nums` utility (`font-variant-numeric: tabular-nums`) for aligned figures in tables

### Type scale (Tailwind utility conventions)

There is no numeric scale in CSS — the system uses Tailwind utility classes consistently.
These are the canonical patterns from the codebase:

| Role | Classes | Renders (base) |
|------|---------|----------------|
| Page title | `text-2xl sm:text-3xl font-bold tracking-tight` | 24 → 30px / 700 |
| Subtitle | `text-sm sm:text-base text-muted-foreground` | 14 → 16px / 400 |
| Section / card heading | `text-lg font-semibold` | 18px / 600 |
| Body | `text-sm` | 14px / 400 |
| Meta / caption | `text-xs` or `text-[11px]` | 12 / 11px |
| Code / mono | `text-[10px] sm:text-xs font-mono` | 10 → 12px |

---

## Spacing

Tailwind's default 4px-base scale. Canonical layout rhythms from the codebase:

| Context | Classes | Value |
|---------|---------|-------|
| Page wrapper (vertical) | `space-y-4 sm:space-y-6` | 16 → 24px |
| Card content (vertical) | `space-y-4` | 16px |
| Form field (label→input) | `space-y-2` | 8px |
| Button / inline gaps | `gap-3` | 12px |
| Two-column form grid | `lg:grid-cols-2` | at ≥1024px |
| Container padding | `1rem` | 16px (max-width `2xl` = 1400px, centered) |

Reference scale (Tailwind): `1`=4px · `2`=8px · `3`=12px · `4`=16px · `6`=24px · `8`=32px · `12`=48px.

---

## Radius

Base `--radius: 0.5rem` (8px). Tailwind derives three steps:

| Token | Formula | Value | Typical use |
|-------|---------|-------|-------------|
| `rounded-lg` | `var(--radius)` | 8px | Cards, panels, sheets |
| `rounded-md` | `calc(var(--radius) - 2px)` | 6px | Buttons, inputs, selects |
| `rounded-sm` | `calc(var(--radius) - 4px)` | 4px | Badges, small chips |
| `rounded-full` | — | 9999px | Avatars, icon buttons, debug FAB |

> ⚠️ The stale `--radius` value `0.375rem` in `CLAUDE.md`'s Styling Reference predates the
> reskin. The live value is **`0.5rem`**.

---

## Shadows

Deliberately soft and low — flat enterprise surfaces lean on the 1px `--border`, not
elevation. Defined as CSS variables (not Tailwind's default shadow scale).

| Variable | Light | Dark |
|----------|-------|------|
| `--shadow-xs` | `0 1px 2px rgba(24,20,16,0.04)` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-sm` | `0 1px 2px rgba(24,20,16,0.05)` | `0 1px 2px rgba(0,0,0,0.35)` |
| `--shadow-md` | `0 4px 12px rgba(24,20,16,0.06)` | `0 4px 12px rgba(0,0,0,0.45)` |

---

## Breakpoints

Mobile-first. The `md` breakpoint is the desktop/sidebar pivot.

| Breakpoint | Min width | Significance |
|-----------|-----------|--------------|
| `sm` | 640px | Larger phones — titles scale up |
| `md` | 768px | **Sidebar appears** (fixed desktop nav vs. mobile Sheet drawer) |
| `lg` | 1024px | Two-column form grids |
| `2xl` (container) | 1400px | Max container width |

---

## Interaction & motion

| Concern | Value |
|---------|-------|
| Focus ring | `outline: 2px solid hsl(var(--ring)); outline-offset: 2px` on `:focus-visible` |
| Sidebar expand/collapse | `width/margin 300ms cubic-bezier(0.4, 0, 0.2, 1)` (`.sidebar-transition`) |
| Sidebar item | `all 200ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Zebra row hover | `background/box-shadow 150ms ease` |
| Accordion | `0.2s ease-out` (Radix content-height keyframes) |
| Scrollbar | 6px, thumb `hsl(var(--muted-foreground) / 0.3)`, radius 3px |
| Scroll behavior | `scroll-behavior: smooth` on `html` |

---

## How tokens are consumed

1. **Never hardcode hex or raw Tailwind color scales** (`bg-blue-500`, `text-green-600`).
   Use semantic classes bound to variables: `bg-primary`, `text-muted-foreground`,
   `border-border`, `bg-card`.
2. **Status is always a `<Badge variant="…">`** (`success` | `warning` | `info` |
   `secondary` | `destructive`) — never raw green/amber Tailwind (repo rule 5).
3. **Opacity modifiers work on any color** because channels are wrapper-free:
   `bg-primary/10`, `text-foreground/70`.
4. **Dark theme is automatic** — every component that uses semantic tokens flips with the
   `.dark` class; no per-component dark overrides needed.

---

## Contrast notes

Key text pairs against WCAG AA (4.5:1 body / 3:1 large):

| Pair | Ratio (approx) | Verdict |
|------|----------------|---------|
| `foreground` on `background` (light) | ~15:1 | ✅ AAA |
| `foreground` on `background` (dark) | ~13:1 | ✅ AAA |
| `muted-foreground` on `background` (light) | ~4.9:1 | ✅ AA (body) |
| `primary-foreground` (#FFF) on `primary` (light `#305FC5`) | ~5.3:1 | ✅ AA |
| `muted-foreground` on `card` (dark) | ~5.6:1 | ✅ AA |

> `primary` at `221 61% 48%` is intentionally dark enough that white text on it clears AA —
> keep that in mind if the primary lightness is ever adjusted.
