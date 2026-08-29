# i18n Phase 2 Slice 5: Business Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the platform's Business Unit list and edit surfaces — 18 files, 219 English strings, no Thai.

**Architecture:** Every user-visible literal becomes `t('<key>')`. English stays byte-identical, enforced by 48 existing test assertions. Reuse from the ~940-key catalog is checked before any new key; the rest go to `pages.businessUnits.*`.

**Tech Stack:** React 19 + TypeScript + Vite, hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`), Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-08-29-i18n-phase2-business-units-design.md`

**Imports:** `useI18n` and `TFunction` from `src/hooks/useI18n`; `TKey` from `src/i18n/types`; `translate` from `src/i18n/translate`.

## Global Constraints

- **English values byte-identical** to the literal replaced. **Seven test files carry 48 text assertions, all against English** — so this is checked, not merely asserted. `BusinessUnitLicensesCard.test.tsx:61` asserting `'22 days left'` against a string this slice translates is the most informative of them.
- **NO test file may be created or modified.** `git diff --name-only | grep '\.test\.'` must print nothing. All 144 must pass. **A red test means the English drifted — fix the catalog, never the test.**
- **Never read another slice's `pages.*` namespace.** Promote if it clears **≥3 files AND ≥2 slices**, otherwise give `pages.businessUnits` its own key with the Thai copied verbatim and a comment naming the sibling. Slice 4 shipped seven cross-namespace reads and had to convert every one: an edit to one slice's page silently changing another's is invisible at both ends.
- **Reuse before creating, four rungs** — an exact `common.*`/`entity.*`/`breadcrumb.*`/`error.*` value **with its Thai read**; a value a `toast.*` template *produces* composed with an `entity.*` noun (no script sees this class); another slice's `pages.*` holding it (a promotion signal); a key meaning the same but spelling differently.
- **Never store translated text in state, fetched data, or a ref.** The precise form: dangerous when *nothing forces a recompute*. `setError`/`setFieldErrors` are the app-wide CLAUDE.md pattern and are excluded — they are overwritten by the user's next interaction. A value fetched once and kept is not.
- **For a closed union use `Record<Union, TKey>`** so a missing case is a compile error. Keep `t(\`x.${v}\` as TKey) || v` only where the value is genuinely unbounded from the backend, and **never leave an `as TKey` without a guard** — `translate` returns `''` on a miss and warns only in dev, so a drift ships a blank string with no production signal.
- **Check what you are looking at before building a map.** One of slice 4's listed hazard sites turned out to be an avatar initial, not an enum. These sweeps are regex-based and produce false positives.
- `t` in the deps of every `useMemo`/`useCallback` that closes over it.
- Where a table spreads `createdColumn`/`updatedColumn`, **override both headers at the call site**. Never modify `src/components/auditColumns.tsx` or `src/components/ui/`.
- No `as const` on `en.ts` — but `as const` on a union array in a page file **stays**; it is what makes a `Record<Union, TKey>` possible.
- Nothing inside `import.meta.env.DEV` gets translated; `devLog` labels stay English.
- **Any claim about where a string is used must strip comments first.**
- Bun: `bun run typecheck`, `bun run lint`, `bun run test`. Commit messages in Thai. Do not run the dev server — one is already running on port 3304 and is not yours.

## The counts are a floor

Ten blind-spot categories are known. Each task ends by reading its files end to end plus `grep -n "[ก-๙]"`, and reports anything beyond its list. The ones that have produced real defects: **a value that leaves the app without being rendered** (four times, most recently a CSV writing raw `true`/`false`); plain English with no key; module-scope constants holding labels, in **array and `Record`-of-objects shapes**; translated text stored in state; runtime-synthesised labels; `${`-initial templates; **JSX text interrupted by an `{expression}`**; strings under six characters.

---

### Task 1: Catalog — `pages.businessUnits.*`

**Files:** Modify `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:** Produces `pages.businessUnits.*` plus any promotions. Tasks 2-4 bind to it.

- [ ] **Step 1: Seed the cross-file strings.** Read the 18 files and create `pages.businessUnits` as a new child of `pages` holding the strings used by **more than one**. A string used once belongs to that file's task.

- [ ] **Step 2: Run the four-rung reuse ladder** on every candidate before adding it. Report every reuse found — those are keys not created — and every promotion signal with its file and slice counts.

- [ ] **Step 3: Mirror into `th.ts`.** `Translations = typeof en` makes asymmetry a compile error.

- [ ] **Step 4: Duplicate check**

```bash
node -e "
const s=require('fs').readFileSync('src/i18n/en.ts','utf8');
const v=[...s.matchAll(/^\s*\w+:\s*(['\"])((?:(?!\1)[^\\\\]|\\\\.)*)\1/gm)].map(m=>m[2]);
const d=[...new Set(v.filter((x,i)=>v.indexOf(x)!==i))];
console.log(d.length?'DUPLICATES: '+d.join(' | '):'no duplicates');
"
```

Then compose every `toast.*` template with every `entity.*` noun and confirm none produces one of your new values.

- [ ] **Step 5: Verify and commit.** Tests must still be **144/144** — this task binds no call site, so a red test means you changed something you should not have.

```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): พจนานุกรม slice 5 — คีย์ร่วมของหน้าหน่วยธุรกิจ"
```

---

### Task 2: `BusinessUnitManagement.tsx` — the list

**Files:** `BusinessUnitManagement.tsx` (58), `businessUnitManagement/BuSummary.tsx` (6), plus the catalogs.

This task owns **all three CSV hazard sites**.

- [ ] **Step 1:** Bind every user-visible string, reusing before creating.
- [ ] **Step 2: The CSV export** at `BusinessUnitManagement.tsx:20,224,235`. Two separate things need handling and only one is obvious — the column **labels**, and a column **value** read straight off the data object. The value case has shipped untranslated **four times across four branches**, most recently exporting raw `true`/`false` into a file users open. **Look at what `generateCSV` receives, not at what the JSX shows.** Slice 4's `BusinessUnitList.tsx` and slice 3a's `SubscriptionTable.tsx` both fixed it by mapping the value in the pre-built rows array; follow that shape.
- [ ] **Step 3:** `t` in the column `useMemo` deps; override both spread audit headers at the call site.
- [ ] **Step 4:** Wire `t` into every `validateField` / `parseApiError` / `getErrorDetail` call site.
- [ ] **Step 5:** Read both files end to end; `grep -n "[ก-๙]"`; report anything beyond your list.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/BusinessUnitManagement.tsx src/pages/businessUnitManagement src/i18n
git commit -m "feat(i18n): แปลรายการหน่วยธุรกิจ + แถบสรุป"
```

---

### Task 3: The edit shell and its document card

**Files:** `BusinessUnitEdit.tsx` (28), `businessUnitEdit/BusinessUnitDocument.tsx` (48), `BusinessUnitTabs.tsx`, `HeroName.tsx` (3), `InlineField.tsx` (5), `shared.tsx` (1), `BusinessUnitDebugSheet.tsx` (3), plus the catalogs.

- [ ] **Step 1: Two runtime-synthesised labels** at `BusinessUnitDocument.tsx:139,146`. Each renders a value title-cased by CSS or `.toUpperCase()`, so each stays English in Thai. **First check what is actually being upper-cased** — one of slice 4's listed sites was an avatar initial and a map there would have been fiction. If it is a real closed union, use a `Record<Union, TKey>`, drop `className="capitalize"` where the catalog value is already Title Case, and enumerate every value the site can receive from its union in `src/types/index.ts`.
- [ ] **Step 2:** `InlineField.tsx` and `shared.tsx` are shared within this surface — check whether anything outside `businessUnitEdit/` imports them (**by reading the `import` lines, not by counting grep hits**) and say what you found.
- [ ] **Step 3:** Bind every user-visible string across all seven files. `BusinessUnitDebugSheet.tsx` content is dev-only — leave it English.
- [ ] **Step 4:** `t` in the deps of every `useMemo`/`useCallback`; wire `t` into every utility call site.
- [ ] **Step 5:** Read all seven files end to end; `grep -n "[ก-๙]"`.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/BusinessUnitEdit.tsx src/pages/businessUnitEdit src/i18n
git commit -m "feat(i18n): แปลหน้าแก้ไขหน่วยธุรกิจ + การ์ดเอกสาร"
```

---

### Task 4: The cards and the configuration sections

**Files:** `businessUnitEdit/BusinessUnitUsersCard.tsx` (36), `BusinessUnitLicensesCard.tsx` (8), `BusinessUnitBrandingCard.tsx` (6), `useBusinessUnitUsers.ts` (6), `types.ts` (5), and `businessUnitEdit/sections/` — `ConfigurationSection.tsx` (21), `CalculationSettingsSection.tsx` (17), `DatabaseConnectionSection.tsx` (14), `NumberFormatsSection.tsx` (6) — plus the catalogs.

- [ ] **Step 1: Three runtime-synthesised labels** at `BusinessUnitUsersCard.tsx:114,182,298`. Same treatment as Task 3 Step 1, including checking what is being upper-cased before building any map.
- [ ] **Step 2: `BusinessUnitLicensesCard.tsx` is the slice's sharpest byte-identity test.** `BusinessUnitLicensesCard.test.tsx:61` asserts `'22 days left'` against a hardcoded string at `BusinessUnitLicensesCard.tsx:52`. That assertion must keep passing untouched, which happens if and only if your English is byte-identical. Check `common.state.daysLeft` — slice 4 promoted a `{{count}} days left` key — and **reuse it if the rendered output matches exactly**; if it does not, say precisely how it differs before adding anything.
- [ ] **Step 3: `useBusinessUnitUsers.ts` and `types.ts`.** A hook may call `useI18n()` directly. A pure module takes a **trailing optional `t`** shaped exactly like `src/utils/validation.ts` — the `const tr: TFunction = t ?? …` line **plus the dev-only warning**; that shape has three parts and an earlier slice shipped helpers with only two. If a module renders nothing user-visible, say so and change nothing — confirm by reading.
- [ ] **Step 4:** Bind every string across all nine files. Two of the `sections/` files have their own test files — those must stay untouched and green.
- [ ] **Step 5:** Read all nine files end to end; `grep -n "[ก-๙]"`.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/businessUnitEdit src/i18n
git commit -m "feat(i18n): แปลการ์ดผู้ใช้ ไลเซนส์ แบรนด์ และ section ตั้งค่า"
```

---

### Task 5: Whole-slice verification

- [ ] **Step 1: Static gates**

```bash
bun run typecheck && bun run lint && bun run test
CI=true bun run build:dev
git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep '\.test\.'
```

The last command must print **nothing**.

- [ ] **Step 2: All eight hazard sites accounted for** — three CSV, five runtime-synthesised — each named with what was done, including any judged a false positive.

- [ ] **Step 3: Catalog integrity.** EN↔TH parity, no `{{param}}` mismatch, no new duplicate value beyond the documented pairs, no `pages.businessUnits.*` key duplicating what a `toast.*` template produces, and **no read of another slice's `pages.*`**.

- [ ] **Step 4: Browser, in Thai.** The BU list, the BU edit page and every tab and card. **Zero `[i18n]` console warnings**, captured by wrapping `console.warn` before navigating.

- [ ] **Step 5: Browser, in English.** The same screens, **zero Thai characters**, and the strings unchanged from today.

- [ ] **Step 6: Browser at 390px, both languages.** The list's frozen columns hold; the page body does not scroll horizontally. Measure with a same-origin iframe reading `contentWindow.innerWidth`.

- [ ] **Step 7: Commit any fixes**

```bash
git commit -am "fix(i18n): แก้ผลตรวจ slice 5"
```
