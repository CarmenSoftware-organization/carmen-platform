# i18n Phase 2, Slice 5: Business Units — Design

**Date:** 2026-08-29
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. `BusinessUnitManagement.tsx`, `BusinessUnitEdit.tsx`, `businessUnitEdit/`, `businessUnitManagement/`.
**Predecessors:** #169 shell, #170 Users, #171 pure utils, #172 Broadcasts+News, #173 Subscriptions, #174 Licenses, #175 Cluster Admin

## Measurement

| | phase-2 estimate | measured |
|---|---|---|
| Files (non-test) | — | **18** |
| English strings | ~135 | **219** |
| Thai-only strings | — | **0** |
| Test files | — | **7, with 48 text assertions** |

Fifth slice measured, fifth to differ from its estimate. The remaining estimates stay unverified.

### Per file

```
BusinessUnitManagement.tsx  58   ConfigurationSection.tsx        21   BusinessUnitBrandingCard.tsx  6
BusinessUnitDocument.tsx    48   CalculationSettingsSection.tsx  17   NumberFormatsSection.tsx      6
BusinessUnitUsersCard.tsx   36   DatabaseConnectionSection.tsx   14   useBusinessUnitUsers.ts       6
BusinessUnitEdit.tsx        28   BusinessUnitLicensesCard.tsx     8   BuSummary.tsx                 6
                                                                      InlineField.tsx               5
                                                                      types.ts 5 · DebugSheet 3 · HeroName 3 · shared 1
```

## The tests are the enforcement this slice has and slice 4 did not

Seven test files carry **48 text assertions**, and every one asserts **English**. The Thai in those files sits entirely in `it(...)` / `describe(...)` titles and comments — developer-facing prose, not claims about the UI.

That distinction is the whole story:

- **No test file may change.** Byte-identity is not merely a rule here, it is checked 48 times.
- Slice 3a needed the rule replaced only because its assertions asserted the Thai it was translating. Nothing like that exists here.
- Slice 4 had no tests at all, so the rule was easy to state and impossible to verify. Here it is verifiable, which makes this slice's byte-identity claim the strongest of any so far.

One consequence to watch: `BusinessUnitLicensesCard.test.tsx:61` asserts `'22 days left'` against a hardcoded English string in `BusinessUnitLicensesCard.tsx:52`. That file is in scope. When it is translated the assertion must still pass — which it will if and only if the English is byte-identical. It is the single most informative test in the slice.

## Eight hazard sites, found before implementation

| Hazard | Sites | Where |
|---|---|---|
| **CSV export** — a value read straight off the data object | 3 | `BusinessUnitManagement.tsx:20,224,235` |
| **Runtime-synthesised label** — `capitalize` / `toUpperCase` | 5 | `BusinessUnitDocument.tsx:139,146`, `BusinessUnitUsersCard.tsx:114,182,298` |

The sweep also checked for module-scope constants holding label strings (in **both** array and `Record`-of-objects shapes) and for `t(...)` results stored into state — the two categories slice 4 added — and found none.

The CSV case has now produced a real defect **four times across four branches**, most recently a BU list exporting raw `true`/`false` into a file users open. It is the one category no text search reaches, because the string never appears in the source at all: it comes from the API and leaves in a file without being rendered. Follow the data path, not the text.

## Decisions

| Question | Decision |
|---|---|
| Byte-identity | Applies in full, and is enforced by 48 assertions |
| Test files | **None change.** Any test file in the diff is a defect |
| Namespace | `pages.businessUnits.*`, with reuse checked first |
| Enum lookups | `Record<Union, TKey>` by default; `\|\| raw` only where the value is genuinely unbounded |
| Cross-slice keys | **Never read another slice's `pages.*`.** Promote if it clears the bar, otherwise duplicate with a comment naming the sibling |

## What the previous slices established that binds this one

- **Reuse before creating, four rungs**: an exact `common.*`/`entity.*`/`breadcrumb.*`/`error.*` value **with its Thai read**; a value a `toast.*` template *produces* composed with an `entity.*` noun (no script sees this); another slice's `pages.*` holding it, which is a **promotion signal** at **≥3 files AND ≥2 slices**; and a key meaning the same but spelling differently.
- **A page namespace belongs to its slice.** Slice 4 shipped seven cross-namespace reads and had to convert them all: an edit to one slice's page silently changing another's is invisible at both ends.
- **Never store translated text in state, fetched data, or a ref.** The sharper form of the rule: it is dangerous when *nothing forces a recompute*. Error state is overwritten by the next interaction; a value fetched once never is.
- **A green test suite does not prove a key move was safe.** `TKey = DottedPaths<typeof en>` makes a deleted key a compile error at every surviving call site, so **`tsc` is the guard**; the suite is evidence only for the strings its assertions actually name.
- **Any claim about where a string is used must strip comments first.** Two claims on earlier branches were made by counting raw grep hits — once conflating comments with imports, once with rendered strings.
- **Verify before complying with a hazard list.** One of slice 4's nine listed sites was an avatar initial, not an enum; a `Record` there would have been fiction. These sweeps are regex-based and produce false positives too.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| A CSV value ships untranslated | High | Four instances in four branches. Three sites named above; follow the data path. |
| A reused key matches in English but not in meaning | High | Seven instances across four branches, including one where the **English was right and the Thai was the mismatch**. Check at the call site and read the Thai. |
| An English value drifts | Medium | 48 assertions catch it — the first slice where this is true. |
| A plain English string with no key is missed | Medium | Every task ends by reading its files end to end. |
| `businessUnitEdit/sections/` overlaps configuration surfaces owned by later slices | Medium | Check imports before claiming any consumer; do not count grep hits. |

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **All 144 test files pass with none modified.** `git diff --name-only | grep '\.test\.'` prints nothing.
3. Every English catalog value byte-identical to the literal it replaced — and `tsc`, not the suite, is what proves a key move.
4. `grep -n "[ก-๙]"` across the 18 files leaves only code comments.
5. No new `pages.businessUnits.*` key duplicates a `common.*` value, one a `toast.*` template produces, or another slice's `pages.*`.
6. **All eight hazard sites accounted for**, each named in a report — including any judged a false positive.
7. **In a browser, in Thai:** the BU list, the BU edit page and every one of its tabs and cards. Zero `[i18n]` console warnings.
8. **In a browser, in English:** the same screens, byte-identical to today, zero Thai characters.
9. At 390px in both languages, the list's frozen columns hold.

## Out of scope

- Slices 6-10.
- `auditColumns.tsx` / `AuditMeta.tsx` / `relativeTime.ts` — shared components on ~15 pages, deferred to the infrastructure pass. Override spread audit headers at the call site instead.
- Any component this slice's pages import from another slice's directory. Slice 4's cluster profile still shows an English Identity block for exactly this reason, and that is correct scoping, not a miss.
