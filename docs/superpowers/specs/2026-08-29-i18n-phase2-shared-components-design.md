# i18n Phase 2, Slice 5.5: Shared Components — Design

**Date:** 2026-08-29
**Status:** Approved (design), not yet implemented
**Scope:** Frontend only. `src/components/` excluding `src/components/ui/`.
**Predecessors:** #169 shell, #170 Users, #171 pure utils, #172 Broadcasts+News, #173 Subscriptions, #174 Licenses, #175 Cluster Admin, #176 Business Units
**Base:** `3acd3fe` (main, after #176)

## Why this slice exists, and why it runs now instead of last

Phase 2 is sliced by **page directory**. `src/components/` sits orthogonal to that split: its
components render on pages belonging to every slice, and **no slice can reach them from its own
files**. Specs 4 and 5 both deferred them "to the infrastructure pass".

Slice 5 found the flaw in deferring. `BrandingImageUpload.tsx` renders `Upload {label}` with the
label already translated — producing `Upload โลโก้` on a Thai page. Slice 4 imports the same
component and never saw it, because slice 4's browser pass looked at the cluster profile, which has
no branding card. **A browser pass only sees the screens you open.** Deferring five more times means
five more slices meeting mixed-language output, each deciding again whether it is in scope.

### The deferral criterion, corrected

The earlier specs deferred by reach — "used on ~15 pages, too broad for one slice". That is the
wrong axis. The question is **can the caller override the English?**

| Component | Reach | Caller can override? | Verdict |
|---|---|---|---|
| `auditColumns.tsx` | ~15 pages | Yes — every table spreads the column and can replace `header` | Deferrable, but included here anyway (see below) |
| `BrandingImageUpload.tsx` | 4 callers | **No** — the English is inside its own render | Not deferrable |

Under the reach criterion the un-deferrable component was deferred and the deferrable one looked
urgent. `auditColumns` / `AuditMeta` / `relativeTime` are included in this slice regardless: a pass
that exists to translate shared components should not leave three of them for 15 call sites to
patch individually.

## Measurement

| | measured |
|---|---|
| Files (non-test, excluding `ui/`) | **44** |
| Raw English hits | **107 across 23 files** (re-measured on `3acd3fe`, after #176 translated 3 of them) |
| Files already on `useI18n` | **17** — but 7 of those still carry untranslated strings |
| Files needing work after false positives are removed | **~15** |
| **Thai-only strings rendering to English users** | **5, all in `analytics/DateRangeFilter.tsx`** |

The raw 109 includes false positives that must be verified, not translated — see below.

### Concentration

```
DialogPreview 13 · XmlEditor 12 · TenantSeedCard 11 · TenantMigrationCard 9
BusinessUnitMultiSelect 6 · UserMultiSelect 6 · InterfaceEntitlementCard 5 · UserPicker 5
ImageUpload 4 · MarkdownEditor 4 · AuditMeta 3 · auditColumns 2
PrivateRoute 2 · ClusterAdminRoute 2 · AuthedRoute 1 · PermissionPicker 1
```

**Already on `useI18n`, and their residual hits are all false positives** — verify, do not translate:
`KeyboardShortcuts` 7 (all `KeyboardEvent.key` names + DOM tag names) · `BroadcastPreview` 6 (severity
enum VALUES) · `BuSwitcher` 3 (arrow-key names) · `BrandingImageUpload` 2 · `ClusterSwitcher` 1 ·
`LanguageToggle` 1 (`'English'` — a language name, correctly untranslated) · `Sidebar` 1
(`'Carmen Platform'` — a brand name).

**`PageHeader.tsx`, `TabStrip.tsx` and `BrandingImageUpload.tsx` were translated by #176** and are
out of this slice: slice 5 found all three on its own Edit page and fixed them under the
caller-override test rather than deferring them here.

## The scan that found the English cannot find the Thai

`DateRangeFilter.tsx` does not appear in the 25-file English scan **at all** — it has no English
strings to match. Its labels are Thai:

```
101  setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
105  setError(`เลือกได้สูงสุด ${MAX_RANGE_DAYS} วัน`)
115  <Label htmlFor="range-preset">ช่วงวัน</Label>
131  <Label htmlFor="range-from">ตั้งแต่</Label>
139  <Label htmlFor="range-to">ถึง</Label>
```

English users read Thai on the analytics page today. This is the same class of live defect the
Broadcast feature carried (five strings, found in slice 2), not an i18n gap.

**Rule: sweep in both directions.** An English-string extractor is blind to a fully-Thai file, and a
Thai extractor is blind to a fully-English one. Neither sweep alone is a measurement.

## False positives in the raw count — verify before translating

The extractor matches capitalised quoted strings, which catches four non-user-visible classes:

| Class | Examples | Action |
|---|---|---|
| **Keyboard key names** (`KeyboardEvent.key`) | `'Escape'`, `'Enter'`, `'Backspace'`, `'ArrowUp'`, `'ArrowDown'`, `'Ctrl'` | Never translate — comparing against a translated key name breaks the handler |
| **DOM tag names** | `'INPUT'`, `'TEXTAREA'` | Never translate |
| **Enum / API values** | `BroadcastPreview` severities `'WARNING'`, `'CRITICAL'`, `'INFO'`, `'OTHER'` | Translate the **label**, never the value — `Record<Severity, TKey>` |
| **Identifiers that read like prose** | `'Promise'`, `'News'` (a storage folder), `'C'` | Read the line before deciding |

Slice 4 listed nine hazard sites and one was an avatar initial. **Verify each site; a hazard list is
a lead, not evidence.**

## Decisions

| Question | Decision |
|---|---|
| Byte-identity | Applies in full to every English string |
| `src/components/ui/` | **Out of scope** — CLAUDE.md forbids modifying the primitives without an explicit ask |
| `DateRangeFilter` Thai | Translate both ways: English becomes the catalog default, Thai keeps today's wording |
| Namespace | `common.*` where the meaning is general; `components.<name>.*` where it is specific to one component |
| Test files | **None change.** Any test file in the diff is a defect |
| Enum lookups | `Record<Union, TKey>`; `\|\| raw` only for genuinely unbounded backend values |

## Namespace rule for this slice

A shared component is not a page and has no `pages.*` namespace. Two homes:

- **`common.*`** — when the string means the same thing anywhere it appears (`Back`, `Loading...`,
  `Clear all`, `Select all`, `Copied to clipboard`). Prefer this; the catalog already holds most of
  them after five slices.
- **`components.<componentName>.*`** — only when the string is specific to that component's own
  concern (`DialogPreview`'s `No XML provided`, `XmlEditor`'s `Already formatted`).

**A shared component must never read a `pages.*` key.** It renders under many pages; borrowing one
page's namespace makes an edit there silently change every other page.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| A keyboard key name or enum value gets translated, breaking behaviour | **High** | Every match in the four false-positive classes is verified at its line before any edit. A translated `'Escape'` breaks a handler silently — no test covers it |
| A reused `common.*` key matches in English but not in meaning | High | Seven instances across five branches. Check the call site and **read the Thai** |
| `DateRangeFilter`'s English is invented, not recovered | Medium | It has no prior English. The English is new text and must be reviewed as new copy, not as a translation |
| A component is translated but its consumers pass English props in | Medium | Check each component's props: a `label`/`title` prop supplied by a caller is the caller's to translate, not this slice's |
| 25 files is wide | Medium | Grouped into 5 tasks by concern, none over ~25 strings |

## Verification

1. `bun run typecheck && bun run lint && bun run test` clean; `CI=true bun run build:dev` passes.
2. **All 144 test files pass with none modified.** `git diff --name-only | grep '\.test\.'` prints nothing.
3. Every English catalog value byte-identical to the literal it replaced — except `DateRangeFilter`,
   whose English is new and is listed separately in the report for review as copy.
4. **Both sweeps clean**: `grep -n "[ก-๙]"` across the 44 files leaves only comments, AND the English
   extractor's remaining hits are all verified false positives, each named in the report.
5. No `common.*` key added that duplicates an existing value; no `components.*` key that should have
   been `common.*`.
6. **Every keyboard-key and enum-value site is named in the report as deliberately untranslated.**
7. **In a browser, in Thai:** a page carrying each of the five largest components — XML editor,
   dialog preview, tenant cards, the multi-selects, analytics date range. Zero `[i18n]` warnings.
8. **In a browser, in English:** the same screens, byte-identical, and the analytics filter now
   reads English where it read Thai.

## Out of scope

- `src/components/ui/` primitives.
- Slices 6-10.
- Strings a caller passes in as props — those belong to the calling page's slice.
