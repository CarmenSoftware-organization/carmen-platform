# E2E Test-Case Register — Design

**Date:** 2026-06-11
**Status:** Approved (ready for implementation plan)
**Builds on:** `2026-06-11-e2e-result-capture-index-design.md` (the existing `e2e-results/index.html` generator)

## Goal

Turn the existing E2E result index into a full **test-case register**. Each of the
182 tests becomes a documented test case with these 13 columns, in this exact order:

```
Seq · Test ID · Status · Title · Preconditions · Steps · Expected Result ·
Priority · Test Type · Run Date · Duration (ms) · Error · Note
```

Two artifacts are produced from one run:

- **`e2e-results/index.html`** — enhanced, browsable (expandable rows).
- **`e2e-results/test-cases.csv`** — the 13 columns above, importable into Excel /
  test-management tools.

## Column sourcing

| Column | Source |
|--------|--------|
| Seq | Global 1..N sequence in report order (generator-assigned) |
| Test ID | `caseId` annotation (`TC-<PREFIX>-XXYYYY`); falls back to Playwright `spec.id` |
| Status | `result.status` (passed / failed / timedOut / interrupted / skipped) |
| Title | Full title path (`describe › test`) |
| Preconditions | `precondition` annotation(s), joined |
| Steps | `step` annotations, collected in order and auto-numbered |
| Expected Result | `expected` annotation |
| Priority | `priority` annotation (P1 / P2 / P3) |
| Test Type | `testType` annotation (CRUD / Validation / Security / Navigation / Smoke …) |
| Run Date | `result.startTime` → `YYYY-MM-DD HH:MM:SS` |
| Duration (ms) | `result.duration` (raw integer ms) |
| Error | `result.errors` joined, ANSI-stripped |
| Note | `note` annotation |

The first seven authored fields (`caseId, priority, testType, precondition, step,
expected, note`) come from Playwright **annotations**; the rest come natively from
the JSON report. No `playwright.config.ts` change is required — `screenshot`,
`trace`, `video` are already `on` and the JSON reporter already writes
`e2e-results/results.json`.

## 1. Test ID scheme

Adopted verbatim from the sibling repo
`CarmenSoftware-organization/carmen-inventory-frontend-e2e` (`docs/test-id-scheme.md`).

**Format:** `TC-<PREFIX>-XXYYYY`
**Regex:** `^TC-[A-Z]{2,5}-\d{6}$`
`XX` = section block (01–99) · `YYYY` = sequence within section (0001–9999).

### Section blocks (purpose-driven, NOT file-driven)

| Block | Purpose |
|-------|---------|
| 01 | List / Search / Filter |
| 02 | Detail / View |
| 03 | Create |
| 04 | Edit / Update |
| 05 | Delete |
| 06–09 | Sub-journeys |
| 10–19 | Security / Authorization |
| 20–29 | Validation |
| 30–39 | Integration / External |
| 40–89 | Module-specific (e.g. navigation, branding, image upload) |
| 90–99 | Edge cases / experimental |

A test is classified by what it *does*, not which file it lives in. Example:
`cluster-create.spec.ts` create tests are `TC-CLU-03xxxx`, its "validation errors for
empty required fields" test is `TC-CLU-20xxxx`, and its "navigate back" test is a
module-specific `TC-CLU-40xxxx`.

### Module catalog (carmen-platform)

Written to a new **`docs/test-id-scheme.md`** mirroring the source repo.

| Feature folder | Prefix | Typical sections |
|----------------|--------|------------------|
| `applications/` | `APP` | 01, 03–05, 20 |
| `auth/` (login, logout) | `AUTH` | 01, 10–19 |
| `broadcast/` | `BRD` | 20, 40–89 (compose, never sends) |
| `business-units/` | `BU` | 01, 03–05, 20 |
| `changelog/` | `CHG` | 01–02 |
| `clusters/` | `CLU` | 01, 03–05, 20, 40 |
| `dashboard/` | `DSH` | 01–02 |
| `news/` | `NWS` | 01, 03–05, 40 (image upload) |
| `permission-catalog/` | `PC` | 01–02 |
| `print-template-mapping/` | `PTM` | 01–05, 40 |
| `profile/` | `PRF` | 02, 04 |
| `report-templates/` | `RT` | 01, 03–05 |
| `roles/` | `ROL` | 01, 03–05 |
| `super-admins/` | `SA` | 03, 05, 10 |
| `user-platform/` | `UP` | 01, 04 |
| `users/` | `USR` | 01, 03–05, 20 |

Prefixes are 2–5 uppercase letters and unique. The catalog is the source of truth for
the validator.

## 2. Annotation convention

Each test gets a static annotation block via Playwright's
`test(title, details, body)` form. Existing test bodies are unchanged.

```ts
test('should create a new cluster with all fields', {
  annotation: [
    { type: 'caseId',       description: 'TC-CLU-030001' },
    { type: 'priority',     description: 'P1' },
    { type: 'testType',     description: 'CRUD' },
    { type: 'precondition', description: 'Logged in as super admin' },
    { type: 'step',         description: 'Open Clusters → click Add' },
    { type: 'step',         description: 'Fill all fields and Save' },
    { type: 'step',         description: 'Search the new code in the list' },
    { type: 'expected',     description: 'Save returns 200/201 and the cluster is searchable' },
    { type: 'note',         description: '' },
  ],
}, async ({ page }) => { /* unchanged */ });
```

Rules:
- `step` repeats; parser collects in order and auto-numbers.
- All fields optional → missing renders blank.
- `caseId` recommended for every test; `spec.id` is the only fallback.
- No runtime cost; greppable; co-located with the test.

## 3. Parser & generator changes

### `scripts/lib/e2e-index-format.mjs` (pure, no I/O)

- Extend `parseResults()` to also collect per test: `annotations` (from
  `test.annotations`), `startTime` (last result), `errors` (joined + ANSI-stripped).
- New `stripAnsi(s)` helper.
- New `formatRunDate(startTime)` → `YYYY-MM-DD HH:MM:SS`.
- New `extractAnnotations(annotations)` → `{ caseId, priority, testType,
  preconditions[], steps[], expected, note }`.
- New `toTestCase(test, seq)` → the 13 canonical fields (Test ID applies the
  `caseId ?? spec.id` fallback; Steps numbered; Duration raw ms).
- New `toCsv(testCases)` → RFC-4180 CSV (header row = the 13 column names; quote
  fields containing `, " \n`; escape `"` as `""`).
- New `validateCaseIds(testCases, catalogPrefixes)` → returns an array of error
  strings: regex violations, unknown prefixes, duplicate IDs. (Empty array = valid.)
- `renderIndexHtml()` reworked to expandable rows (see §4).

### `scripts/generate-e2e-index.mjs` (orchestrator)

- After parsing, build test cases, run `validateCaseIds`; print warnings (non-fatal)
  for any violations so authoring drift is visible.
- Write `e2e-results/test-cases.csv` alongside `index.html`.
- Console summary unchanged in spirit (totals + new "CSV written" line).

## 4. HTML layout — expandable rows

A flat 13-column table plus inline video would be unusably wide. Instead:

- **Summary row** (scannable): Seq · Test ID · Status badge · Priority · Test Type ·
  Title · Run Date · Duration.
- **Expanded panel** (toggle on row click): Preconditions, numbered Steps, Expected
  Result, Note, Error (ANSI-stripped, mono), and the existing thumbnail / video /
  trace-command / "open in report" artifacts.
- Grouping by spec file is retained (current section headers).
- Self-contained, no external assets/JS beyond a tiny inline toggle script.

## 5. Bulk rollout — annotate all 182 tests

Fan out **per spec file** (43 subagents, grouped by feature). Each subagent:

1. Reads its spec + the page objects it drives to understand each test's real behavior.
2. Inserts an annotation block per test (body untouched).
3. Assigns `caseId` from the module catalog: correct prefix, section block by purpose,
   sequence within section.
4. Authors Preconditions / Steps / Expected from the actual actions; Priority &
   Test Type from the rubric below.

### Priority / Test Type rubric (for consistency)

- **Test Type:** CRUD (create/edit/delete happy paths), Validation (required-field /
  format errors), Security (authz / privilege guards), Navigation (back / routing),
  Search, Filter, Smoke (list loads), Integration (cross-service, e.g. micro-report).
- **Priority:** P1 = core CRUD happy paths & security guards; P2 = validation,
  search/filter, navigation; P3 = edge / cosmetic.

### DEV-mutation safety (unchanged invariants — annotations only, no behavior change)

Authoring must not alter test logic. The existing invariants stay intact: broadcast
never sends, Print Mapping unchecks `is_default`, Super Admin / User Platform specs
never touch the login user, seeded roles/permissions untouched, profile specs stay
serialized. Subagents add annotations only.

## 6. Testing

Extend `scripts/lib/e2e-index-format.test.mjs` (`node --test`):

- annotation extraction (all keys, repeated `step` ordering & numbering)
- `caseId` fallback to `spec.id` when absent
- `validateCaseIds`: regex pass/fail, unknown prefix, duplicate detection
- `toCsv` escaping (commas, embedded quotes, newlines, blank fields)
- `formatRunDate` formatting; missing `startTime` → blank
- `stripAnsi` on a sample Playwright error
- blank-field rendering (no annotations → empty columns, no crash)

`bun run test:scripts` must stay green. After implementation, a real
`bun run test:e2e:full` validates the end-to-end artifacts.

## Out of scope

- No CI wiring for the validator (it warns locally; CI gating is a follow-up).
- No change to which artifacts Playwright captures (already `on`).
- No backend or app `src/` changes — this is E2E tooling + test annotations only.

## File touch list

- **New:** `docs/test-id-scheme.md`, this design doc.
- **Modified:** `scripts/lib/e2e-index-format.mjs`,
  `scripts/lib/e2e-index-format.test.mjs`, `scripts/generate-e2e-index.mjs`,
  all 43 `e2e/tests/**/*.spec.ts` (annotations only).
- **Generated (gitignored):** `e2e-results/index.html`, `e2e-results/test-cases.csv`.
