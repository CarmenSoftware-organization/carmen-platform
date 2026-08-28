# i18n Phase 2, Slice 3a: Subscriptions — Design

**Date:** 2026-08-28
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Translates the Subscription pages, and unifies the language of a feature that is currently written half in Thai.
**Predecessors:** phase 1 (PR #169), slice 1 Users (PR #170), sub-project B (PR #171), slice 2 Broadcasts+News (PR #172)

## The phase-2 estimate was wrong by 2.6×

The phase-2 spec sized slice 3 at **165 strings across `licenses/` ×7**. Measured with the extraction that slice 2's blind spots forced us to build:

| | phase-2 estimate | measured |
|---|---|---|
| Files (non-test) | 7 | **20** |
| User-visible strings | ~165 | **392 English + 43 Thai** |

That is larger than any slice in the plan, including "Platform admin ~200". The user's decision was to **split it into 3a and 3b**, which this spec covers the first half of.

Every remaining slice estimate in the phase-2 spec should now be treated as unverified. Each slice re-measures at its own start; that is how this was caught.

## The split

| | Files | English | Thai already in source |
|---|---|---|---|
| **3a — Subscriptions (this spec)** | 8 | ~170 | **43** |
| 3b — License Center, cluster licenses, purchase | 12 | ~295 | 1 |

3a is smaller but carries the harder problem: **almost every one of the feature's already-Thai strings is in these eight files**, and `subscriptionEdit/FeatureSelectionCard.tsx` is written almost entirely in Thai. 3b is bigger but nearly clean, and its `sections/*` components are also consumed by slice 4 (Cluster Admin) and slice 7 (Clusters), so translating them there gives those slices a head start.

### Files

```
src/pages/licenses/SubscriptionTable.tsx
src/pages/licenses/SubscriptionForm.tsx
src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx
src/pages/licenses/subscriptionEdit/SeatsCard.tsx
src/pages/licenses/subscriptionEdit/SubscriptionInfoCard.tsx
src/pages/licenses/subscriptionEdit/featureSelection.ts
src/pages/licenses/subscriptionManagement/SubscriptionSummary.tsx
src/pages/licenses/subscriptionManagement/buildAdvance.ts
```

Plus `src/i18n/en.ts` and `src/i18n/th.ts`.

`licenseDates.ts` and `licenseKindConfig.ts` go to **3b**: every one of their consumers inside `licenses/` is a 3b file.

## This is not a translation task. It is a language unification.

The app's default language is English. These eight files render **43 user-visible strings that exist only in Thai** — placeholders (`ค้นหาเลขที่สัญญา`), buttons (`ล้างการค้นหา`, `กางทั้งหมด`), whole explanatory sentences (`สิทธิ์เหล่านี้ถูกปิดใช้งานในระบบแล้ว — ต้องถอดออกก่อน จึงจะบันทึกสิทธิ์ของสัญญานี้ได้`), and error text (`โหลดรายการสิทธิ์ไม่สำเร็จ`).

### The count is 43 because the scan was wrong first

A first pass reported 34. It was anchored on JSX text nodes that contain no braces — a guard against matching code — which silently drops **every JSX text node with an embedded `{expression}`**, the commonest shape in React:

```jsx
รอตอบรับ {pending_invites}
{bu.bu_name} · ซื้อ {bu.licensed_users}
ที่นั่งเป็น pool ของทั้ง cluster — BU อื่นที่ไม่อยู่ในสัญญานี้ก็สมทบเข้า pool ด้วย ({cap})
```

Nine strings, a 26% undercount, and phase 1 had already recorded this exact category before the slice-3 scanner reintroduced it. The corrected extraction replaces each `{expression}` with a separator and splits only there, so a phrase with Latin words inside it survives whole.

That makes **eight** known blind spots across the phase: multi-line JSX text, `${}` template literals, punctuation-bearing strings, strings under six characters, runtime-synthesised labels, `${`-initial templates, text already in Thai, and now JSX text interrupted by an expression. **Treat 43 as a floor.** A few of the 43 are fragments the scan splits across multi-line JSX; whoever implements this merges them by reading the source, which is the only method that has ever found the last one.

**An English-speaking user reads Thai on these screens today.** That is a bug this slice fixes, and it changes the shape of the work: for those 43 strings there is no existing English to preserve, so the byte-identity rule — the invariant that carried the three previous slices — cannot protect them. English must be **authored**.

## The central decision: four test files must change

Every earlier slice held the line that **no test file may be modified**, and that rule earned its keep — it is what proved the catalogs had not drifted.

Slice 3a cannot hold it, and the reason is worth stating precisely rather than treating as an exception.

**Four** test files carry **33 assertion lines against Thai strings**:

| File | Thai assertion lines | Thai lines total |
|---|---|---|
| `subscriptionEdit/SeatsCard.test.tsx` | 16 | 17 |
| `SubscriptionTable.test.tsx` | 7 | 7 |
| `SubscriptionForm.test.tsx` | 5 | 11 |
| `subscriptionManagement/SubscriptionSummary.test.tsx` | 5 | 5 |

Three more test files contain Thai but assert none of it — `featureSelection.test.ts`, `buildAdvance.test.ts` and `SubscriptionInfoCard.test.tsx` hold it in fixtures and comments. **Those three do not change.** The distinction matters: Thai in a fixture is test data and stays; Thai in an assertion is a claim about the UI and moves.

for example `screen.getByText('ทั้งหมด')`, `screen.getByPlaceholderText('ค้นหาเลขที่สัญญา')`, `expect(line).toHaveTextContent('อาจถึง 12/10')`.

`useI18n()` deliberately does not throw without a provider; it returns an English fallback context. So a component rendered bare in a test resolves every key to its **English** value. The moment a Thai literal becomes a catalog key, those assertions see English and fail.

**"Never edit a test to make it pass" exists to stop catalog drift being papered over.** These tests are not detecting drift. They are pinning a defect — a Thai-only UI inside an English-default application — and editing them is the substance of the change, not a way around it.

So the rule is replaced for this slice by three narrower ones:

1. **Only assertions whose subject is one of the 43 already-Thai strings may change**, and each changes from the Thai literal to the newly authored English one. Every other assertion in those files stays untouched.
2. **The count is fixed at 33 lines in 4 files.** A test edit outside that set is a defect, not a judgment call. The implementer lists every line it changed with the before and after.
3. **No assertion is deleted, weakened, or converted to a regex** to make it pass. If an assertion cannot be satisfied by the authored English, that is a signal the English is wrong — fix the English.

Tests in the other 137 files remain untouchable, and the byte-identity rule applies in full to the ~170 strings that are already English.

## Authoring English for 43 Thai strings

Nothing mechanical can check this half of the work, so the spec sets the standard instead:

- **Translate the meaning, not the words.** `ไม่เอาทั้งหมดใน ${module}` is "Clear all in {{module}}", not "Don't want all in".
- **Match the surrounding register.** These screens' existing English is terse and sentence-case (`Search subscriptions`, `Clear filters`). The authored English joins it rather than introducing a new voice.
- **Reuse an existing English value wherever one already says the same thing** — `ทั้งหมด` is `common.option.all` ('All'), `ลองใหม่` is `common.action.retry` ('Retry'), `ล้างการค้นหา` maps onto `common.action.clear`. This is the same reuse-first posture as every slice, applied in the opposite direction.
- Where the Thai carries a distinction English does not, keep the Thai value verbatim and let the English be the plainer of the two. The reverse of `selectRequired`.

## Decisions

| Question | Decision |
|---|---|
| Slice boundary | Subscriptions only; `licenseDates.ts`, `licenseKindConfig.ts` and `sections/*` go to 3b |
| The 43 Thai strings | Translated, with English authored and the Thai kept verbatim as the `th.ts` value |
| Test files | Four change, at exactly 33 assertion lines, under the three rules above |
| Byte-identity | Applies in full to the ~170 already-English strings |
| `featureSelection.ts` / `buildAdvance.ts` | Pure modules with frozen tests → trailing optional `t`, the shape `src/utils/validation.ts` established |

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| **A test edit strays beyond the 33** | High | The count is stated, and the implementer must list every changed line with before/after. A reviewer diffs the test files independently and rejects any change whose subject is not one of the 43. |
| The authored English is wrong or off-register | High | Named above as a standard. The reviewer reads all 43 against their Thai and their surrounding screen — this is the one part of the slice no script can check. |
| A Thai string is missed because the scan is anchored on capital letters | Medium | Slice 2's lesson. `grep -n "[ก-๙]"` on every file, comments classified separately, and each file read end to end. |
| A reused key matches in English but not in meaning | Medium | Four instances on the last branch (`theme.system`, `common.field.type`, and two column headers). Every reuse is checked at its call site, not by value equality. |
| A `\|\|` fallback masks a missing key | Medium | Slice 2's `Draft` bug. Every dynamic key lookup enumerates the values it can receive. |
| A shared template already produces a key's value | Medium | `toast.*` composed with `entity.*`. The duplicate-value script cannot see this class. |

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **144 test files pass. Exactly four changed, at exactly 33 assertion lines**, each listed with before and after.
3. Every one of the ~170 already-English strings is byte-identical to what it replaced.
4. **The 43 authored English strings are reviewed one by one** against their Thai and their screen context.
5. `grep -n "[ก-๙]"` across the eight source files leaves only code comments.
6. **In a browser, in English:** open `/licenses/subscriptions`, the subscription form, and the feature-selection card, and confirm **no Thai text appears anywhere** — this is the acceptance criterion the slice exists for.
7. **In a browser, in Thai:** the same screens render Thai, validation errors are Thai, and no `[i18n]` warning appears in the console.
8. At 390px, in both languages, the subscription table's frozen columns hold.

## Out of scope

- 3b and slices 4-10.
- The already-Thai strings in the other eleven areas of the app (`platformConfig` 61, `emailSettings` 42, and nine more). Each is fixed by the slice that owns its files.
- `auditColumns.tsx` / `AuditMeta.tsx` / `relativeTime.ts` — shared components on ~15 pages, deferred to the shared-infrastructure pass.
