# Language Switcher — Design

**Date:** 2026-08-27
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only (`carmen-platform`). No backend change in this phase.

## Problem

The app has no i18n. Every user-facing string is hardcoded English across 452
`.ts`/`.tsx` files (222 pages, 97 components). There is no library, no catalog,
no locale state, and no switcher. Thai-speaking operators read an English-only
admin console.

## Decisions

| Question | Decision |
|---|---|
| Translation surface, this phase | App shell only (~120-160 keys). Pages stay English. |
| Languages | `en` (default) + `th` |
| Preference storage | `localStorage` only. No backend field, no browser-language detection. |
| Dates and numbers | Unchanged. Gregorian years, existing formats, in both languages. |
| Backend-originated text | Passed through untranslated this phase. Backend i18n is a separate future spec. |
| i18n layer | Hand-rolled React context. No new dependency. |
| `src/components/ui/` primitives | Explicitly approved to modify: `data-table.tsx`, `confirm-dialog.tsx`. |

### Why a hand-rolled context rather than `react-i18next`

The deciding factor is the real size of this phase, not the size it might reach.
Roughly 200-400 keys in shell files does not repay `i18next-parser`'s setup, and
the library adds ~20 KB gzip plus an upgrade surface this repo has repeatedly
paid for (dependency-update phases A through H).

Concrete wins for the hand-rolled version:

- **Key-level type safety with no configuration.** `t('nav.clustr')` is a
  compile error, and a key missing from `th.ts` is a compile error. `i18next`
  requires a `react-i18next.d.ts` module augmentation to reach the same place.
- **Zero bundle cost.**
- **Thai has no plural forms.** English needs only one/other, which is about ten
  lines. This is the single largest thing a library would otherwise buy us.

The migration path if this outgrows itself is mechanical: both APIs are shaped
as `t('key')`, so only the provider file changes.

## Architecture

### New files

```
src/i18n/types.ts        Lang union, Translations type, dotted-path key type
src/i18n/en.ts           English catalog — source of truth for the key set
src/i18n/th.ts           Thai catalog — typed as Translations
src/hooks/useI18n.tsx    I18nProvider + useI18n(), modelled on useDarkMode.tsx
src/components/LanguageToggle.tsx   Dropdown + LANGUAGE_OPTIONS, modelled on ThemeToggle.tsx
```

### Hook contract

```ts
const { lang, setLang, t } = useI18n();

t('nav.clusters')                       // 'Clusters' | 'คลัสเตอร์'
t('common.itemsSelected', { count: 3 }) // '{{count}} selected' interpolation
```

`t` is wrapped in `useCallback` with `[lang]` as its only dependency. This is
load-bearing, not incidental — see **The useMemo trap** below.

### Type safety mechanism

`en.ts` is a plain nested object. `types.ts` derives a union of dotted paths
from it with template literal types, so `TKey` is exactly the set of keys that
exist. `th.ts` declares itself as that same type, so an omitted or misspelled
key fails `tsc`.

The acceptance check for this mechanism is not "it compiles" — it is: delete a
key from `th.ts` and confirm `bun run typecheck` fails. If it passes, the type
is not doing its job and must be fixed before the work is called done.

### Wiring

`<I18nProvider>` wraps the app in `App.tsx`, alongside `ThemeProvider`. Initial
state reads `localStorage.getItem('lang')`, falling back to `'en'`. Two effects
mirror `useDarkMode.tsx`: one writes `localStorage`, one sets
`document.documentElement.lang` so assistive technology and browser translation
read the page correctly.

### Switcher placement

Follows the precedent theme already set:

- **Desktop:** `Layout.tsx:196` renders `<LanguageToggle />` before `<ThemeToggle />`.
- **Mobile:** the language options join the theme options inside the `compact`
  block of `HeaderUserMenu.tsx:111-118`. The mobile header has no standalone
  toggles by design.
- **Login:** `pages/Login.tsx` renders `<LanguageToggle />` at the top right.
  The route at `App.tsx:84` sits outside `Layout`, so without this a
  not-yet-authenticated user cannot switch language at all.

### NavItem shape change

`NavItem.label: string` becomes `labelKey: TKey`, and `group?: string` becomes
`groupKey?: TKey`. Translation happens at render time in `Sidebar.tsx`.

This keeps `buildPlatformNav` and `buildClusterAdminNav` pure and independent of
locale. It also protects the grouping logic: `Sidebar.tsx:70` groups by
consecutive runs of the same `group` value, so grouping must key off a stable
identifier rather than a translated string.

Files affected: `nav/platformNav.ts` (21 items), `nav/clusterAdminNav.ts` (4
items), `Sidebar.tsx`, and `Sidebar.test.tsx`, which builds `NavItem[]`
literals.

## Scope boundary

### In scope this phase (~120-160 keys)

| Group | Files | Approx. keys |
|---|---|---|
| Nav | `nav/platformNav.ts`, `nav/clusterAdminNav.ts`, 4 group headings | 29 |
| Shell | `Sidebar`, `Layout`, `HeaderUserMenu`, `Breadcrumbs`, `KeyboardShortcuts` | 43 |
| Context switchers | `BuSwitcher`, `ClusterSwitcher`, `ThemeToggle`, `VersionBadge` | 17 |
| Shared states | `ListEmptyState`, `FetchErrorState`, `SearchInput`, `StatusPage`, `StatusToggle` | 10 |
| Table chrome | `ui/data-table.tsx` — pagination, no-results, rows-per-page | 14 |
| Confirm dialog | `ui/confirm-dialog.tsx` — default Confirm/Cancel labels | 2 |
| Login | `pages/Login.tsx` | ~15 |
| Error fallbacks | `utils/errorParser.ts` — 3 FE-owned strings, see below | 3 |

### Deliberately out of scope

Every page under `src/pages/` **except `Login.tsx`** — 221 of the 222 stay
English. Also out: backend error messages, `constants/emailFlows.ts`, the
changelog, and user-authored broadcast/news content.

### Pure utilities that return user-facing strings

`validateField` (`utils/validation.ts:53`) and `parseApiError` /
`getErrorDetail` (`utils/errorParser.ts`) are pure functions. They cannot call
`useI18n()` — that would violate the Rules of Hooks.

Call-site counts make the shape decision expensive to revisit: `toast.*` 241,
`getErrorDetail` 69, `parseApiError` 63, `validateField` 32.

**The shape, decided now and recorded here so phase 2 does not have to rewrite
it:** these functions return a key plus params, never a rendered sentence, and
the caller translates.

```ts
// validateField returns '' when valid, otherwise:
{ key: TKey; params?: Record<string, string | number> }
```

**What this phase actually changes:** only the three FE-owned fallback strings in
`errorParser.ts` — `'An unexpected error occurred'`, `'Please try again later.'`,
and `'Unknown error'`. Messages that originate from the API pass through
untouched. `validateField` and its 32 call sites are not modified in this phase.

## Data flow

```
LanguageToggle → setLang('th')
   ├→ setState    → every consumer of useI18n() re-renders
   ├→ useEffect   → localStorage.setItem('lang', 'th')
   └→ useEffect   → document.documentElement.lang = 'th'
```

No page reload, no refetch, no route change.

### The useMemo trap

CLAUDE.md rule 8 requires column definitions to be wrapped in `useMemo`. Once a
column header calls `t()`, omitting the dependency leaves table headers frozen
in the previous language while the rest of the page updates — a bug that reads
like a stale browser cache.

Binding `t`'s identity to `lang` via `useCallback([lang])` defuses this: `t`
becomes a new reference when the language changes, so any `useMemo` listing `t`
recomputes on its own, and `react-hooks/exhaustive-deps` flags anyone who leaves
it out.

## Error handling

A missing key should be impossible — `tsc` rejects it. The runtime guard exists
only for keys assembled from variables:

- **Development:** `console.warn`, then fall back to the English string. Wrapped
  in `process.env.NODE_ENV === 'development'` per CLAUDE.md rule 7.
- **Production:** fall back to English silently. Never render a raw key.

## Verification

1. `bun run typecheck` passes.
2. **Prove the type guard works:** delete a key from `th.ts`, confirm
   `typecheck` fails, restore it. A passing typecheck alone does not
   demonstrate the mechanism.
3. `bun run lint` passes, `react-hooks/exhaustive-deps` in particular.
4. `bun run test` — the existing suite stays green. `Sidebar.test.tsx` must be
   updated for `labelKey` and re-read to confirm it still asserts real
   behaviour rather than passing because there is nothing left to assert.
5. **In a real browser, not screenshots alone:**
   - Switch to Thai, reload, confirm it is still Thai.
   - Confirm `document.documentElement.lang` is `th`.
   - Open `/login` while logged out and switch language there.
   - Check the switcher inside `HeaderUserMenu` at **390px**, measured through
     an iframe reporting `innerWidth` rather than by resizing the window.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| Thai strings overflow layouts | Medium | Inspect Sidebar and table headers at 390px. Thai is often much longer: "Tenant Migrations" → "การย้ายข้อมูลผู้เช่า". |
| Users see a mix of Thai and English | High, expected | Accepted deliberately. It is the consequence of shipping the shell first, and is recorded here so it is not filed as a bug. |
| `NavItem` shape change ripples | Low | `tsc` catches every site. |
| Business terms mistranslated | Medium | Domain terms — cluster, business unit, seat, tenant, license — stay in English inside the Thai catalog. |

## Out of scope, for a future spec

- Translating the 222 pages under `src/pages/`.
- Backend i18n. `carmen-turborepo-backend-v2` has none today: no `nestjs-i18n`,
  and no `Accept-Language` handling in any of its six apps. The likely shape is
  stable error codes from the backend translated on the frontend, rather than a
  translation catalog inside every service.
- Persisting the language preference per user account. `User` and `UserInfo`
  (`src/types/index.ts:350-373`) have no field for it.
