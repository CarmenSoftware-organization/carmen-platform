# i18n Phase 2, Slice 3b: License Center, cluster licenses, purchase — Design

**Date:** 2026-08-28
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Translates the twelve remaining `licenses/` files.
**Predecessors:** phase 1 (#169), slice 1 Users (#170), sub-project B (#171), slice 2 Broadcasts+News (#172), slice 3a Subscriptions (#173)

## Measurement

3a's spec split slice 3 in two and sized 3b at "~295 English". Re-measured with the corrected extraction — the one that survived 3a's eighth blind spot — it is smaller and much cleaner:

| | |
|---|---|
| Files | 12 |
| English strings | **143** |
| Thai-only strings | **1**, and it already has a key |
| Test files covering these files | **0** |

The single Thai string is `ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก` in `LicensePurchaseForm.tsx`, which slice 3a already keyed as `pages.subscriptions.numberAutoAssigned`. Every other Thai character in these files sits in a code comment.

**So 3b is an ordinary translation slice, not a language unification.** The byte-identity rule applies in full, and the no-test-edits rule returns to force: **no test file may be created or modified.**

### Per file

```
BuQuotaSection.tsx        38    ClusterLicenseTable.tsx   27    ClusterLicenseDetail.tsx   9
LicensePurchaseForm.tsx   34    SeatSection.tsx           25    licenseKindConfig.ts       6
PurchaseLicenseTable.tsx  32    SubscriptionSection.tsx   14    useLicenseLedger.ts        4
                                LicenseCenter.tsx          9    useClusterSeatLicenses.ts  0
                                                                licenseDates.ts            0
```

## Correction (final fix wave, F4): `sections/*` has one consumer, not three

The claim below — that `sections/*` is "shared with two later slices" across three feature areas — is **false** and was corrected in the final fix wave without a code change. `sections/BuQuotaSection.tsx`, `SeatSection.tsx` and `SubscriptionSection.tsx` are imported by exactly one file: this slice's own `ClusterLicenseDetail.tsx` (`ClusterLicenseDetail.tsx:12-14`). `ClusterEdit.tsx`, `clusterAdmin/ClusterAdminLicenses.tsx` and `clusterEdit/sections/DetailsSection.tsx` only **mention** those filenames in comments — none of them import or render these components. Slices 4 and 7 inherit nothing from translating `sections/*` here.

The original claim came from grepping the component names (`BuQuotaSection`, `SeatSection`, `SubscriptionSection`) across the repo and counting every file where a match landed, without checking whether each match was an actual `import` versus a comment that merely referenced the filename. The next slice should re-verify shared-consumer claims by checking for `import` statements, not by counting name matches.

## Three raw-enum badges

The pattern that produced four defects across the last two branches is present again, and this time it was found **before** implementation rather than during it:

```
PurchaseLicenseTable.tsx:386   <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
PurchaseLicenseTable.tsx:471   <Badge variant="secondary" className="gap-1 capitalize">
SubscriptionSection.tsx:142    <Badge variant={sub.state === 'active' ? 'success' : 'secondary'} className="cap…
```

Each renders a raw enum title-cased by CSS, so each stays English in Thai. Each takes a lookup with a `|| raw` fallback and loses `className="capitalize"`, because the catalog values are already Title Case — displayed English unchanged. Every value the lookup can receive must be enumerated and confirmed to have a key; a `||` fallback cannot tell you, which is how slice 2 shipped a permanently-English `Draft`.

## Decisions

| Question | Decision |
|---|---|
| Byte-identity | Applies in full — every string here already has English |
| Test files | **None change.** 3b's twelve files have no test coverage of their own |
| The one Thai string | Binds to slice 3a's `pages.subscriptions.numberAutoAssigned`; no new key |
| `sections/*` | Translated here; **correction (F4):** consumed only by this slice's `ClusterLicenseDetail.tsx` — slices 4 and 7 inherit nothing from it (see the correction note above) |
| Namespace | `pages.licenses.*`, with reuse from `common.*` / `entity.*` / `toast.*` checked first |

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| A reused key matches in English but not in meaning | High | Five instances across the last two branches, including one where the **English was right and the Thai was the mismatch** (`common.label.subscriptions`). Every reuse is checked at its call site **and its Thai value is read**. |
| A `\|\|` fallback masks a missing key | High | Three raw-enum sites here. Enumerate what each lookup can receive. |
| A shared template already produces a key's value | Medium | Compose `toast.*` with each `entity.*` noun. The duplicate-value script cannot see this class — it compares literals. |
| A string leaves the app without being rendered | Medium | Slice 3a found a CSV column written straight off a data object. These files export CSV too. Follow the data path. |
| ~~`sections/*` breaks slices 4 and 7~~ — **retracted (F4)** | N/A | False premise: `sections/*` has one consumer, `ClusterLicenseDetail.tsx`. The other three named files only mention the component names in comments; they do not import them. No mitigation needed — see the correction note above. |
| A plain English string with no key is missed | Medium | 3a shipped a `<CardDescription>` this way. Every task ends by reading its files end to end. |

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **All 144 test files pass with none modified.** This is the ordinary rule again, and the whole slice must respect it.
3. Every English catalog value byte-identical to the literal it replaced.
4. `grep -n "[ก-๙]"` across the twelve files leaves only code comments.
5. No new `pages.licenses.*` key duplicates a `common.*` value or one a `toast.*` template produces.
6. **In a browser, in Thai:** `/licenses` and all four of its tabs, a cluster's license detail, and the purchase form. Zero `[i18n]` console warnings.
7. **In a browser, in English:** the same screens, byte-identical to today.
8. At 390px in both languages, the three tables' frozen columns hold.

## Out of scope

- Slices 4-10.
- **Correction carried forward:** slice 3a recorded `ไม่จำกัด` as "a 3b string" when justifying two negative assertions it left Thai (`SeatsCard.test.tsx:45`, `SubscriptionForm.test.tsx:343`). It is not — in `licenses/` it appears only in comments. It renders in `ClusterManagement.tsx`, `ClusterEdit.tsx`, `clusterAdmin/businessUnitForm/SeatMeter.tsx`, `clusterManagement/CapacityGauge.tsx` and `CapacityMeter.tsx`, which belong to **slices 4 and 7**. Those two assertions stay meaningful until then, and **whichever of those slices translates it owns them**.
- `auditColumns.tsx` / `AuditMeta.tsx` / `relativeTime.ts` — shared components on ~15 pages, deferred to the infrastructure pass.
