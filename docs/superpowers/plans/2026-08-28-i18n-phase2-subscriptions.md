# i18n Phase 2 Slice 3a: Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the eight Subscription files, and unify the language of a feature that currently renders 40 user-visible strings in Thai only.

**Architecture:** Every user-visible literal becomes `t('<key>')`. Already-English strings bind byte-identically. For the 40 Thai-only strings English is **authored** and the Thai is kept verbatim — so four test files that assert those Thai strings must move to the authored English, at exactly 30 lines.

**Tech Stack:** React 19 + TypeScript + Vite, hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`), Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-08-28-i18n-phase2-subscriptions-design.md`

**Imports the tasks rely on:** `useI18n` and `TFunction` from `src/hooks/useI18n`; `TKey` from `src/i18n/types`; `translate` from `src/i18n/translate`. A dynamic key needs `as TKey` — `TKey` is a union of literal paths.

## Global Constraints

- **Already-English values are byte-identical** to the literal they replace. 144 test files depend on it.
- **Test files change only under the three rules below.** Everything else about the no-test-edits rule still holds.
  1. Only an assertion whose subject is one of the 40 already-Thai strings may change, from the Thai literal to the authored English.
  2. Exactly **34 changed lines in 5 files**: `SeatsCard.test.tsx` 15, `SubscriptionTable.test.tsx` 9, `SubscriptionSummary.test.tsx` 5, `SubscriptionForm.test.tsx` 3, `SubscriptionInfoCard.test.tsx` 2. The last file was originally excluded because its **Thai** is in fixtures — true, and irrelevant: lines 53 and 55 assert an **English raw enum**, a category the exception list never considered. **Assign a line by which component renders the string it asserts, not by which file it lives in** — `SubscriptionTable.test.tsx:147-151` assert strings rendered by the embedded `SubscriptionSummary`, so they belong to Task 6, not Task 2. Lines 137-138 assert the raw state enum and belong to Task 2's badge fix. Four Thai assertion lines **stay**, each for a reason: `SeatsCard.test.tsx:45` and `SubscriptionForm.test.tsx:343` search for `ไม่จำกัด`, a 3b string; `SubscriptionForm.test.tsx:415` searches for a string in `src/hooks/useAllClusters.ts`, outside this slice; `SeatsCard.test.tsx:104` searches for `ปิดใช้งานหรือถูกลบ`, which exists nowhere in the source and is already a vacuous assertion — report it, leave it. `featureSelection.test.ts`, `buildAdvance.test.ts` and `SubscriptionInfoCard.test.tsx` hold Thai in **fixtures** and do **not** change.
  3. **Negative assertions change too.** `queryByText(/รอตอบรับ/).toBeNull()` and `queryByText('ที่นั่ง')).toBeNull()` keep passing after translation because the Thai can no longer appear — passing for the wrong reason, and staying green is exactly why nobody revisits them. Change every assertion whose subject is one of the 40, positive or negative.
  4. No assertion is deleted, weakened, or turned into a looser regex. If the authored English cannot satisfy it, the English is wrong.
- **Each task leaves the suite green.** A task that translates a string edits the assertions that string breaks, in the same commit.
- **Every dynamic-key lookup enumerates the values it can receive** and confirms each has a key. A `||` fallback cannot tell you — that is how slice 2 shipped a permanently-English `Draft`.
- **Check reuse by meaning, not by spelling.** Four defects on the last branch came from an English word that spells two different things (`theme.system`, `common.field.type`, two column headers).
- **Before adding a toast-shaped key**, compose `toast.*` with an `entity.*` noun and compare. The duplicate-value script cannot catch this — the collision is with a value a template *produces*.
- **`grep -n "const t\b"`** each file first; `t` collides with existing one-letter locals.
- Never modify `src/components/ui/`. No `as const` on `en.ts`. `th.ts` spaces around an interpolated noun — read the rule above `toast:` in that file.
- Nothing inside `import.meta.env.DEV` gets translated (`<DevDebugSheet>` props).
- Bun: `bun run typecheck`, `bun run lint`, `bun run test`. Commit messages in Thai.

## The extraction is a floor, not a total

Eight blind-spot categories are known, the newest being **JSX text interrupted by an `{expression}`** — which cost a 26% undercount on this very slice. Each task therefore **ends by reading its files end to end** and running `grep -n "[ก-๙]"`. Report anything found beyond the lists below rather than silently adding or silently skipping it.

---

### Task 1: Catalog — shared keys, page keys, and the authored English strings

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Produces: `pages.subscriptions.*` and the shared additions below. Tasks 2-6 bind to these by name and add only their own file-local keys.

Authoring all 40 English strings in one task is deliberate: register consistency across them is the thing no later reviewer can restore.

- [ ] **Step 1: Create `pages.subscriptions` in `en.ts`** as a new child of `pages`, with the Thai-origin strings

```ts
subscriptions: {
  // --- authored English for strings that existed only in Thai ---
  detailsTitle: 'Subscription details',
  purchasedModules: 'Purchased modules',
  seats: 'Seats',
  searchNumber: 'Search subscription number',
  clearClusterFilter: 'Clear cluster filter',

  // FeatureSelectionCard
  featuresLoadFailed: "Couldn't load the feature list",
  featuresLoadFailedHint: "Features can't be edited right now. Try again.",
  featuresLoading: 'Loading features…',
  unrecognisedDisabled: 'Unrecognised (disabled) ({{count}})',
  removeUnrecognised: 'Remove unrecognised feature {{key}}',
  disabledStillAttached: 'These features are disabled system-wide but are still attached to this subscription.',
  disabledMustRemove: 'These features are disabled system-wide — remove them before the subscription\'s features can be saved.',
  noFeaturesAssigned: 'No features assigned to {{target}} yet',
  thisSubscription: 'this subscription',
  searchFeaturesPlaceholder: 'Search modules or features...',
  searchFeatures: 'Search features',
  clearSearch: 'Clear search',
  noFeaturesDefined: 'No features defined in the system yet',
  noFeaturesMatch: 'No features match “{{query}}”',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  clearAllIn: 'Clear all in {{module}}',
  selectAllIn: 'Select all in {{module}}',
  none: 'None',
  selectedCount: '{{count}} selected',

  // SeatsCard
  pendingCount: '{{count}} pending',
  upTo: '→ up to {{projected}}/{{cap}}',
  noBusinessUnitLinked: "This subscription isn't linked to any business unit",
  purchasedCount: '{{count}} purchased',
  capEditedOnBuPage: 'The cap is edited on the business unit page',
  editCap: 'Edit cap',
  seatsPoolNote: 'Seats are a cluster-wide pool — business units outside this subscription contribute to it too, so the purchased count above need not equal the total cap ({{cap}}).',

  // SubscriptionInfoCard
  selectClusterFirst: 'Select a cluster first',
  clusterHasNoBu: 'This cluster has no business units — create one before issuing a subscription',
  numberAutoAssigned: 'A number is assigned automatically on save',
},
```

Seven of the 40 need **no new key** — they already exist in English and must reuse, not duplicate:

| Thai | Existing key | English |
|---|---|---|
| `ทั้งหมด` | `common.option.all` | All |
| `ใช้งาน` | `common.status.active` | Active |
| `หมดอายุ` | `common.status.expired` | Expired |
| `ลบแล้ว` | `common.status.deleted` | Deleted |
| `ลองใหม่` | `common.action.retry` | Retry |

`ใกล้หมดอายุ` binds to `Expiring soon`, which `SubscriptionTable.tsx` already renders in English — Task 6 gets it from `pages.subscriptions.expiringSoon`, created in Task 2.

- [ ] **Step 2: Mirror into `th.ts`, keeping every Thai value verbatim from the source**

The Thai is not being retranslated — it is being moved. Take each value from the file it currently lives in, character for character.

```ts
subscriptions: {
  detailsTitle: 'ข้อมูลสัญญา',
  purchasedModules: 'โมดูลที่ซื้อ',
  seats: 'ที่นั่ง',
  searchNumber: 'ค้นหาเลขที่สัญญา',
  clearClusterFilter: 'ล้างตัวกรอง cluster',
  featuresLoadFailed: 'โหลดรายการสิทธิ์ไม่สำเร็จ',
  featuresLoadFailedHint: 'ยังแก้สิทธิ์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง',
  featuresLoading: 'กำลังโหลดรายการสิทธิ์…',
  unrecognisedDisabled: 'ไม่รู้จัก (ถูกปิดใช้งาน) ({{count}})',
  removeUnrecognised: 'ถอดสิทธิ์ที่ไม่รู้จัก {{key}}',
  disabledStillAttached: 'สิทธิ์เหล่านี้ถูกปิดใช้งานในระบบแล้ว แต่ยังผูกอยู่กับสัญญานี้',
  disabledMustRemove: 'สิทธิ์เหล่านี้ถูกปิดใช้งานในระบบแล้ว — ต้องถอดออกก่อน จึงจะบันทึกสิทธิ์ของสัญญานี้ได้',
  noFeaturesAssigned: 'ยังไม่มีสิทธิ์ที่กำหนดให้ {{target}}',
  thisSubscription: 'สัญญานี้',
  searchFeaturesPlaceholder: 'ค้นหาโมดูลหรือสิทธิ์...',
  searchFeatures: 'ค้นหาสิทธิ์',
  clearSearch: 'ล้างการค้นหา',
  noFeaturesDefined: 'ยังไม่มีรายการสิทธิ์ในระบบ',
  noFeaturesMatch: 'ไม่พบสิทธิ์ที่ตรงกับ “{{query}}”',
  collapseAll: 'หุบทั้งหมด',
  expandAll: 'กางทั้งหมด',
  clearAllIn: 'ไม่เอาทั้งหมดใน {{module}}',
  selectAllIn: 'เอาทั้งหมดใน {{module}}',
  none: 'ไม่เอา',
  selectedCount: '{{count}} รายการที่เลือก',
  pendingCount: 'รอตอบรับ {{count}}',
  upTo: '→ อาจถึง {{projected}}/{{cap}}',
  noBusinessUnitLinked: 'สัญญานี้ไม่ได้ผูกกับหน่วยธุรกิจใด',
  purchasedCount: 'ซื้อ {{count}}',
  capEditedOnBuPage: 'แก้เพดานได้ที่หน้าหน่วยธุรกิจ',
  editCap: 'แก้เพดาน',
  seatsPoolNote: 'ที่นั่งเป็น pool ของทั้ง cluster — BU อื่นที่ไม่อยู่ในสัญญานี้ก็สมทบเข้า pool ด้วย จำนวนที่ซื้อข้างบนจึงไม่จำเป็นต้องเท่ากับเพดานรวม ({{cap}})',
  selectClusterFirst: 'เลือกคลัสเตอร์ก่อน',
  clusterHasNoBu: 'คลัสเตอร์นี้ยังไม่มีหน่วยธุรกิจ — สร้างหน่วยธุรกิจก่อนจึงจะออกสัญญาได้',
  numberAutoAssigned: 'ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก',
},
```

`noFeaturesAssigned` gains a space before `{{target}}` per the file's own spacing rule — `{{target}}` can be a business unit name in Latin.

- [ ] **Step 3: Check no new value duplicates an existing one**

```bash
node -e "
const s=require('fs').readFileSync('src/i18n/en.ts','utf8');
const v=[...s.matchAll(/^\s*\w+:\s*(['\"])((?:(?!\1)[^\\\\]|\\\\.)*)\1/gm)].map(m=>m[2]);
const d=[...new Set(v.filter((x,i)=>v.indexOf(x)!==i))];
console.log(d.length?'DUPLICATES: '+d.join(' | '):'no duplicates');
"
```

Expect only the documented pairs (`nav.*`/`breadcrumb.*`, `entity.*.title`/`.sentence`, `requiredMessage`/`selectRequired`, `theme.system`/`common.option.system`, the four `common.status.*`/`common.audit.*Date` pairs). Anything new is a key that should have been a reuse.

Then compose every `toast.*` template with `entity.*` and confirm none of them renders one of your new values.

- [ ] **Step 4: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): พจนานุกรม slice 3a — เขียนอังกฤษให้สตริงที่มีแต่ไทย"
```

Tests must still be **144/144 green**: this task adds keys but changes no call site, so nothing renders differently yet.

---

### Task 2: `SubscriptionTable.tsx` + its 7 test assertions

**Files:**
- Modify: `src/pages/licenses/SubscriptionTable.tsx`
- Modify: `src/pages/licenses/SubscriptionTable.test.tsx` — **7 assertion lines only**
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's `pages.subscriptions.{searchNumber,clearClusterFilter}`.
- Produces: `pages.subscriptions.expiringSoon` ('Expiring soon' / 'ใกล้หมดอายุ'), which Task 6 reuses.

- [ ] **Step 1: Bind the reuse list**

| String | Key |
|---|---|
| Add | `common.action.add` |
| Business Unit | `entity.businessUnit.title` |
| Clear | `common.action.clear` |
| Clear All Filters | `common.action.clearAllFilters` |
| Clear all | `common.action.clearAll` |
| Cluster | `common.label.cluster` |
| Created at / Created by | `common.audit.createdAt` / `createdBy` |
| Data exported successfully | `toast.exported` |
| Export | `common.action.export` |
| Filters | `common.label.filters` |
| Filters: | `common.action.filtersLabel` |
| Subscriptions | `common.label.subscriptions` |
| Updated at / Updated by | `common.audit.updatedAt` / `updatedBy` |

- [ ] **Step 2: Add this file's page-local keys**

English values, verbatim from source:

```
Add Subscription            All clusters                Business Unit Name
Cluster Code                End Date                    Error fetching subscriptions:
Expiring soon               Expiring within             Expiry
Failed to load subscription summary.                    Failed to load subscriptions:
Feature Count               Features                    Filter subscriptions by state, cluster, and expiry
Get started by creating your first subscription for a cluster.
Loading subscriptions       Locked to Active while showing subscriptions expiring soon.
Manage cluster license subscriptions, seat pools, and feature entitlements.
No subscriptions yet        Period                      Seats Cap
Seats Used                  Start Date                  State
Subscription                Subscription Number
```

`API Response` and `GET /api-system/platform/subscriptions` are `<DevDebugSheet>` props — leave them English.

The audit column spread from `auditColumns()` carries a hardcoded `header: 'Created'`; override it with `t('common.audit.created')` as `broadcastColumns.tsx` does. Do **not** modify `src/components/auditColumns.tsx`.

- [ ] **Step 3: Bind the two Thai strings** to `pages.subscriptions.searchNumber` and `clearClusterFilter`.

- [ ] **Step 4: Wire `t` into the utility call sites** — `getErrorDetail(err, t)` / `parseApiError(err, t)` wherever they appear. Put `t` in the deps of the column `useMemo`.

- [ ] **Step 5: Update the 7 test assertions**

```bash
grep -n "[ก-๙]" src/pages/licenses/SubscriptionTable.test.tsx
```

All seven lines are assertions. Change each Thai literal to the authored English — `ค้นหาเลขที่สัญญา` → `Search subscription number`, `ล้างตัวกรอง cluster` → `Clear cluster filter`. Change nothing else in the file. List every line changed with before and after.

- [ ] **Step 6: Read the file end to end**, run `grep -n "[ก-๙]"`, and report anything beyond the lists.

- [ ] **Step 7: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses/SubscriptionTable.tsx src/pages/licenses/SubscriptionTable.test.tsx src/i18n
git commit -m "feat(i18n): แปลตารางสัญญา + ย้าย assertion ไทย 7 บรรทัดเป็นอังกฤษ"
```

---

### Task 3: `SubscriptionForm.tsx` + `SubscriptionInfoCard.tsx` + 5 test assertions

**Files:**
- Modify: `src/pages/licenses/SubscriptionForm.tsx`
- Modify: `src/pages/licenses/subscriptionEdit/SubscriptionInfoCard.tsx`
- Modify: `src/pages/licenses/SubscriptionForm.test.tsx` — **3 assertion lines only** (345, 346, 380)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's `detailsTitle`, `purchasedModules`, `seats`, `selectClusterFirst`, `clusterHasNoBu`, `numberAutoAssigned`.

- [ ] **Step 1: Bind the reuse lists** — `common.cancel`, `toast.saved`, `common.action.saveChanges`, `common.busy.saving`, `common.state.unsavedChanges`, `common.label.cluster`, `entity.businessUnit.title`, and whatever else the files already share.
- [ ] **Step 2: Add page-local keys** for the remaining English, taken verbatim from source.
- [ ] **Step 3: Bind the Thai** — `ข้อมูลสัญญา`, `โมดูลที่ซื้อ`, `ที่นั่ง` in the form; `เลือกคลัสเตอร์ก่อน`, `คลัสเตอร์นี้ยังไม่มีหน่วยธุรกิจ — …`, `ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก`, `ข้อมูลสัญญา` in the card. `ข้อมูลสัญญา` is one key used by both.
- [ ] **Step 4: Wire `t` into `validateField` / `parseApiError` / `getErrorDetail`** at every call site in both files.
- [ ] **Step 5: Update 3 test assertions** in `SubscriptionForm.test.tsx` — lines **345** (`รอตอบรับ 1`), **346** (`queryByText(/อาจถึง/)`, negative) and **380** (`queryByText('ที่นั่ง')`, negative). Lines 343 and 415 **stay**: 343 searches for `ไม่จำกัด`, a 3b string; 415 searches for a string that lives in `src/hooks/useAllClusters.ts`, outside this slice. The other 6 Thai lines are comments. List each change with before and after, and say explicitly why 343 and 415 were left.
- [ ] **Step 6: Read both files end to end**, `grep -n "[ก-๙]"`, report findings.
- [ ] **Step 7: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses/SubscriptionForm.tsx src/pages/licenses/subscriptionEdit/SubscriptionInfoCard.tsx src/pages/licenses/SubscriptionForm.test.tsx src/i18n
git commit -m "feat(i18n): แปลฟอร์มสัญญา + การ์ดข้อมูลสัญญา"
```

---

### Task 4: `FeatureSelectionCard.tsx` + `featureSelection.ts`

**Files:**
- Modify: `src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx`
- Modify: `src/pages/licenses/subscriptionEdit/featureSelection.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**No test file changes.** `FeatureSelectionCard` has no test; `featureSelection.test.ts` holds Thai in fixtures only and must stay untouched — confirm it passes unmodified.

**Interfaces:**
- Consumes: Task 1's FeatureSelectionCard block, plus `common.action.retry` and `common.option.all`.

This file is written almost entirely in Thai — 23 of the 40. It is the clearest case of the bug this slice fixes.

- [ ] **Step 1: Bind every Thai string** to its Task 1 key. The mapping, by source line:

| Line | Thai | Key |
|---|---|---|
| 84 | โหลดรายการสิทธิ์ไม่สำเร็จ | `featuresLoadFailed` |
| 85 | ยังแก้สิทธิ์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง | `featuresLoadFailedHint` |
| 86 | ลองใหม่ | `common.action.retry` |
| 94 | กำลังโหลดรายการสิทธิ์… | `featuresLoading` |
| 112 | ไม่รู้จัก (ถูกปิดใช้งาน) ({n}) | `unrecognisedDisabled` with `{{count}}` |
| 125 | ถอดสิทธิ์ที่ไม่รู้จัก ${k} | `removeUnrecognised` with `{{key}}` |
| 136 | สิทธิ์เหล่านี้…แต่ยังผูกอยู่กับสัญญานี้ | `disabledStillAttached` |
| 137 | สิทธิ์เหล่านี้… — ต้องถอดออกก่อน… | `disabledMustRemove` |
| 165 | ยังไม่มีสิทธิ์ที่กำหนดให้{buName ? … : 'สัญญานี้'} | `noFeaturesAssigned` with `{{target}}`; the fallback target is `thisSubscription` |
| 199 | ค้นหาโมดูลหรือสิทธิ์... | `searchFeaturesPlaceholder` |
| 201 | ค้นหาสิทธิ์ | `searchFeatures` |
| 208 | ล้างการค้นหา | `clearSearch` |
| 217 | ยังไม่มีรายการสิทธิ์ในระบบ | `noFeaturesDefined` |
| 222 | ไม่พบสิทธิ์ที่ตรงกับ &ldquo;{query}&rdquo; | `noFeaturesMatch` with `{{query}}` |
| 229 | หุบทั้งหมด / กางทั้งหมด | `collapseAll` / `expandAll` |
| 258 | ไม่เอาทั้งหมดใน / เอาทั้งหมดใน | `clearAllIn` / `selectAllIn` with `{{module}}` |
| 263 | ไม่เอา / ทั้งหมด | `none` / `common.option.all` |
| 299 | {n} รายการที่เลือก | `selectedCount` with `{{count}}` |

Line 222 uses the JSX entities `&ldquo;` / `&rdquo;`. The catalog value carries the real characters `“` and `”` — JSX decodes the entities before the DOM, so this is byte-identical in what a user and a test see.

- [ ] **Step 2: `featureSelection.ts`** — if it returns any user-visible string, give it a trailing optional `t` shaped like `src/utils/validation.ts` (fallback plus the dev-only warning). If it returns none, say so and change nothing.
- [ ] **Step 3: Read both files end to end**, `grep -n "[ก-๙]"` — only comments should remain.
- [ ] **Step 4: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx src/pages/licenses/subscriptionEdit/featureSelection.ts src/i18n
git commit -m "feat(i18n): แปลการ์ดเลือกสิทธิ์ — ไฟล์ที่เป็นภาษาไทยเกือบทั้งไฟล์"
```

---

### Task 5: `SeatsCard.tsx` + its 16 test assertions

**Files:**
- Modify: `src/pages/licenses/subscriptionEdit/SeatsCard.tsx`
- Modify: `src/pages/licenses/subscriptionEdit/SeatsCard.test.tsx` — **15 lines only** (of 17 Thai lines; line 116 is a `describe` title naming a UI string and does change; lines 45 and 104 stay)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:** consumes Task 1's SeatsCard block plus `seats`.

- [ ] **Step 1: Bind the Thai**, by source line:

| Line | Thai | Key |
|---|---|---|
| 35, 48 | ที่นั่ง | `pages.subscriptions.seats` |
| 56 | รอตอบรับ {pending_invites} | `pendingCount` with `{{count}}` |
| 57 | ` → อาจถึง ${projected}/${cap}` | `upTo` with `{{projected}}`, `{{cap}}` |
| 63 | สัญญานี้ไม่ได้ผูกกับหน่วยธุรกิจใด | `noBusinessUnitLinked` |
| 66 | {bu.bu_name} · ซื้อ {bu.licensed_users} | `purchasedCount` with `{{count}}`, composed after the BU name and the `·` |
| 74 | แก้เพดานได้ที่หน้าหน่วยธุรกิจ | `capEditedOnBuPage` |
| 82 | แก้เพดาน | `editCap` |
| 95-96 | ที่นั่งเป็น pool ของทั้ง cluster — … ({cap}) | `seatsPoolNote` with `{{cap}}` |

Lines 56, 66 and 95-96 are JSX text interrupted by `{expressions}` — the category the first scan of this slice missed entirely. Read them in the source; do not reconstruct them from this table.

- [ ] **Step 2: Update 15 lines.** Leave **45** (`ไม่จำกัด`, a 3b string) and **104** (`ปิดใช้งานหรือถูกลบ`, which exists nowhere in the source — an assertion that has always been vacuous; report it, do not fix it). Line **116** is a `describe` title naming a UI string and does change. The rest include regex matchers (`getByText(/รอตอบรับ 2/)`) and a `toHaveTextContent('อาจถึง 12/10')`. Convert each to the authored English preserving the same matcher shape — a regex stays a regex over the same substring, never widened. The negative ones matter most: `queryByText(/รอตอบรับ/).toBeNull()` at line 60 and `queryByText(/อาจถึง/)` at 66 would keep passing after translation because the Thai can no longer render — green for the wrong reason. They change.
- [ ] **Step 3: Read the file end to end**, `grep -n "[ก-๙]"`.
- [ ] **Step 4: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses/subscriptionEdit/SeatsCard.tsx src/pages/licenses/subscriptionEdit/SeatsCard.test.tsx src/i18n
git commit -m "feat(i18n): แปลการ์ดที่นั่ง + ย้าย assertion ไทย 16 บรรทัด"
```

---

### Task 6: `SubscriptionSummary.tsx` + `buildAdvance.ts` + 5 test assertions

**Files:**
- Modify: `src/pages/licenses/subscriptionManagement/SubscriptionSummary.tsx`
- Modify: `src/pages/licenses/subscriptionManagement/buildAdvance.ts`
- Modify: `src/pages/licenses/subscriptionManagement/SubscriptionSummary.test.tsx` — **5 assertion lines only**
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:** consumes `common.option.all`, `common.status.{active,expired,deleted}`, and `pages.subscriptions.expiringSoon` from Task 2.

- [ ] **Step 1: All five Thai strings are pure reuse** — this is the payoff of checking before inventing:

| Thai | Key | English |
|---|---|---|
| ทั้งหมด | `common.option.all` | All |
| ใช้งาน | `common.status.active` | Active |
| หมดอายุ | `common.status.expired` | Expired |
| ใกล้หมดอายุ | `pages.subscriptions.expiringSoon` | Expiring soon |
| ลบแล้ว | `common.status.deleted` | Deleted |

Add no new keys for these. If a value does not match byte-for-byte, stop and report rather than adding a near-duplicate.

- [ ] **Step 2: `buildAdvance.ts`** — it holds Thai in `buildAdvance.test.ts` fixtures only. Check whether the module itself renders any user-visible string; if it does, give it a trailing optional `t`. `buildAdvance.test.ts` does **not** change.
- [ ] **Step 3: Update the 5 test assertions** in `SubscriptionSummary.test.tsx` — `getByText('ทั้งหมด')` → `getByText('All')` and so on.
- [ ] **Step 4: Read both files end to end**, `grep -n "[ก-๙]"`.
- [ ] **Step 5: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/licenses/subscriptionManagement src/i18n
git commit -m "feat(i18n): แปลแถบสรุปสัญญา — ห้าสตริงไทยใช้คีย์ร่วมที่มีอยู่แล้วทั้งหมด"
```

---

### Task 7: Whole-slice verification

- [ ] **Step 1: Static gates**

```bash
bun run typecheck && bun run lint && bun run test
CI=true bun run build:dev
git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep '\.test\.'
```

The last command must list **exactly four** files: `SubscriptionTable.test.tsx`, `SubscriptionForm.test.tsx`, `SeatsCard.test.tsx`, `SubscriptionSummary.test.tsx`. Any other test file in that list is a defect.

- [ ] **Step 2: Count the test edits.** `git diff` those four files and confirm **30 changed lines**, each moving one of the 40 Thai strings to its authored English, none deleted or weakened, and confirm the four stated exceptions are still present and still Thai.

- [ ] **Step 3: Catalog integrity.** EN↔TH key parity, no `{{param}}` mismatch, no new duplicate value beyond the documented pairs, and no page key duplicating what a `toast.*` template produces.

- [ ] **Step 4: Browser, in English.** `/licenses/subscriptions`, the subscription form, the feature-selection card, the seats card. **No Thai may appear anywhere.** This is the acceptance criterion the slice exists for — screenshot or transcribe each screen.

- [ ] **Step 5: Browser, in Thai.** The same screens render Thai; a validation error on the form is Thai; **zero `[i18n]` console warnings**, captured by wrapping `console.warn` before navigating.

- [ ] **Step 6: Browser at 390px, both languages.** The subscription table's frozen columns hold and the page body does not scroll horizontally. Measure with a same-origin iframe reading `contentWindow.innerWidth`, not the window size.

- [ ] **Step 7: Commit any fixes**

```bash
git commit -am "fix(i18n): แก้ผลตรวจ slice 3a"
```
