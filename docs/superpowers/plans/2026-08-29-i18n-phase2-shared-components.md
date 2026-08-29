# i18n Phase 2, Slice 5.5: Shared Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Translate the user-visible English in `src/components/` (excluding `ui/`), and the Thai-only strings in `src/components/analytics/DateRangeFilter.tsx`, so that shared components stop emitting mixed-language output on every page.

**Architecture:** Components use the `useI18n()` hook directly. Plain functions that cannot call a hook (`auditColumns`) take a **trailing optional `t`** and fall back to `translate('en', …)`, the pattern established by sub-project B (#171) for `validateField` / `parseApiError`.

**Tech Stack:** React 19, TypeScript, Vite, Bun. Hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`, `src/i18n/translate.ts`).

**Spec:** `docs/superpowers/specs/2026-08-29-i18n-phase2-shared-components-design.md`

**Base:** `3acd3fe` (main, after #176)

## Global Constraints

- **English byte-identity.** Every English catalog value must equal the literal it replaced, character for character. English is both the default language AND the provider-less fallback used by 144 bare-render test files.
- **No test file may change.** `git diff --name-only <base>..HEAD | grep '\.test\.'` must print nothing.
- **Never modify `src/components/ui/`.** Repo rule; out of scope entirely.
- **A shared component must never read a `pages.*` key.** It renders under many pages; borrowing one page's namespace makes an edit there silently change every other page. Use `common.*`, or `components.<name>.*` for a string specific to that component's own concern.
- **`Record<Union, TKey>` over `t(\`x.${v}\` as TKey) || v`.** The `||` form is permitted only where the value is genuinely unbounded. **An `as TKey` with no guard at all is always a defect** — `translate` returns `''` on a miss and warns only in dev.
- **Never translate a `KeyboardEvent.key` name, a DOM `tagName`, or an API enum value.** Translate the label; the value stays.
- **Thai templates must space around an interpolated parameter** (`'ลบ {{entity}} สำเร็จ'`), because parameters can carry Latin nouns. **Read the convention comment above `toast:` in `th.ts` rather than trusting any summary of it** — a previous dispatch on this programme stated it backwards from memory and shipped `กรุณากรอกCluster`.
- **`useMemo`'d column definitions must list `t` in their deps** or headers freeze on language switch.
- Reuse before creating, four rungs: an exact `common.*`/`entity.*`/`breadcrumb.*`/`error.*` value **and read its Thai**; a value a `toast.*` template *produces* composed with an `entity.*` noun; another namespace's key holding it (a promotion signal at ≥3 files AND ≥2 slices); a key meaning the same but spelling differently.
- **A promotion is a MOVE, not a copy.** Delete the old key, repoint every call site, then `tsc`. A green `tsc` is evidence for a key move only once the old key is gone.
- **Any claim about where something is used must strip comments first and check for real `import` statements.** This has been got wrong seven times on this programme.

---

### Task 1: Catalog

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

Build every key this slice needs, in one pass, before any component is touched.

- [ ] **Step 1: Extract.** Read all 15 target files (listed in Tasks 2-5) end to end and list every user-visible English string with its file:line. Read the files, do not rely on a regex dump — the extractor has ten known blind spots including multi-line JSX text, `${}` templates, strings under 6 characters, JSX text interrupted by an `{expression}`, and values that leave the app without being rendered.

- [ ] **Step 2: Classify each string** into one of four buckets and record the bucket:
  - **`common.*`** — means the same thing anywhere (`Loading...`, `Clear all`, `Select all`, `Copied to clipboard`). Prefer this.
  - **`components.<name>.*`** — specific to that component's own concern (`No XML provided`, `Already formatted`).
  - **Reuse** — an existing key already holds it. Name the key AND quote its Thai; a value whose English matches but whose Thai contradicts the new call site is the single most common defect on this programme (seven instances).
  - **Do not translate** — keyboard key name, DOM tag name, API enum value, brand name, language name. Name it and say why.

- [ ] **Step 3: Write the keys** into `en.ts` then `th.ts`. Never put `as const` on `en.ts`. Every Thai template that interpolates a noun spaces around the parameter.

- [ ] **Step 4: Verify parity and gates.**
```bash
bun run typecheck && bun run lint && bun run test
```
Catalogs must have equal key counts with no missing/extra key on either side.

- [ ] **Step 5: Commit** (Thai message, matching the branch style).

---

### Task 2: XML and markdown surfaces

**Files:**
- Modify: `src/components/DialogPreview.tsx` (13), `src/components/XmlEditor.tsx` (12), `src/components/MarkdownEditor.tsx` (4)

**Interfaces:** consumes Task 1's keys. Produces nothing other tasks depend on.

`XmlEditor` is listed in the repo's reusable-components table and falls back to a read-only Copy+Download view when `readOnly`; both branches render text. `DialogPreview` renders `<Label>` + `<Date>`/`<Lookup>` pairs — the tag names it prints are **XML element names, not prose**; leave them.

- [ ] **Step 1:** Wire each file to `useI18n()` and replace every string Task 1 classified as translatable.
- [ ] **Step 2:** Read each file end to end and confirm no user-visible English literal remains that Task 1 did not classify. Report any it missed rather than silently adding a key.
- [ ] **Step 3:** `bun run typecheck && bun run lint && bun run test` — 144 files, 1222 tests, no test file modified.
- [ ] **Step 4: Commit.**

---

### Task 3: Tenant and entitlement cards

**Files:**
- Modify: `src/components/TenantSeedCard.tsx` (11), `src/components/TenantMigrationCard.tsx` (9), `src/components/InterfaceEntitlementCard.tsx` (5)

All three render a permission-gate message (`Super-admin required.`) and a precondition message (`Configure a database pool and schema first.` / `Save the business unit first.`) — **check whether the first is byte-identical across the three files and, if so, use one `common.*` key for it.**

`TenantSeedCard.tsx:106` (`Nothing to seed. Already up to date.`) and `TenantMigrationCard.tsx:75` (`Already up to date.`) are `toast.info` no-op messages — the repo's semantic level for "nothing happened". Keep the level; translate the text.

Both cards render `'Checking...' : 'Re-check status' : 'Check status'` — a three-way button label. Note the ellipsis form (`...` ASCII vs `…` U+2026) and preserve exactly what is there; the catalog already distinguishes `common.busy.loading` from `common.busy.loadingEllipsis` for this reason.

- [ ] **Step 1:** Wire to `useI18n()`, replace the classified strings.
- [ ] **Step 2:** Read end to end; report anything Task 1 missed.
- [ ] **Step 3:** Gates as Task 2.
- [ ] **Step 4: Commit.**

---

### Task 4: Pickers, multi-selects and image upload

**Files:**
- Modify: `src/components/BusinessUnitMultiSelect.tsx` (6), `src/components/UserMultiSelect.tsx` (6), `src/components/UserPicker.tsx` (5), `src/components/PermissionPicker.tsx` (1), `src/components/ImageUpload.tsx` (4)

**Verified false positives in this group — do NOT translate:**
`UserMultiSelect.tsx:57,60` (`'Backspace'`, `'Escape'`) and `UserPicker.tsx:75` (`'Escape'`) are `KeyboardEvent.key` comparisons. `ImageUpload.tsx:122` (`'Enter'`) is the same. Translating any of these breaks the handler silently, and no test covers it.

**`ImageUpload.tsx` — `aria-label="Upload image"` at `:117` translates normally.**

`alt="News"` at `:100` and `:169` needs a judgment, and the judgment rests on a fact worth checking
yourself: **`ImageUpload` has exactly one real importer, `src/pages/NewsEdit.tsx:319`** (verified by
import statement; the two other grep hits are comments). So the alt text is accurate today — this is
a latent trap, not a live bug, and an earlier draft of this plan called it a live bug by assuming the
component was generic without counting its callers.

Translate it under a `components.imageUpload.*` key, and add a comment naming the single caller and
saying that a second caller would make this an `alt` prop. Do **not** add the prop now — one caller
does not justify the API, and speculative generality is its own defect.

`UserMultiSelect.tsx:126` and `UserPicker.tsx:171` both render `No users match …` / `Type to search users` as a ternary — two strings each, not one.

- [ ] **Step 1:** Wire to `useI18n()`, replace the classified strings, leave every key name alone.
- [ ] **Step 2:** Handle the `ImageUpload` `alt` prop as described.
- [ ] **Step 3:** Read end to end; report anything Task 1 missed.
- [ ] **Step 4:** Gates as Task 2.
- [ ] **Step 5: Commit.**

---

### Task 5: Audit metadata, route guards, and the analytics date filter

**Files:**
- Modify: `src/components/AuditMeta.tsx` (3), `src/components/auditColumns.tsx` (2), `src/components/PrivateRoute.tsx` (2), `src/components/ClusterAdminRoute.tsx` (2), `src/components/AuthedRoute.tsx` (1), `src/components/analytics/DateRangeFilter.tsx` (5 Thai)

This task has three different shapes. Do not treat them alike.

**5a — `AuditMeta.tsx` is a component: free.** It renders `Unknown user`, `Created`, `Updated`. It can call `useI18n()` itself, so **all 26 of its importers stay untouched.**

**5b — `auditColumns.tsx` is a plain function: it cannot call a hook.** It returns `ColumnDef` objects with `header: 'Created'` / `header: 'Updated'`. Give `AuditColumnsOptions` a **trailing optional `t`**, exactly as sub-project B did for `validateField`:

```ts
const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
```

plus the dev-only warning gated on `document.documentElement.lang === 'th'` — three parts, not two. Read `src/utils/validation.ts` for the exact shape before writing it.

It has **13 real importers** (verified by import statement, comments stripped):
```
RoleManagement · BusinessUnitManagement · ClusterManagement · DatabasePoolManagement
UserManagement · ReportTemplateManagement · ApplicationManagement
clusterAdmin/BusinessUnitList · clusterAdmin/MembersTable
licenses/SubscriptionTable · licenses/ClusterLicenseTable · licenses/PurchaseLicenseTable
broadcastManagement/broadcastColumns
```
**Wire `t` only at the callers whose page is already translated** (the clusterAdmin, licenses, broadcast, user and business-unit ones). The rest keep English by not passing `t`, and their own slice wires them later. This is the same 11-wired/151-deferred split sub-project B used, and it is why the parameter is optional.

Where a caller already overrides `header` to work around the untranslated column (`BusinessUnitManagement.tsx` does), **remove the now-redundant override** — but only after confirming the catalog value is byte-identical to the override it replaces.

Any caller you wire must have `t` in its `useMemo` deps, or the header freezes on language switch.

**5c — `analytics/DateRangeFilter.tsx` is the reverse direction.** It has **no English at all**; its labels are Thai and English users read Thai today:
```
101  setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
105  setError(`เลือกได้สูงสุด ${MAX_RANGE_DAYS} วัน`)
115  <Label htmlFor="range-preset">ช่วงวัน</Label>
131  <Label htmlFor="range-from">ตั้งแต่</Label>
139  <Label htmlFor="range-to">ถึง</Label>
```
Byte-identity does not apply here because there is no prior English to preserve. **The English you write is new copy.** List every English string you invent in your report, separately, flagged for review as copy rather than as a translation. Keep the Thai exactly as it reads today. Also read the rest of the file — the preset labels and the `describeRange` output are Thai too and are easy to miss because they are built at runtime.

- [ ] **Step 1:** 5a — wire `AuditMeta` to the hook.
- [ ] **Step 2:** 5b — add the optional `t` to `auditColumns`, wire the already-translated callers, remove redundant header overrides.
- [ ] **Step 3:** 5c — translate `DateRangeFilter` in both directions; list the new English separately.
- [ ] **Step 4:** Route guards — `PrivateRoute`, `ClusterAdminRoute`, `AuthedRoute` render `Loading...` five times between them. One `common.busy.*` key; check whether the existing one uses `...` or `…` and match the source.
- [ ] **Step 5:** Gates as Task 2, plus: `grep -n "[ก-๙]"` across every file this slice touched leaves only comments.
- [ ] **Step 6: Commit.**

---

## Whole-slice verification (controller)

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **144 test files pass with none modified.**
3. Catalog parity equal, zero dead keys among the keys this slice added.
4. **Both sweeps clean**: no rendered Thai outside comments in the touched files, AND every remaining English-extractor hit in `src/components/` is a verified false positive named in a report.
5. Every keyboard-key, DOM-tag and enum-value site named in the report as deliberately untranslated.
6. **In a browser, in Thai:** a page carrying each of the five largest components. Zero `[i18n]` console warnings.
7. **In a browser, in English:** the same screens byte-identical, and the analytics date filter now reads English where it read Thai.
