# i18n Phase 2, Slice 2: Broadcasts + News — Design

**Date:** 2026-08-28
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Translates the Broadcast and News pages.
**Predecessors:** `2026-08-27-language-switcher-design.md` (phase 1, PR #169), `2026-08-27-i18n-phase2-users-design.md` (slice 1, PR #170), `2026-08-28-i18n-pure-utils-design.md` (sub-project B, PR #171)

## What the measurement changed

The phase-2 spec sized this slice at **~199 strings** across "`Broadcast*` ×3, `News*` ×2, subdirectories". Measured against the source, it is **218 unique user-visible strings across 11 files**.

The gap is one whole file. **`src/components/BroadcastPreview.tsx`** is a slice-2 file that does not live under `src/pages/`, while its test does (`src/pages/broadcastCompose/BroadcastPreview.test.tsx`). Any file list derived by globbing `pages/` misses it, and the phase-2 spec's did.

That is the second time a file list built from directory shape has come up short in this project. The extraction for this slice therefore walks `src/pages/` **and** `src/components/`, and the file list below is explicit rather than a glob.

### Two more extraction blind spots, found by reading code the scan had already passed

Phase 1 and slice 1 each recorded the categories their regex missed — multi-line JSX text, `${}` template literals, punctuation-bearing strings, strings under six characters. Running that improved scan here and then *reading the files it had scanned* turned up two more it still cannot see.

**Strings the code synthesises at runtime.** `cap(status)` (`NewsManagement.tsx:47`, `NewsEdit.tsx:55`, `NewsMasthead.tsx:12`) upper-cases the first letter of a status value from the API, rendering `Published` / `Archived` / `Draft` in two data tables and two edit forms. `severity.toUpperCase()` (`BroadcastEdit.tsx:487`, `broadcastColumns.tsx:86`) renders `CRITICAL` / `WARNING` / `INFO` / `MAINTENANCE` in badges. **None of these exists as a literal anywhere in the repo**, so no scan of literals — however well written — can find them. They were found by reading.

**Template literals whose first character is `${`.** Every extraction pass so far, this slice's included, anchored on a capital letter to separate prose from code. That filter silently drops `` `${min} min ago` ``, `` `${count} business unit${count === 1 ? '' : 's'}` ``, and nine more. It also drops lowercase literals: `'just now'` and `'yesterday'` (`NewsroomSummary.tsx:15,21`).

Together these add **~14 user-visible strings** the table below does not count, most of them the entire output of `timeAgo`. **The counts in this spec are therefore a floor, not a total** — which is the honest way to state a number produced by pattern-matching, and the reason each page task ends by reading its file rather than trusting the list.

## Files

| File | Unique strings |
|---|---|
| `src/pages/BroadcastManagement.tsx` | 41 |
| `src/pages/broadcastManagement/BroadcastFilters.tsx` | 9 |
| `src/pages/broadcastManagement/BroadcastSummary.tsx` | 6 |
| `src/pages/broadcastManagement/broadcastColumns.tsx` | 14 |
| `src/pages/BroadcastCompose.tsx` | 59 |
| `src/pages/BroadcastEdit.tsx` | 48 |
| `src/components/BroadcastPreview.tsx` | 17 |
| `src/pages/NewsManagement.tsx` | 57 |
| `src/pages/newsManagement/NewsroomSummary.tsx` | 9 |
| `src/pages/NewsEdit.tsx` | 33 |
| `src/pages/newsEdit/NewsMasthead.tsx` | 3 |

Plus `src/i18n/en.ts` and `src/i18n/th.ts`.

## The seed is working

Slice 1 seeded the shared catalog from a measurement of the whole app rather than of its own pages. This slice is the first test of whether that paid.

Of slice 2's **54 strings that meet the shared rule** (≥3 files AND ≥2 areas), **35 already exist** in `common.*` / `entity.*` / `toast.*` / `breadcrumb.*`. The remaining 19 resolve as **17 new shared keys** plus two special cases decided below: `API Response` is not translated at all, and `Title is required` is composed from keys that already exist rather than given one of its own.

Reuse, not invention, is therefore the default posture for this slice. A reviewer's standing check — *does any new `pages.*` key duplicate a value already in `common.*`?* — matters more here than it did in slice 1, because there are now 227 shared values to accidentally duplicate.

### The 17 new shared keys

```ts
common: {
  action: { retry: 'Retry', preview: 'Preview' },
  field:  { type: 'Type', title: 'Title', severity: 'Severity', delivery: 'Delivery' },
  option: { all: 'All', custom: 'Custom', global: 'Global' },
  status: { published: 'Published', updated: 'Updated', unknown: 'Unknown' },
  severity: { critical: 'Critical', warning: 'Warning', info: 'Info', maintenance: 'Maintenance' },
  state:  { summaryStale: "Couldn't refresh — showing the last known numbers." },
}
```

Plus two `entity.*` nouns for the toast templates, each carrying all three grammatical forms as slice 1's rule requires:

```ts
entity: {
  broadcast: { title: 'Broadcast', sentence: 'Broadcast', lower: 'broadcast' },
  news:      { title: 'News',      sentence: 'News',      lower: 'news' },
}
```

### `common.status.unknown` sits next to `error.unknown`, deliberately

`error.unknown` already holds `'Unknown error'`. Adding `common.status.unknown: 'Unknown'` creates a second key named `unknown`.

This branch's predecessor renamed `common.validation.required` precisely to avoid a same-named sibling — so the case needs answering rather than assuming. The two are different: `common.field.required` and `common.validation.required` were **both under `common.*`**, both took `{{label}}`, and sat adjacent in autocomplete. `error.unknown` and `common.status.unknown` are in different top-level namespaces that read as what they are — an error message versus a status label — and neither takes a parameter. The name stays.

## Decisions

### `API Response` is not translated

It is the single most repeated candidate — **20 files, 20 areas** — and it is the `title` prop of `<DevDebugSheet>`, which opens with `if (!import.meta.env.DEV) return null;` (`src/components/ui/dev-debug-sheet.tsx:18`).

No user in any deployed environment ever sees it. Translating it would add a key to a catalog nine more slices must read, to render text that production strips. It stays an English literal, and this slice records the reason so slice 3 does not re-open it.

### Business Unit: the deferred question closes by reuse, not by a copy change

The phase-2 spec found `Business Units` / `Business units` genuinely inconsistent, noted that no slice-1 file used either form, and deferred: *"Whichever later slice owns those files decides."*

Slice 2 owns them, and uses **all three** forms — `Business Unit` ×3, `Business unit` ×3, `Business units` ×1. That is not an inconsistency to resolve; it is exactly the three-form shape `entity.businessUnit.{title,sentence,lower}` was built for in slice 1, sitting in source that predates it.

So the answer is to bind each occurrence to the form it already uses. **This slice makes no copy changes.** Every English string it produces is byte-identical to the one it replaces.

### `Title is required` composes rather than gets its own key

Sub-project B landed `common.validation.requiredMessage: '{{label}} is required'` three days before this slice. `t('common.validation.requiredMessage', { label: t('common.field.title') })` renders `'Title is required'` — byte-identical, and the first real consumer of that template.

This slice is also the first to inherit sub-project B's wiring obligation: **13 call sites** across five files call `validateField`, `parseApiError`, or `getErrorDetail` and must now pass `t` (`BroadcastManagement` 3, `NewsEdit` 4, `BroadcastCompose` 2, `BroadcastEdit` 2, `NewsManagement` 2). Sub-project B's dev warning fires on any that are missed, but only when the UI is Thai — so the checklist item stands and the browser check below exercises it.

## What only reading the code revealed

Everything above came from measurement. Everything in this section came from opening the files afterwards, and none of it would have surfaced otherwise.

### Three exported pure helpers need sub-project B's treatment too

Sub-project B solved *"a pure function cannot call `useI18n()`"* for three shared utilities. This slice contains three more, local to its own files, each **exported and covered by frozen positional tests**:

| Helper | Returns | Frozen assertions |
|---|---|---|
| `timeAgo(iso, now)` — `newsManagement/NewsroomSummary.tsx:10` | `just now`, `yesterday`, `${n} min ago`, `${n} hour(s) ago`, `${n} days ago`, `${n} week(s) ago`, `-`, a date | 6 |
| `reachSummary(mode, count, buLabel)` — `components/BroadcastPreview.tsx:37` | `Every user in the system`, `${n} selected user(s)`, `No recipients picked yet`, `No business unit picked yet` | 9 |
| `describeReach(isGlobal, count)` — `newsEdit/NewsMasthead.tsx:7` | `Global`, `${n} business unit(s)` | 4 |

Each takes a **trailing optional `t`**, exactly as sub-project B established, for exactly the same reason: the tests call them positionally and must keep passing unmodified. This is the pattern's second application, which is what turns it from a one-off into a convention.

`severityStyle` (`BroadcastPreview.tsx:14`) also returns labels, but all five map to keys that already exist (`common.severity.*` plus `common.option.custom`), so it takes `t` and returns translated labels with no new keys.

### `summarizeBulk` interpolates a verb, which only works in English

`NewsManagement.tsx:292` reads:

```ts
const summarizeBulk = (results, pastVerb: string, baseVerb: string) => {
  if (fail === 0)      toast.success(`${pastVerb} ${ok} news article(s)`);
  else if (ok === 0)   toast.error(`Failed to ${baseVerb} ${fail} news article(s)`);
  else                 toast.warning(`${pastVerb} ${ok}, ${fail} failed`);
};
```

Callers pass `Published`/`publish`, `Archived`/`archive`, `Deleted`/`delete`. This composes correctly in English only because English puts the verb first and inflects it; Thai does neither — it has no past form, and the count takes a classifier that sits after the noun.

Translating the frame and interpolating the verb would produce word salad. The three sentences become **whole-sentence keys, one set per verb** — nine keys under `pages.news.bulk.*`, each taking `{{count}}` (and `{{failed}}` for the partial case) — and `summarizeBulk` takes the verb as a **key prefix** rather than as two English words. The English output stays byte-identical.

This is the standing i18n rule *never interpolate a translated word into a translated sentence* meeting its first real instance in this codebase, and it is worth naming here so later slices recognise the shape.

### Uppercase severity badges lose their distinction in Thai

`BroadcastEdit.tsx:487` and `broadcastColumns.tsx:86` render severity as `severity.toUpperCase()` — `CRITICAL`, `WARNING`, `INFO`, `MAINTENANCE` — while `BroadcastPreview`'s `severityStyle` renders the same four values Title-cased. The all-caps form is a deliberate visual weight in a badge.

Thai has no letter case, so both forms resolve to the same word and the distinction simply disappears in Thai. Both bind to `common.severity.*`; the English catalog keeps only the Title-case values, and the two call sites that want all-caps keep `.toUpperCase()` **applied to the translated string**, which is a no-op in Thai and byte-identical in English. Nothing is lost that Thai could have kept.

## Namespaces

Broadcasts and News are two feature areas travelling in one slice, so they take **two page namespaces**, `pages.broadcasts.*` and `pages.news.*`, rather than one combined one. A string used by both — there are none in the measurement — would go to `common.*` only if it also met the arithmetic rule; otherwise it is duplicated, which is the rule working as intended.

Within an area the namespace is shared across its files: `Expire Broadcast` appears in both `BroadcastManagement` and `BroadcastEdit` and gets **one** key, not one per file.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| **64 frozen English assertions in 6 test files** break | High | This is the point of the byte-identity rule, and slice 2 has far more of them than slice 1 (`NewsManagement.test.tsx` alone carries 44, `BroadcastPreview` 9, `NewsroomSummary` 6, `NewsMasthead` 4, `BroadcastCompose` 1). A red test means the catalog drifted. **Never edit a test to make it pass.** |
| The `&apos;` in `NewsroomSummary.tsx:93` | Medium | `Couldn&apos;t refresh — showing the last known numbers.` is a JSX text node. JSX decodes `&apos;` to `'` before the DOM, so the 6 assertions in that file already match the decoded form — the catalog value carries a real apostrophe and is byte-identical *in what tests and users see*. The `.ts` literal must escape it (double quotes, or `\'`). This is the only HTML entity in the slice; it was checked for, not assumed. |
| A new `pages.*` key duplicates one of 227 shared values | Medium | The standing reviewer check, run against the whole shared catalog rather than by memory. |
| One of the 13 utility call sites is left without `t` | Medium | Sub-project B's dev warning catches it in Thai; the browser check exercises a validation error and an API failure in Thai on both a Broadcast and a News page. |
| **A status or severity value from the API has no catalog key, and now renders empty** | High | Today `cap(status)` and `severity.toUpperCase()` render *whatever the backend sent*, so an unrecognised value degrades to readable text. A bare catalog lookup would render `''` instead — `translate` returns the empty string on a miss. Every such lookup keeps an explicit fallback to the current expression (`t(key) \|\| cap(raw)`), so an unknown value still shows something. This is a behaviour change hiding inside what looks like a pure substitution. |
| Thai has no plural, so `${n} business unit${n === 1 ? '' : 's'}` collapses | Low | The Thai value simply omits the plural branch; the English value keeps it. Handled per key, not by a plural framework — this codebase has no ICU support and does not need one for two call sites. |
| Thai column headers break the frozen/sticky columns | Medium | Two full data tables here (`broadcastColumns`, `NewsManagement`). Inspect frozen columns in both languages; contract in `agent-os/standards/styling/`. |
| `useMemo` column defs freeze the old language | Medium | Standing phase-2 requirement: `t` is in the deps array. `react-hooks/exhaustive-deps` catches it and lint is a gate, but a reviewer confirms rather than assumes the linter ran. |

## Thai terminology

Proposed for the 17 new shared keys and the two entity nouns. As in slices 1 and phase 1, this is my proposal rather than a native speaker's ruling, it touches `th.ts` alone, and `git revert` undoes it without touching anything else.

| Key | English | Thai |
|---|---|---|
| `common.action.retry` | Retry | ลองใหม่ |
| `common.action.preview` | Preview | ตัวอย่าง |
| `common.field.type` | Type | ประเภท |
| `common.field.title` | Title | หัวข้อ |
| `common.field.severity` | Severity | ระดับความรุนแรง |
| `common.field.delivery` | Delivery | การส่ง |
| `common.option.all` | All | ทั้งหมด |
| `common.option.custom` | Custom | กำหนดเอง |
| `common.option.global` | Global | ทั้งระบบ |
| `common.status.published` | Published | เผยแพร่แล้ว |
| `common.status.updated` | Updated | อัปเดตแล้ว |
| `common.status.unknown` | Unknown | ไม่ทราบ |
| `common.severity.critical` | Critical | วิกฤต |
| `common.severity.warning` | Warning | คำเตือน |
| `common.severity.info` | Info | ข้อมูล |
| `common.severity.maintenance` | Maintenance | บำรุงรักษา |
| `common.state.summaryStale` | Couldn't refresh — showing the last known numbers. | รีเฟรชไม่สำเร็จ — แสดงตัวเลขล่าสุดที่ทราบ |
| `entity.broadcast` | Broadcast | ประกาศ |
| `entity.news` | News | ข่าว |

`entity.broadcast` and `entity.news` are single Thai words, so their three forms are identical in `th.ts` — the asymmetry lives only in English, which is where the Title/sentence/lower distinction comes from.

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean.
2. **All 144 test files pass with none modified** — the 64 English assertions in this slice's 6 test files are the byte-identity gate.
3. `CI=true bun run build:dev` passes.
4. **Every new `pages.broadcasts.*` / `pages.news.*` key is checked against all 227 shared values** for a duplicate, mechanically rather than by eye.
5. **Each of the 11 files is read end to end after its task**, looking specifically for the two blind spots named above — runtime-synthesised labels and `${`-initial templates. A grep is what produced the floor; only reading produces the total.
6. **The three pure helpers are called both ways**: positionally without `t` (which their frozen tests already do) and with a Thai `t`, confirming both outputs.
7. **In a browser, in Thai:** open `/broadcasts` and `/news`, confirm both list pages, both edit forms, and the compose flow render Thai; trigger a validation error on each edit form and confirm the message is Thai (proving `t` reached `validateField`); confirm no `[i18n]` warning appears in the console (proving no utility call site was missed).
8. **In a browser, at 390px, in Thai:** the two data tables' frozen columns hold.

## Out of scope

- Slices 3 through 10.
- `API Response` and any other string inside a `import.meta.env.DEV` guard.
- Backend text, including the `fields` record `parseApiError` returns.
