# i18n Sub-project B: the pure utilities — Design

**Date:** 2026-08-28
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Makes `validateField`, `parseApiError` and `getErrorDetail` translatable.
**Predecessors:** `2026-08-27-language-switcher-design.md` (phase 1, merged as PR #169) and `2026-08-27-i18n-phase2-users-design.md` (phase 2 slice 1, merged as PR #170)

## Problem

Two phases of translation have shipped, and both deliberately left the same hole. `validateField` (`src/utils/validation.ts`) and `parseApiError` / `getErrorDetail` (`src/utils/errorParser.ts`) are **pure functions**: they cannot call `useI18n()` without violating the Rules of Hooks. So a form whose every label reads Thai still answers a bad email address with `Invalid email format`, and a failed request still reports `Please try again later.`

Both earlier specs recorded this as deferred and named the cost: 164 call sites across 69 files.

## Why this is smaller than 164 call sites

The earlier specs assumed `t` would be a **required** parameter, which would force every call site to change at once. Making it **optional with an English fallback** changes the shape of the work entirely:

| | |
|---|---|
| Utility files changed | 3 |
| New catalog keys | ~17 |
| Call sites wired to `t` in this change | **16** — only the pages already translated (`Login` 3, `UserManagement` 5, `UserEdit` 8) |
| Call sites left alone | 148, in pages not yet translated — they keep rendering English, exactly as today |
| Test files changed | **0** |

The remaining 148 get wired by whichever phase-2 slice translates their page, as part of that slice's normal work.

## Decisions

| Question | Decision |
|---|---|
| Utility shape | `t` as a **trailing optional parameter**, defaulting to the English catalog |
| Scope | `validateField`, `parseApiError`, `getErrorDetail` |
| Out of scope | `devLog` (writes to console only) and `isNotFoundError` (returns a boolean) |
| `common.validation.nameRequired` / `clusterRequired` | Replaced by one `required: '{{label}} is required'` template |

### This reverses an earlier decision, deliberately

Phase 1's spec recorded the shape as *"these functions return a key plus params, never a rendered sentence, and the caller translates."* That was written before anyone measured what it costs at the call site. Returning `'' | { key, params }` means every one of the 164 callers grows a `err ? t(err.key, err.params) : ''` dance, and every one of the 42 assertions in `validation.test.ts` — which asserts the returned **string** — has to be rewritten.

A trailing optional `t` gets the same result with none of that. The utility still returns a string, callers that already work keep working, and the tests that pin the English contract keep passing untouched.

### Why trailing, and why optional

**Trailing** so that a call site passing `(name, value)` or `(name, value, options)` needs no change at all. Putting `t` before `options` would break every three-argument caller for no benefit.

**Optional** so that the existing test suite proves the fallback works. `src/utils/validation.test.ts` calls `validateField('email', 'bad')` with two arguments and asserts `'Invalid email format'`. That test passing **unmodified** is the acceptance criterion for the whole design: it demonstrates that 148 un-migrated call sites still render exactly what they render today.

This is the same shape the Users slice already used for `groupAccessByCluster` (`src/pages/userEdit/UserAccessTree.tsx`), and for the same reason — a frozen test calls it positionally.

### The cost of optional, stated plainly

A page that forgets to pass `t` silently renders English. There is no compiler signal and no dev warning.

That is not a regression — it is exactly today's behaviour — but it does mean the work is not self-completing. Every phase-2 slice must wire `t` into its own pages' validation and error calls, and that belongs on each slice's checklist rather than being left to memory.

## Design

### Signatures

```ts
// src/utils/validation.ts
export const validateField = (
  name: string,
  value: string,
  options?: ValidateFieldOptions,
  t?: TFunction,
): string => { … }

// src/utils/errorParser.ts
export const parseApiError  = (err: unknown, t?: TFunction): ParsedError => { … }
export const getErrorDetail = (err: unknown, t?: TFunction): string => { … }
```

Each body resolves its translator once:

```ts
const tr: TFunction = t ?? ((key, params) => renderEnglish(key, params));
```

`renderEnglish` reads `src/i18n/en.ts` directly and applies the same `{{param}}` interpolation the hook uses. **It reads the catalog rather than holding its own copy of the strings** — a hand-typed fallback is a second source of truth that drifts silently, which is the finding that came out of the Users slice's `groupAccessByCluster`.

### Catalog

`common.validation.*` currently holds two keys, `nameRequired` and `clusterRequired`, seeded by the Users slice and **referenced by nothing**. They are replaced by a template. Doing that now costs nothing; after two more slices bind to them it would cost every one of those call sites.

```ts
common: {
  validation: {
    required:           '{{label}} is required',
    invalidEmail:       'Invalid email format',
    invalidPhone:       'Invalid phone number format',
    invalidUrl:         'Must be a valid http(s) URL',
    invalidDate:        'Must be a valid date',
    invalidCode:        'Code must be 2-20 alphanumeric characters',
    usernameEmail:      'Username must be a valid email address',
    nonNegativeInt:     'Must be a non-negative integer',
    positiveInt:        'Must be a positive whole number',
    invalidSchema:      'Schema must start with a letter or underscore and contain only letters, numbers, and underscores',
    invalidSubNo:       'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)',
    // Default field names, used when a caller passes no `label`.
    fieldDefault:       'This field',
    amount:             'Amount',
    schema:             'Schema',
    startDate:          'Start date',
    endDate:            'End date',
    subscriptionNumber: 'Subscription number',
  },
}
```

`error.unexpected`, `error.tryAgainLater` and `error.unknown` already exist. Phase 1 created them, left them unreferenced, and commented that they were reserved for exactly this change.

### The six hidden default field names

`validateField` produces `` `${options.label ?? 'This field'} is required` `` and five sibling forms that substitute `'Amount'`, `'Schema'`, `'Start date'`, `'End date'` or `'Subscription number'` when the caller passes no `label`.

These are user-visible strings hiding inside a `??` in the middle of a line. Neither of the two earlier phases' extraction passes could see them, and they are easy to miss by eye. They get keys.

### Callers must pass a translated `label`

`t('common.validation.required', { label })` is only as translated as the `label` handed to it. A caller passing the literal `'Name'` produces `'Name จำเป็น'` — half translated, and worse than leaving it English.

Every one of the 16 call sites wired in this change must pass a translated label (`t('common.field.name')`), and the same requirement goes on each later slice's checklist.

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean.
2. **All 144 test files pass with none modified.** This is the primary acceptance criterion, not a formality: `validation.test.ts` calls `validateField` with two arguments and asserts the English string, so its passing proves the optional-parameter fallback renders byte-identically for the 148 call sites this change does not touch.
3. `CI=true bun run build:dev` passes.
4. **Prove both paths, not one.** For at least five messages: call without `t` and confirm the exact English; call with a Thai `t` and confirm the Thai. A design whose whole point is two behaviours needs both demonstrated.
5. **In a browser, in Thai:** open `/users/:id/edit`, enter a malformed email, and confirm the validation message renders Thai. That specific message has been English through two phases by design; seeing it in Thai is what closes the hole.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| A page forgets `t` and silently shows English | High, accepted | Identical to today's behaviour, so not a regression. Add "wire `t` into `validateField` / `getErrorDetail` calls" to every slice's checklist. |
| A caller passes an untranslated `label`, producing a half-Thai sentence | Medium | Named above; checked at all 16 call sites in this change and added to the slice checklist. |
| The English fallback becomes a second copy of the catalog | Medium | `renderEnglish` reads `en.ts`; it never holds its own strings. |
| Replacing `nameRequired` / `clusterRequired` breaks a caller | Low | Both are currently referenced by nothing — verified. |

## Out of scope

- The 148 call sites in pages that phase 2 has not translated yet. Each is wired by the slice that translates its page.
- `devLog` and `isNotFoundError`.
- The `fields` record `parseApiError` returns: those strings come from the backend and are covered by the standing decision that backend text passes through untranslated.
