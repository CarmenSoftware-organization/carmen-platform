# i18n Phase 2, Slice 1: Users — Design

**Date:** 2026-08-27
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. Translates the Users pages, and establishes the shared catalog and conventions every later phase-2 slice inherits.
**Predecessor:** `2026-08-27-language-switcher-design.md` (phase 1 — the app shell, merged as PR #169)

## Problem

Phase 1 translated the application shell: navigation, breadcrumbs, header, table chrome, and the login page. Every one of the 149 remaining pages under `src/pages/` is still English, so a Thai operator gets a Thai frame around English content.

## How phase 2 is decomposed, and why

Measured across all page files: **1,788 user-visible string occurrences, 1,010 of them unique — 43% are repeats.** More usefully, **102 strings appear three or more times and account for 734 occurrences, 41% of the total** — of which 75 span more than one slice and become the shared catalog.

Two structures were considered.

**Horizontal** — translate all shared vocabulary across the app first, then go page by page. Rejected after measurement: wiring those 102 strings everywhere they appear touches **~150 source files, which is every page in the app**. Each file would then be edited twice, once for shared strings and once for its own — doubling review load and merge conflicts with parallel work, for no benefit. The 41% figure is a share of *strings*, not of *files*; the shared vocabulary is spread thinly across everything rather than concentrated anywhere.

**Vertical (chosen)** — one feature area at a time, each slice touching its files exactly once and shipping something a person can open in a browser. The weakness of pure vertical slicing is that each slice reinvents shared keys; this design removes that by **seeding the entire shared catalog in slice 1 from the measurement above**, which costs nothing extra because seeding edits only the two catalog files.

Slices, sized against phase 1's proven 132 keys:

| Slice | Contents | ~strings |
|---|---|---|
| **1. Users (this spec)** | `UserManagement`, `UserEdit`, `userManagement/`, `userEdit/` | ~113 unique |
| 2. Broadcasts + News | `Broadcast*` ×3, `News*` ×2, subdirectories | ~199 |
| 3. Licenses | `licenses/` ×7 | ~165 |
| 4. Cluster Admin | `clusterAdmin/` ×15 | ~147 |
| 5. Business Units | `BusinessUnit*`, `businessUnitEdit/`, `businessUnitManagement/` | ~135 |
| 6. Report Templates | `ReportTemplate*`, `ReportFormGroup*`, `reportFormGroups/` | ~112 |
| 7. Clusters | `Cluster*`, `clusterEdit/`, `clusterManagement/` | ~97 |
| 8. Applications | `Application*`, `applicationEdit/`, `applicationManagement/` | ~85 |
| 9. Platform admin | Role, SuperAdmin, UserPlatform, PlatformConfig, EmailSetting, DatabasePool, SqlWorkbench, TenantMigration, TenantImport, ActivityEvent, UsageAnalytics | ~200 |
| 10. Miscellaneous | `Profile`, `Landing`, `Changelog`, `Dashboard`, `Forbidden`, `NotFound` | ~80 |

Users goes first because it exercises both page patterns — a server-side list and an edit form — so the shared vocabulary it seeds is validated against both shapes before nine slices depend on it.

**Sub-project B, running independently:** `errorParser.ts` and `validateField` still return English sentences. Translating them means threading a `t` parameter through 164 call sites, so they get their own spec. Until that lands, validation and error text stays English inside otherwise-Thai pages.

## Decisions

| Question | Decision |
|---|---|
| Slice structure | Vertical — one feature area per slice, files touched once |
| Shared catalog | Seeded in slice 1: the **75** strings that occur ≥3 times AND span ≥2 slices |
| Shared-vs-local rule | One test for seed and additions alike: **≥3 occurrences AND ≥2 slices**. Everything else lives in `pages.<slice>.*` |
| CRUD toasts | Parameterized on `{{entity}}`; non-uniform messages stay per-page |
| CSV export | **Not translated** — headers and filename stay English |
| Validation / API error text | Out of scope, deferred to sub-project B |

### Why CSV stays English

`generateCSV` headers (`UserManagement.tsx:379-387`) and the `users-YYYY-MM-DD.csv` filename are a data contract, not UI. Exported files get opened in Excel, fed to scripts, and matched by column name; a header that changes with the exporter's UI language silently breaks anything downstream that matches on it. The export *button* and its success toast are UI and are translated.

### Why `toast.*` sits outside `common.*`

`common.*` holds strings that get dropped into JSX as-is. `toast.*` holds templates that require a parameter. Keeping them in separate namespaces makes the calling contract visible at the call site, which matters because a missing or misnamed parameter renders literal `{{entity}}` text to the user and neither `tsc` nor ESLint catches it — only the dev-mode warning added at the end of phase 1 does, and only if someone is watching the console.

Thai suits this template shape unusually well: it has no inflection and no capitalization, so `'ลบ {{entity}} สำเร็จ'` reads correctly for every entity. English does not — `'{{entity}} deleted successfully'` needs the entity capitalized. Rather than transform case at runtime (which is wrong in many languages), **every `entity.*` value is stored already capitalized in English** and the template inserts it verbatim.

## Catalog structure

Extends the existing catalogs; introduces no new mechanism. `src/i18n/en.ts` remains the source of truth and `TKey` still derives from it, so a missing key in `th.ts` remains a compile error.

```ts
common: {
  // existing from phase 1
  confirm, cancel, searchPlaceholder, clearSearch,
  tryAgain, couldNotLoad, noMatchesFound, noMatchesDescription,

  // seeded in this slice: the 75 strings that occur >=3 times AND span >=2 slices
  status: { active: 'Active', inactive: 'Inactive', label: 'Status',
            deleted: 'Deleted', archived: 'Archived', expired: 'Expired',
            scheduled: 'Scheduled' },
  // note: 'Published' and 'Edit' are NOT here. Both clear 3 occurrences but sit in
  // one slice each (Broadcasts+News, Licenses), so they stay local until a second
  // slice needs them. This is the rule doing its job, not an oversight.
  action: { saveChanges: 'Save Changes', saving: 'Saving...',
            delete: 'Delete', deleting: 'Deleting...', remove: 'Remove',
            adding: 'Adding...', creating: 'Creating...',
            clear: 'Clear', filters: 'Filters', loading: 'Loading...' },
  audit:  { createdAt: 'Created at', createdBy: 'Created by',
            updatedAt: 'Updated at', updatedBy: 'Updated by' },
  unsavedChanges: 'Unsaved changes', noChanges: 'No changes',
  description: 'Description', noExpiry: 'No expiry',
  // Appendix A lists all 102 candidates and marks which of the 75 qualify.
  // The grouping above is illustrative; the plan assigns every qualifier a key.
}

entity: {                       // capitalized in English; the toast templates insert verbatim
  user: 'User', cluster: 'Cluster', businessUnit: 'Business Unit',
  application: 'Application', role: 'Role', news: 'News',
  broadcast: 'Broadcast', reportTemplate: 'Report Template',
  // Slice 1 adds only the entities its own toasts name. Later slices add theirs.
}

toast: {
  created:      '{{entity}} created successfully',
  deleted:      '{{entity}} deleted successfully',
  deleteFailed: 'Failed to delete {{entity}}',
  saved:        'Changes saved successfully',
  exported:     'Data exported successfully',
}

pages: {
  // ~57 keys that belong to this slice alone — page titles, field labels, filter
  // options, the non-uniform toasts. The plan enumerates every one against the
  // literal it replaces; nothing here is decided at implementation time.
  users: { /* enumerated in the plan */ }
}
```

### The shared-vs-local rule

One test, applied identically to the seed and to every later addition: **the string occurs three or more times AND appears in at least two slices.**

An earlier draft defined the seed by occurrence count alone and added the two-slice clause only for later additions. Running the filter showed why that was wrong. Of the 102 strings occurring three or more times, **27 appear in only one slice** — they are that slice's vocabulary, not the app's:

- `Standard` and `Custom` (6× and 4×, Report Templates only)
- `Subscription`, `By cluster`, `By subscription`, `License Number`, `Start date`, `End date` (Licenses only)
- `Severity`, `Message`, `System`, `Title is required`, `Published` (Broadcasts + News only)
- `Add Super Admin`, `Deploy all`, `Sessions`, `Element`, `Active users`, `Permissions`, `Platform-wide`, `No matches` (Platform admin only)
- `App ID copied`, `Device` (Applications only); `People` (Cluster Admin only); `Capacity unavailable` (Clusters only); `Edit` (Licenses only)
- **`Access Denied`** (Login only) — and this one is not merely local. It is the string `Login.tsx:109` matches against **backend** response text. Phase 1's spec forbids touching it. Promoting it into `common.*` would invite a later slice to translate it, and 403 detection would fail silently with nothing red to show for it.

**The seed is therefore 75 strings, not 102.** The 27 above stay in their own slice's `pages.*` namespace, where a later slice can promote one if a second slice genuinely needs it.

The rule is arithmetic rather than a matter of taste, so every slice applies it the same way without relitigating.

A later slice adding to `common.*` must show the same evidence. Reviewers of every slice check one thing specifically: **does any new `pages.*` key duplicate a value that already exists in `common.*`?** That check is what keeps the catalog from fragmenting over nine slices.

### Casing variants get separate keys, not merged ones

The measurement surfaces pairs that differ only in case — `Business Units` / `Business units`, and inside `UserEdit.tsx` alone, `First Name` / `First name`, `Last Name` / `Last name`, `Middle Name` / `Middle name`, `Alias Name` / `Alias name`.

An earlier draft of this spec called these a pre-existing inconsistency and told the implementer to unify them. **That instruction was wrong and is reversed here.** Reading the call sites shows the `UserEdit` pairs are a deliberate and consistently applied convention:

```tsx
<Label htmlFor="firstname">First Name</Label>     // Title Case for labels
<Input placeholder="First name" />                 // sentence case for placeholders
```

All four pairs follow it. Merging them would push Title Case into every placeholder on the page and destroy a distinction someone designed.

**The rule: a casing variant is a distinct string and gets its own key.** Where both forms are genuinely shared, `common.*` carries both — for example `common.field.firstNameLabel` and `common.field.firstNamePlaceholder`. Never collapse two spellings into one key on the assumption that one of them is a typo; read the call sites first.

`Business Units` / `Business units` is a real inconsistency rather than a convention — it is mixed across titles and labels with no discernible rule — but **no file in this slice uses either form**, so slice 1 does not touch it. Whichever later slice owns those files decides.

**This slice makes no copy changes at all.** Every English string it produces is byte-identical to the one it replaces.

## Scope

### In scope

| File | Unique strings | Of which shared |
|---|---|---|
| `src/pages/UserManagement.tsx` (929 lines) | 42 | 25 |
| `src/pages/UserEdit.tsx` (894 lines) | 54 | 18 |
| `src/pages/userEdit/UserAccessTree.tsx` | 9 | 7 |
| `src/pages/userManagement/UserDirectorySummary.tsx` | 5 | 4 |
| `src/pages/userEdit/UserIdentityHero.tsx` | 3 | 2 |

Plus `src/i18n/en.ts` and `src/i18n/th.ts` for the seeded shared catalog (~110 keys) and this slice's ~57 page keys.

### Deliberately out of scope

- **CSV headers and the export filename** — `UserManagement.tsx:379-387`. Do not touch.
- **`validateField` output** — two call sites in `UserEdit.tsx`. Its messages stay English until sub-project B.
- **`getErrorDetail` / `parseApiError` output** — backend text, passed through.
- The other 144 page files.

## The `useMemo` requirement

`UserManagement.tsx:413` builds its column definitions in a `useMemo` holding eight `header:` values. Once those call `t()`, **`t` must appear in that memo's dependency array**, or the table headers stay frozen in the previous language while the rest of the page updates.

This is not incidental to this slice. Every Management page in the app builds columns the same way, so **every remaining slice will hit it**. It is recorded here as a standing requirement rather than left for each slice to rediscover. `react-hooks/exhaustive-deps` catches it, and lint is a gate — but a reviewer should confirm it rather than assume the linter ran.

## Verification

1. `bun run typecheck && bun run lint && bun run test` all clean.
2. **The four existing test files for these pages must pass unmodified** — `UserManagement.test.tsx` (30 assertions), `UserEdit.test.tsx` (12), `UserDirectorySummary.test.tsx`, `UserAccessTree.test.tsx`. English is the default language and the provider-less fallback, so byte-identical English values keep them green. A red test means a catalog value drifted: **fix the catalog, never the test.**
3. `CI=true bun run build:dev` passes.
4. **Prove the interpolation renders**, don't just compile it: `t('toast.deleted', { entity: t('entity.user') })` must produce exactly `User deleted successfully`. A misnamed parameter ships literal `{{entity}}` to the user and passes both `tsc` and ESLint.
5. **In a real browser**, at both languages:
   - `/users` and `/users/:id/edit` read Thai end to end, except the deliberate exclusions above.
   - Switching language updates the **table headers** — this is the `useMemo` requirement observed rather than assumed.
   - 390px, measured through an iframe reporting `innerWidth` rather than by resizing the window.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| Thai column headers are longer and break sticky/frozen columns | High | This is the first slice with a full data table. Inspect the frozen columns in both languages; the repo's contract for them is in `agent-os/standards/styling/`. |
| A form shows Thai labels with English validation errors | High, expected | Consequence of deferring sub-project B. Recorded here so it is not filed as a bug. |
| Later slices duplicate keys instead of reusing `common.*` | Medium | The arithmetic rule above, plus the explicit reviewer check on every slice. |
| CSV headers translated by accident | Medium | The exact lines are named in this spec and must be called out in the plan. |
| The `{{entity}}` template reads awkwardly for some entity | Medium | Non-uniform messages stay per-page rather than being forced into the template. |

## Out of scope, for later specs

- Slices 2 through 10 above, each getting its own spec, plan, and implementation cycle.
- Sub-project B: `errorParser.ts` and `validateField` returning keys instead of sentences, and the 164 call sites that follow.
- The Thai terminology sign-off deferred from phase 1 — nine strings were adjusted in commit `86c7e39` on the controller's judgment and still want a native speaker's review.

---

## Appendix A — the seeded shared vocabulary

Every string occurring three or more times across `src/pages/**/*.tsx`, with its
occurrence count. **This is the candidate list, not the seed** — 75 of the 102 also span two
or more slices and become `common.*`; the other 27 are named in the rule section above and
stay local to their slice.

Regenerate with:

```bash
find src/pages -name "*.tsx" -not -name "*.test.tsx" -exec grep -ohE \
  ">[A-Z][A-Za-z0-9 ,.'\u2019()%-]{3,}<|'[A-Z][a-z][A-Za-z ,.'()-]{4,}'|\"[A-Z][a-z][A-Za-z ,.()-]{4,}\"" {} \; \
  | sed "s/^[>'\"]//; s/[<'\"]$//" | sed 's/^ *//; s/ *$//' | grep -v '^$' \
  | sort | uniq -c | sort -rn | awk '$1>=3'
```

**This extraction undercounts.** It matches quoted literals and simple JSX text only, so it
misses interpolated JSX expressions, template literals, and lowercase strings — the three
categories that caused every miss in phase 1. Treat the list as a floor, not a census: the
implementer translates what is actually in each file, and uses this table to decide which of
those strings is shared rather than local.

| String | Occurrences |
|---|---|
| Active | 74 |
| Inactive | 60 |
| Status | 59 |
| Saving... | 18 |
| Data exported successfully | 16 |
| Save Changes | 15 |
| Filters | 14 |
| Cluster | 14 |
| Updated by | 13 |
| Updated at | 13 |
| No expiry | 13 |
| Created by | 13 |
| Created at | 13 |
| Business Unit | 13 |
| Unsaved changes | 11 |
| Description | 11 |
| Delete | 11 |
| Changes saved successfully | 11 |
| Deleted | 10 |
| Clear | 10 |
| Remove | 8 |
| No changes | 8 |
| Loading... | 8 |
| Scheduled | 7 |
| Platform | 7 |
| Name is required | 7 |
| Username | 6 |
| Standard | 6 |
| Expired | 6 |
| Scope | 5 |
| Published | 5 |
| Note | 5 |
| Manage licences | 5 |
| Escape | 5 |
| Default | 5 |
| Company | 5 |
| Cluster Role | 5 |
| Business units | 5 |
| Business Units | 5 |
| Subscription | 4 |
| Start | 4 |
| Select a cluster | 4 |
| Platform-wide | 4 |
| No business units | 4 |
| Expires | 4 |
| Deleting... | 4 |
| Default Currency | 4 |
| Database Pool | 4 |
| Custom | 4 |
| Cluster is required | 4 |
| Capacity unavailable | 4 |
| Cancel | 4 |
| By cluster | 4 |
| BU Role | 4 |
| Avatar | 4 |
| Archived | 4 |
| Application | 4 |
| Adding... | 4 |
| Add User | 4 |
| Unknown user | 3 |
| Title is required | 3 |
| System | 3 |
| Subscriptions | 3 |
| Start date | 3 |
| Severity | 3 |
| Sessions | 3 |
| Select a business unit | 3 |
| Search business units... | 3 |
| Reference | 3 |
| Quota Expires | 3 |
| Permissions | 3 |
| People | 3 |
| No matches | 3 |
| No clusters to administer | 3 |
| No business units yet | 3 |
| No business units in this cluster. | 3 |
| Name | 3 |
| Message | 3 |
| Loading business units... | 3 |
| Licensing | 3 |
| License Number | 3 |
| Identity | 3 |
| Function | 3 |
| Failed to load business units | 3 |
| End date | 3 |
| Email | 3 |
| Element | 3 |
| Edit | 3 |
| Device | 3 |
| Deploy all | 3 |
| Creating... | 3 |
| Content | 3 |
| Configuration | 3 |
| By subscription | 3 |
| Branding | 3 |
| Average | 3 |
| App ID copied | 3 |
| Alias Name | 3 |
| Add Super Admin | 3 |
| Active users | 3 |
| Access Denied | 3 |
| Access | 3 |
