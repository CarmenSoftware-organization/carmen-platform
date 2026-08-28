# i18n Phase 2, Slice 4: Cluster Admin — Design

**Date:** 2026-08-28
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Translates `src/pages/clusterAdmin/`.
**Predecessors:** phase 1 (#169), Users (#170), pure utils (#171), Broadcasts+News (#172), Subscriptions (#173), Licenses (#174)

## Measurement

The phase-2 spec sized this slice at "~147 strings, `clusterAdmin/` ×15". Measured with the extraction that has now survived nine known blind spots:

| | phase-2 estimate | measured |
|---|---|---|
| Files (non-test) | 15 | **25** |
| English strings | ~147 | **232** |
| Thai-only strings | — | **0** |
| Test files covering these files | — | see below |

**Zero Thai.** This is an ordinary translation slice: byte-identity applies in full and the **no-test-edits rule holds with no exception**.

Every remaining phase-2 estimate stays unverified — this is the fourth slice measured and the fourth to differ from its estimate.

### Per file

```
BusinessUnitForm.tsx     41   ClusterProfile.tsx        16   ClusterAdminLicenses.tsx      6
BusinessUnitList.tsx     41   MembersTable.tsx          14   ClusterAdminEntry.tsx         5
QuotaLedgerCard.tsx      24   AddressBlock.tsx          13   ClusterBusinessUnitsCard.tsx  5
InviteUserDialog.tsx     23   SeatsByBuTable.tsx        12   BuPropertyPlate.tsx           5
ClusterBuDocument.tsx    21   BuRankingCard.tsx         11   ClusterAccessLost.tsx         2
InvitationsTable.tsx     17   CapacityStrip.tsx          9   … plus 9 smaller files
                              SeatMeter.tsx              9
```

## Every hazard was found before implementation, not during

The previous three branches each spent fix rounds on defects that a measurement pass could have surfaced. This time the sweep ran first:

| Hazard | Sites | Where |
|---|---|---|
| **CSV export** — a value read straight off the data object, which no text search reaches | 3 | `BusinessUnitList.tsx:20,195,204` |
| **Raw-enum label** — `capitalize` / `toUpperCase`, English in a Thai UI | 6 | `InvitationsTable.tsx:23,113,123`, `InviteUserDialog.tsx:25`, `MembersTable.tsx:113,139`, `BuPropertyPlate.tsx:60` |
| **Module-scope const holding user-visible strings** — cannot call `t` at all | 3 | `InviteUserDialog.tsx:22,23`, `MembersTable.tsx:23` |

Each is written into the task that owns it.

### The role constants need their two jobs separated

```ts
const CLUSTER_ROLES = ['admin', 'user'] as const;
const BU_ROLES      = ['admin', 'user'] as const;
const ROLES         = ['admin', 'user'] as const;
```

These are **both** the values sent to the API **and** the labels shown on screen. Translating means separating those roles, not wrapping `t()` around the array: the value stays `'admin'`, and a `Record<Role, TKey>` supplies the label.

The `as const` is what makes that `Record` possible, so it stays — it is the opposite situation from `en.ts`, where `as const` is forbidden because it would narrow the catalog's values to literals and break `th.ts`.

## Use a typed map, not a string fallback

Slice 3b established this and it is now the default:

```ts
const ROLE_KEY: Record<Role, TKey> = { admin: 'common.role.admin', user: 'common.role.user' };
t(ROLE_KEY[role])                                    // a missing case is a COMPILE ERROR

t(`common.status.${s}` as TKey) || s                 // only where the value is unbounded
```

The `||` exists solely because a template-literal key cannot be typed. A `Record<Union, TKey>` can be, so for a closed union the compiler enforces completeness — eliminating the hazard that made slice 2 ship a permanently-English `Draft` rather than warning about it.

## Decisions

| Question | Decision |
|---|---|
| Byte-identity | Applies in full — every string already has English |
| Test files | **None change.** Any test file in this slice's diff is a defect |
| Namespace | `pages.clusterAdmin.*`, with reuse checked first |
| Role labels | `Record<Role, TKey>`; the enum value itself is never translated |
| Enum lookups | `Record<Union, TKey>` by default; `\|\| raw` only for genuinely unbounded values |

## Reuse, checked four ways

Six slices have built a 738-key catalog. Before creating anything:

1. An exact value in `common.*` / `entity.*` / `breadcrumb.*` / `error.*` — **and read its Thai**, not only its English. Slice 3a shipped a key whose English was right and whose Thai contradicted its page.
2. A value a `toast.*` template produces composed with an `entity.*` noun. The duplicate-value script cannot see this — it compares literals, and the collision is with a value a template *produces*.
3. **A value another slice's `pages.*` already holds is a promotion signal.** Slice 3b promoted five strings this way. Promote when it meets **≥3 files AND ≥2 slices**; otherwise leave it split and record why.
4. **A key that means the same thing but spells differently** — `'Clear filters'` versus `'Clear all filters'`. No script finds these; only reading the call sites does.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| A reused key matches in English but not in meaning | High | Six instances across three branches. Check at the call site and read the Thai. |
| A raw enum or CSV value ships untranslated | High | All nine sites are enumerated above and assigned to tasks. |
| A plain English string with no key is missed | Medium | Slice 3a shipped a `<CardDescription>` this way. Every task ends by reading its files end to end. |
| A claim about where something is used is made from a raw grep | Medium | **Twice on the previous branch I counted grep hits without checking what they were** — once conflating comments with imports, once conflating comments with rendered strings, the second time while correcting the first. Any claim about where a string or component is used must strip comments and check for real imports. |
| 25 files is large for one slice | Medium | Five tasks grouped by surface, none over ~60 strings. |

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **All 144 test files pass with none modified.** `git diff --name-only | grep '\.test\.'` must print nothing.
3. Every English catalog value byte-identical to the literal it replaced.
4. `grep -n "[ก-๙]"` across the 25 files leaves only code comments.
5. No new `pages.clusterAdmin.*` key duplicates a `common.*` value or one a `toast.*` template produces.
6. **All nine enumerated hazard sites are handled** — three CSV, six raw-enum, three module-const — and each is named in a report.
7. **In a browser, in Thai:** the cluster-admin entry, business unit list and form, members and invitations, licences and quota cards. Zero `[i18n]` console warnings.
8. **In a browser, in English:** the same screens, byte-identical to today.
9. At 390px in both languages, the tables' frozen columns hold.

## Out of scope

- Slices 5-10.
- `auditColumns.tsx` / `AuditMeta.tsx` / `relativeTime.ts` — shared components on ~15 pages, deferred to the infrastructure pass. Where a table spreads `createdColumn` / `updatedColumn`, override the header at the call site instead.
- **Correction carried forward:** two earlier specs claimed `ไม่จำกัด` was rendered — first attributing it to slice 3b, then to slices 4 and 7. Both were wrong. Stripping comments across all of `src/` shows it appears **only in comments** and is never rendered, so `SeatsCard.test.tsx:45` and `SubscriptionForm.test.tsx:343` are vacuous regression guards of the same class as `SeatsCard.test.tsx:104`. **This slice does not own them and must not "fix" them.**
