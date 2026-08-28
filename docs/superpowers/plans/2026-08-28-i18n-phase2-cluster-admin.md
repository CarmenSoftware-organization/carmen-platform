# i18n Phase 2 Slice 4: Cluster Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate `src/pages/clusterAdmin/` — 25 files, 232 English strings, no Thai.

**Architecture:** Every user-visible literal becomes `t('<key>')`. English stays byte-identical. Reuse from the existing 738-key catalog is checked before any new key; the rest go to `pages.clusterAdmin.*`.

**Tech Stack:** React 19 + TypeScript + Vite, hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`), Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-08-28-i18n-phase2-cluster-admin-design.md`

**Imports:** `useI18n` and `TFunction` from `src/hooks/useI18n`; `TKey` from `src/i18n/types`; `translate` from `src/i18n/translate`.

## Global Constraints

- **English values byte-identical** to the literal replaced. Every string here already has English.
- **NO test file may be created or modified.** `src/pages/clusterAdmin/` has **zero** test files, so `git diff --name-only | grep '\.test\.'` must print nothing. All 144 must pass. **A red test means something moved that should not have — never edit a test.**
- **Use a typed map, not a string fallback.** For a closed union:

  ```ts
  const ROLE_KEY: Record<Role, TKey> = { admin: 'common.role.admin', user: 'common.role.user' };
  t(ROLE_KEY[role])          // a missing case is a COMPILE ERROR
  ```

  Keep `t(\`x.${v}\` as TKey) || v` only where the value is genuinely unbounded from the backend. The `||` exists solely because a template-literal key cannot be typed; a `Record` can be, and that turns a silent fallback into a compiler check.
- **Reuse before creating, checked four ways** — an exact `common.*`/`entity.*`/`breadcrumb.*`/`error.*` value (**and read its Thai**, not only its English); a value a `toast.*` template produces composed with an `entity.*` noun (the duplicate script cannot see this class); a value another slice's `pages.*` holds, which is a **promotion signal** (promote at ≥3 files AND ≥2 slices, otherwise leave split and say why); and a key that means the same thing but spells differently, which only reading call sites finds.
- `t` in the deps of every `useMemo`/`useCallback` that closes over it.
- Where a table spreads `createdColumn`/`updatedColumn`, **override both headers at the call site** with `t('common.audit.created')` / `t('common.audit.updatedDate')`. **Never modify `src/components/auditColumns.tsx`.**
- Never modify `src/components/ui/`. No `as const` on `en.ts` — but **`as const` on a role/status array in a page file stays**, because it is what narrows the union enough to build a `Record<Union, TKey>`.
- Nothing inside `import.meta.env.DEV` gets translated; `devLog` labels stay English (settled precedent, 27 files).
- Bun: `bun run typecheck`, `bun run lint`, `bun run test`. Commit messages in Thai. Do not run the dev server — one is already running on port 3304 and is not yours.

## The string counts are a floor

Nine blind spots are known and each task ends by reading its files end to end plus `grep -n "[ก-๙]"`. The ones that have actually shipped defects: plain English with no key; **module-scope const arrays holding user-visible strings**, which cannot call `t` at all; runtime-synthesised labels (`cap()`, `.toUpperCase()`, `className="capitalize"`); `${`-initial templates; **JSX text interrupted by an `{expression}`**; and **values that leave the app without being rendered** — a CSV column read straight off a data object, found three times now.

**And a rule about claims**: any statement about where a string or component is used must **strip comments first**. Twice on the previous branch a claim was made by counting raw grep hits — once conflating comments with imports, once conflating comments with rendered strings, the second while correcting the first.

---

### Task 1: Catalog — `pages.clusterAdmin.*`

**Files:** Modify `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:** Produces `pages.clusterAdmin.*` plus any promotions. Tasks 2-5 bind to it.

- [ ] **Step 1: Seed the cross-file strings.** Read the 25 files and create `pages.clusterAdmin` as a new child of `pages` holding the strings that appear in **more than one** of them. A string used by one file belongs to that file's task.

- [ ] **Step 2: Role labels.** Three files declare `['admin', 'user'] as const` (`InviteUserDialog.tsx:22,23`, `MembersTable.tsx:23`) and render those values directly. Check whether `common.role.*` or similar already exists; if not, create keys for `admin` and `user` **once**, shared by all three. The array values themselves are API values and are never translated.

- [ ] **Step 3: Run the reuse ladder** for every candidate before adding it, and report each reuse you found — those are keys not created. Report any promotion signal with its file and slice count.

- [ ] **Step 4: Mirror into `th.ts`.** `Translations = typeof en` makes asymmetry a compile error.

- [ ] **Step 5: Duplicate check**

```bash
node -e "
const s=require('fs').readFileSync('src/i18n/en.ts','utf8');
const v=[...s.matchAll(/^\s*\w+:\s*(['\"])((?:(?!\1)[^\\\\]|\\\\.)*)\1/gm)].map(m=>m[2]);
const d=[...new Set(v.filter((x,i)=>v.indexOf(x)!==i))];
console.log(d.length?'DUPLICATES: '+d.join(' | '):'no duplicates');
"
```

Then compose every `toast.*` template with every `entity.*` noun and confirm none produces one of your new values.

- [ ] **Step 6: Verify and commit.** Tests must still be **144/144** — this task binds no call site, so nothing renders differently yet, and a red test means you changed something you should not have.

```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): พจนานุกรม slice 4 — คีย์ร่วมของหน้า cluster admin"
```

---

### Task 2: Business units — list and form

**Files:** `BusinessUnitList.tsx` (41), `BusinessUnitForm.tsx` (41), plus the catalogs.

- [ ] **Step 1:** Bind every user-visible string, reusing before creating.
- [ ] **Step 2: The CSV export.** `BusinessUnitList.tsx:20,195,204`. Both the column **labels** and any column **value** read straight off the data object need handling — the value case has shipped untranslated three times now and no text search reaches it, because the string never appears in the source. Follow the data path.
- [ ] **Step 3:** `t` in the column `useMemo` deps; override both spread audit headers at the call site.
- [ ] **Step 4:** Wire `t` into every `validateField` / `parseApiError` / `getErrorDetail` call site.
- [ ] **Step 5:** Read both files end to end; `grep -n "[ก-๙]"`; report anything beyond your list.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/clusterAdmin src/i18n
git commit -m "feat(i18n): แปลรายการและฟอร์มหน่วยธุรกิจของ cluster admin"
```

---

### Task 3: People — members, invitations, invite dialog

**Files:** `MembersTable.tsx` (14), `InvitationsTable.tsx` (17), `InviteUserDialog.tsx` (23), `ClusterUsers.tsx` (8), `ClusterPeopleCard.tsx` (7), plus the catalogs.

This task owns **six of the slice's nine enumerated hazard sites**.

- [ ] **Step 1: The three module-scope role constants.** `InviteUserDialog.tsx:22,23` and `MembersTable.tsx:23` declare `['admin', 'user'] as const` and render the values. Separate the two jobs: the array keeps its API values and its `as const`, and a `Record<Role, TKey>` built from Task 1's keys supplies the label. **Do not wrap `t()` around the array** — a module-scope const cannot call `t` at all.
- [ ] **Step 2: The raw-enum labels** at `InvitationsTable.tsx:23,113,123`, `InviteUserDialog.tsx:25`, `MembersTable.tsx:113,139`. Each renders a value title-cased by CSS or `.toUpperCase()`, so each stays English in Thai. Use a `Record<Union, TKey>`, drop `className="capitalize"` where the catalog value is already Title Case, and **enumerate every value each site can receive** — find the union in `src/types/index.ts` and confirm each member has a key.
- [ ] **Step 3:** Bind the remaining strings across all five files.
- [ ] **Step 4:** `t` in the deps of every `useMemo`/`useCallback`; wire `t` into every utility call site.
- [ ] **Step 5:** Read all five files end to end; `grep -n "[ก-๙]"`.
- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/clusterAdmin src/i18n
git commit -m "feat(i18n): แปลสมาชิก คำเชิญ และกล่องเชิญผู้ใช้"
```

---

### Task 4: The business-unit form's sub-cards

**Files:** `businessUnitForm/ClusterBuDocument.tsx` (21), `AddressBlock.tsx` (13), `BuPropertyPlate.tsx` (5), `SeatMeter.tsx` (9), `ClusterBuTabs.tsx`, `formatAddress.ts`, plus the catalogs.

- [ ] **Step 1: `BuPropertyPlate.tsx:60`** is the slice's last raw-enum site — same treatment as Task 3 Step 2.
- [ ] **Step 2: `formatAddress.ts`** is a pure module. If it returns user-visible text it takes a **trailing optional `t`** shaped exactly like `src/utils/validation.ts` — the `const tr: TFunction = t ?? …` line **plus the dev-only warning**. That shape has three parts; an earlier slice shipped helpers with only two. If it returns nothing user-visible, say so and change nothing — confirm by reading, not by trusting a count.
- [ ] **Step 3:** Bind the remaining strings. `SeatMeter.tsx` mentions `ไม่จำกัด` **in a comment only** — leave the comment alone and do not treat it as a string.
- [ ] **Step 4:** Read all six files end to end; `grep -n "[ก-๙]"`.
- [ ] **Step 5: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/clusterAdmin src/i18n
git commit -m "feat(i18n): แปลการ์ดย่อยของฟอร์มหน่วยธุรกิจ"
```

---

### Task 5: Entry, profile, licences and the remaining cards

**Files:** `ClusterAdminEntry.tsx` (5), `ClusterProfile.tsx` (16), `ClusterAdminLicenses.tsx` (6), `ClusterBusinessUnitsCard.tsx` (5), `ClusterAccessLost.tsx` (2), `CapacityStrip.tsx` (9), `AllocationTicks.tsx`, `SummaryCardHeader.tsx`, `licenses/QuotaLedgerCard.tsx` (24), `licenses/SeatsByBuTable.tsx` (12), `licenses/BuRankingCard.tsx` (11), `licenses/CollapsibleGroupCard.tsx`, plus the catalogs.

- [ ] **Step 1:** Bind every user-visible string across all twelve files, reusing before creating. The `licenses/*` cards sit next to slice 3b's work — check `pages.licenses.*` for an existing key before adding one, and report any promotion signal.
- [ ] **Step 2:** `SeatsByBuTable` and `QuotaLedgerCard` are tables — `t` in their `useMemo` deps, both spread audit headers overridden at the call site, and check for a CSV export.
- [ ] **Step 3:** Read all twelve files end to end; `grep -n "[ก-๙]"`.
- [ ] **Step 4: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/clusterAdmin src/i18n
git commit -m "feat(i18n): แปลหน้าเข้าคลัสเตอร์ โปรไฟล์ และการ์ดไลเซนส์"
```

---

### Task 6: Whole-slice verification

- [ ] **Step 1: Static gates**

```bash
bun run typecheck && bun run lint && bun run test
CI=true bun run build:dev
git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep '\.test\.'
```

The last command must print **nothing**.

- [ ] **Step 2: All nine hazard sites accounted for** — three CSV, six raw-enum, three module-const. Name each and what was done.

- [ ] **Step 3: Catalog integrity.** EN↔TH parity, no `{{param}}` mismatch, no new duplicate value beyond the documented pairs, and no `pages.clusterAdmin.*` key duplicating what a `toast.*` template produces.

- [ ] **Step 4: Browser, in Thai.** The cluster-admin entry, business unit list and form, members and invitations, licences and quota cards. **Zero `[i18n]` console warnings**, captured by wrapping `console.warn` before navigating.

- [ ] **Step 5: Browser, in English.** The same screens, byte-identical to today, with **zero Thai characters** on the page.

- [ ] **Step 6: Browser at 390px, both languages.** The tables' frozen columns hold; the page body does not scroll horizontally. Measure with a same-origin iframe reading `contentWindow.innerWidth`.

- [ ] **Step 7: Commit any fixes**

```bash
git commit -am "fix(i18n): แก้ผลตรวจ slice 4"
```
