# i18n Phase 2 Slice 3b: Licenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the twelve remaining `licenses/` files — License Center, cluster licence tables, the purchase form, and the three shared `sections/*` cards.

**Architecture:** Every user-visible literal becomes `t('<key>')`. English values stay byte-identical; reuse from `common.*` / `entity.*` / `toast.*` is checked before any new key is added; the rest go to `pages.licenses.*`.

**Tech Stack:** React 19 + TypeScript + Vite, hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`), Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-08-28-i18n-phase2-licenses-design.md`

**Imports:** `useI18n` and `TFunction` from `src/hooks/useI18n`; `TKey` from `src/i18n/types`; `translate` from `src/i18n/translate`. A dynamic key needs `as TKey`.

## Global Constraints

- **English values byte-identical** to the literal replaced. Every string in this slice already has English, so this rule applies with no exceptions.
- **NO test file may be created or modified.** The exception slice 3a needed does not apply here: these twelve files have no test coverage of their own. All 144 must pass unmodified. **A red test means something moved that should not have — never edit a test to make it pass.**
- **Check reuse by meaning at the call site, and read the Thai value too.** Five defects across the last two branches came from an English word spelling two things — including one where the English was right and the **Thai** was the mismatch.
- **Every dynamic-key lookup enumerates the values it can receive** and confirms each has a key. A `||` fallback cannot tell you.
- **Before adding any toast-shaped key**, compose `toast.*` with an `entity.*` noun and compare. The duplicate-value script cannot see that class.
- `grep -n "const t\b"` each file first — `t` collides with existing one-letter locals.
- Never modify `src/components/ui/` or `src/components/auditColumns.tsx`. Where a table spreads `createdColumn`/`updatedColumn`, override the header at the call site with `t('common.audit.created')` / `t('common.audit.updatedDate')`.
- No `as const` on `en.ts`. `th.ts` spaces around an interpolated noun — read the rule above `toast:` in that file.
- Nothing inside `import.meta.env.DEV` gets translated; `devLog` labels stay English (settled precedent, 27 files).
- Bun: `bun run typecheck`, `bun run lint`, `bun run test`. Commit messages in Thai. Do not run the dev server — one is already running on port 3304 and is not yours.

## Every task ends by reading its files

Nine extraction blind spots are known. The list below is a floor, not a total. Each task finishes by reading its files end to end and running `grep -n "[ก-๙]"`, and reports anything found beyond the lists. The categories that have actually bitten: text already in Thai; **plain English with no key**; runtime-synthesised labels (`cap()`, `.toUpperCase()`, `className="capitalize"`); `${`-initial templates; **JSX text interrupted by an `{expression}`**; and **values that leave the app without being rendered** (a CSV column read straight off a data object).

---

### Task 1: Catalog — `pages.licenses.*`

**Files:** Modify `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:** Produces `pages.licenses.*`. Tasks 2-4 bind to it and add their own file-local keys.

- [ ] **Step 1: Create `pages.licenses` as a new child of `pages`**, sibling of `users`, `broadcasts`, `news`, `subscriptions`. Seed it with the strings that appear in **more than one** of this slice's files — those are the ones a later task would otherwise duplicate. Extract them by reading the twelve files; the per-file counts in the spec tell you where to look.

- [ ] **Step 2: Before adding any key, check it is not already in the catalog.** In order: an exact `common.*` / `entity.*` / `breadcrumb.*` value; then a value a `toast.*` template produces composed with an `entity.*` noun. Report every reuse you found this way — those are keys not created.

- [ ] **Step 3: Mirror into `th.ts`.** `Translations = typeof en` makes any asymmetry a compile error.

- [ ] **Step 4: Duplicate check**

```bash
node -e "
const s=require('fs').readFileSync('src/i18n/en.ts','utf8');
const v=[...s.matchAll(/^\s*\w+:\s*(['\"])((?:(?!\1)[^\\\\]|\\\\.)*)\1/gm)].map(m=>m[2]);
const d=[...new Set(v.filter((x,i)=>v.indexOf(x)!==i))];
console.log(d.length?'DUPLICATES: '+d.join(' | '):'no duplicates');
"
```

Expect only the documented pairs. Anything new is a key that should have been a reuse.

- [ ] **Step 5: Verify and commit.** Tests must still be **144/144** — this task binds no call site, so nothing renders differently yet.

```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): พจนานุกรม slice 3b — คีย์ร่วมของหน้าไลเซนส์"
```

---

### Task 2: License Center and the cluster licence tables

**Files:** Modify `LicenseCenter.tsx` (9), `ClusterLicenseDetail.tsx` (9), `ClusterLicenseTable.tsx` (27), plus the catalogs.

- [ ] **Step 1:** Bind every user-visible string, reusing before creating. `ClusterLicenseTable` is a data table — put `t` in the column `useMemo` deps, and override any spread audit column's header at the call site.
- [ ] **Step 2:** Check the CSV export, if any, for a column whose **value** comes straight off the data object. Slice 3a found exactly this and no text search reaches it.
- [ ] **Step 3:** Read all three files end to end; `grep -n "[ก-๙]"`; report anything beyond your list.
- [ ] **Step 4: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses src/i18n
git commit -m "feat(i18n): แปลหน้า License Center + ตารางไลเซนส์ของคลัสเตอร์"
```

---

### Task 3: The purchase surface

**Files:** Modify `LicensePurchaseForm.tsx` (34), `PurchaseLicenseTable.tsx` (32), plus the catalogs.

- [ ] **Step 1:** Bind every user-visible string.
- [ ] **Step 2: The one Thai string in this slice.** `LicensePurchaseForm.tsx` renders `ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก`. Slice 3a already keyed it as **`pages.subscriptions.numberAutoAssigned`** (`'A number is assigned automatically on save'`). **Bind to that key; do not create a new one.** If the Thai here differs from 3a's value by even a character, stop and report rather than adding a near-duplicate.
- [ ] **Step 3: Two raw-enum badges** — `PurchaseLicenseTable.tsx:386` and `:471` both render a value title-cased by `className="capitalize"`, so both stay English in Thai.

```ts
const statusLabel = useCallback((s: string) => t(`common.status.${s}` as TKey) || s, [t]);
```

  Drop `className="capitalize"` from each: the catalog values are already Title Case, so displayed English is unchanged. **Enumerate every value each badge can receive and confirm each has a key** — do not trust the fallback to tell you. If a value has no key, add one rather than leaving the fallback to carry it.
- [ ] **Step 4:** `t` in the deps of every `useMemo`/`useCallback` that closes over it. Wire `t` into every `validateField` / `parseApiError` / `getErrorDetail` call site.
- [ ] **Step 5:** Read both files end to end; `grep -n "[ก-๙]"`; report anything beyond your list.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses src/i18n
git commit -m "feat(i18n): แปลฟอร์มซื้อไลเซนส์ + ตารางใบซื้อ"
```

---

### Task 4: The three shared section cards, the hooks, and the config modules

**Files:** Modify `sections/BuQuotaSection.tsx` (38), `sections/SeatSection.tsx` (25), `sections/SubscriptionSection.tsx` (14), `useLicenseLedger.ts` (4), `useClusterSeatLicenses.ts`, `licenseKindConfig.ts` (6), `licenseDates.ts`, plus the catalogs.

**These three `sections/*` files are consumed by five call sites across three feature areas** — this slice's `ClusterLicenseDetail` and `LicensePurchaseForm`, plus `ClusterEdit.tsx` and `clusterEdit/sections/DetailsSection.tsx` (slice 7) and `clusterAdmin/ClusterAdminLicenses.tsx` (slice 4). A mistake here surfaces on three feature areas, so check every consumer renders correctly, not just this slice's two.

- [ ] **Step 1:** Bind every user-visible string in the three section cards.
- [ ] **Step 2: One raw-enum badge** — `SubscriptionSection.tsx:142`. Same treatment as Task 3 Step 3, including the enumeration and dropping `capitalize`.
- [ ] **Step 3: The hooks and config modules.** `useLicenseLedger.ts` and `licenseKindConfig.ts` hold strings. For each: if it is user-visible, it needs a key; if the module is **pure** (no hook, no component) it takes a **trailing optional `t`** shaped like `src/utils/validation.ts` — fallback plus the dev-only warning — so any frozen positional caller keeps working. If a module renders nothing user-visible, say so and change nothing. `licenseDates.ts` and `useClusterSeatLicenses.ts` measured zero strings; confirm that rather than assuming it.
- [ ] **Step 4:** Read all seven files end to end; `grep -n "[ก-๙]"`; report anything beyond your list.
- [ ] **Step 5: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses src/i18n
git commit -m "feat(i18n): แปลการ์ด section ร่วม + hooks + config ของไลเซนส์"
```

---

### Task 5: Whole-slice verification

- [ ] **Step 1: Static gates**

```bash
bun run typecheck && bun run lint && bun run test
CI=true bun run build:dev
git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep '\.test\.'
```

The last command must print **nothing**. Any test file in this slice's diff is a defect.

- [ ] **Step 2: Catalog integrity.** EN↔TH key parity, no `{{param}}` mismatch, no new duplicate value beyond the documented pairs, and no `pages.licenses.*` key duplicating what a `toast.*` template produces.

- [ ] **Step 3: Browser, in English.** `/licenses` and all four tabs, a cluster's licence detail, the purchase form. Every string byte-identical to today — this slice changes no English.

- [ ] **Step 4: Browser, in Thai.** The same screens render Thai; **zero `[i18n]` console warnings**, captured by wrapping `console.warn` before navigating.

- [ ] **Step 5: The three `sections/*` consumers outside this slice.** Open a cluster edit page and a cluster-admin licences page in Thai and confirm the shared cards render correctly there too — they are five call sites across three feature areas, and only two of them are this slice's own.

- [ ] **Step 6: Browser at 390px, both languages.** The three tables' frozen columns hold and the page body does not scroll horizontally. Measure with a same-origin iframe reading `contentWindow.innerWidth`, not the window size.

- [ ] **Step 7: Commit any fixes**

```bash
git commit -am "fix(i18n): แก้ผลตรวจ slice 3b"
```
