# E2E Test-Case Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing E2E result index into a 13-column test-case register, emitting both an enhanced `e2e-results/index.html` (expandable rows) and an `e2e-results/test-cases.csv`, with every test annotated using a `TC-<PREFIX>-XXYYYY` ID scheme.

**Architecture:** Pure helpers in `scripts/lib/e2e-index-format.mjs` parse Playwright's `results.json` (including per-test annotations, `startTime`, and `errors`) into 13 canonical fields. The orchestrator `scripts/generate-e2e-index.mjs` writes the CSV and HTML and warns on Test-ID violations. Authored fields come from Playwright `test(title, { annotation }, body)` blocks added to all 43 spec files (test bodies untouched).

**Tech Stack:** Node ESM (`.mjs`), `node:test` + `node:assert/strict` for unit tests, Playwright JSON reporter (already configured), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-e2e-test-case-register-design.md`

---

## File Structure

- `docs/test-id-scheme.md` — **new.** Human-readable ID scheme + carmen-platform module catalog.
- `scripts/lib/e2e-index-format.mjs` — **modified.** Add `stripAnsi`, `formatRunDate`, `extractAnnotations`, `toTestCase`, `CSV_COLUMNS`, `toCsv`, `MODULE_PREFIXES`, `validateCaseIds`; extend `parseResults`; rework `renderIndexHtml` to expandable rows.
- `scripts/lib/e2e-index-format.test.mjs` — **modified.** Unit tests for all new helpers.
- `scripts/generate-e2e-index.mjs` — **modified.** Attach `.case` per test, write CSV, run validator (warn), feed HTML.
- `e2e/tests/**/*.spec.ts` — **modified (annotations only).** All 43 files get per-test annotation blocks.

All lib helpers stay pure (no I/O); only the orchestrator touches the filesystem.

---

## Rollout Protocol (used by Tasks 10a–10p)

Every annotation task follows this exact protocol. Test bodies are **never** changed — only an `annotation` array is added to each `test(...)` call.

**Annotation template** (omit a key when its value would be empty; `step` repeats):

```ts
test('<existing title>', {
  annotation: [
    { type: 'caseId',       description: 'TC-<PREFIX>-XXYYYY' },
    { type: 'priority',     description: 'P1' },          // P1 | P2 | P3
    { type: 'testType',     description: 'CRUD' },        // see rubric
    { type: 'precondition', description: '<state before test>' },
    { type: 'step',         description: '<action 1>' },
    { type: 'step',         description: '<action 2>' },
    { type: 'expected',     description: '<observable outcome>' },
    { type: 'note',         description: '<optional caveat or invariant>' },
  ],
}, async ({ page }) => { /* unchanged body */ });
```

**Test ID rules** — `TC-<PREFIX>-XXYYYY`, regex `^TC-[A-Z]{2,5}-\d{6}$`:
- `<PREFIX>` = the feature's catalogued prefix (see each task header).
- `XX` = **section block by test purpose** (not file): `01` List/Search/Filter · `02` Detail/View · `03` Create · `04` Edit · `05` Delete · `06–09` Sub-journeys · `10–19` Security · `20–29` Validation · `30–39` Integration · `40–89` Module-specific (navigation, branding, image upload) · `90–99` Edge.
- `YYYY` = zero-padded sequence within that section for that prefix, starting `0001`.

**Priority / Test Type rubric:**
- **Test Type:** `CRUD` (create/edit/delete happy paths), `Validation` (required-field/format errors), `Security` (authz/privilege guards), `Navigation` (back/routing), `Search`, `Filter`, `Smoke` (list loads), `Integration` (cross-service).
- **Priority:** `P1` = core CRUD happy paths & security guards; `P2` = validation, search/filter, navigation; `P3` = edge/cosmetic.

**Safety:** annotations must not change behavior. Preserve every existing invariant (broadcast never sends; Print Mapping unchecks `is_default`; Super Admin / User Platform specs never touch the login user; seeded roles/permissions untouched; profile specs stay serialized).

**Per-file procedure:** read the spec + the page objects it drives → for each `test(...)`, classify section block, assign the next sequence for `<PREFIX>+XX`, author Preconditions/Steps/Expected from the real actions, set Priority/Type from the rubric → insert the `annotation` array as the 2nd arg of `test(...)`. Then run `npx playwright test <file> --list` to confirm the file still parses.

---

## Task 1: Test-ID scheme doc + module-prefix constant

**Files:**
- Create: `docs/test-id-scheme.md`
- Modify: `scripts/lib/e2e-index-format.mjs` (add `MODULE_PREFIXES`)
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the doc**

Create `docs/test-id-scheme.md`:

```markdown
# Test ID Scheme

Format: `TC-<PREFIX>-XXYYYY` where `XX` = section block (01–99), `YYYY` = sequence within section (0001–9999).

Strict regex: `^TC-[A-Z]{2,5}-\d{6}$`

## Section block template

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
| 40–89 | Module-specific |
| 90–99 | Edge cases / experimental |

## Module catalog

| Feature folder | Prefix | Sections likely used |
|----------------|--------|----------------------|
| `applications/` | `APP` | 01, 03–05, 20 |
| `auth/` | `AUTH` | 01, 10–19 |
| `broadcast/` | `BRD` | 20, 40–89 |
| `business-units/` | `BU` | 01, 03–05, 20 |
| `changelog/` | `CHG` | 01–02 |
| `clusters/` | `CLU` | 01, 03–05, 20, 40 |
| `dashboard/` | `DSH` | 01–02 |
| `news/` | `NWS` | 01, 03–05, 40 |
| `permission-catalog/` | `PC` | 01–02 |
| `print-template-mapping/` | `PTM` | 01–05, 40 |
| `profile/` | `PRF` | 02, 04 |
| `report-templates/` | `RT` | 01, 03–05 |
| `roles/` | `ROL` | 01, 03–05 |
| `super-admins/` | `SA` | 03, 05, 10 |
| `user-platform/` | `UP` | 01, 04 |
| `users/` | `USR` | 01, 03–05, 20 |

## Adding a new module

1. Pick a unique 2–5 letter prefix not already in the table.
2. Add the row above with the section blocks you intend to use.
3. Add the prefix to `MODULE_PREFIXES` in `scripts/lib/e2e-index-format.mjs`.
4. The generator's `validateCaseIds` check warns on unknown prefixes or malformed IDs.
```

- [ ] **Step 2: Write the failing test**

Append to `scripts/lib/e2e-index-format.test.mjs`:

```js
import { MODULE_PREFIXES } from './e2e-index-format.mjs';

test('MODULE_PREFIXES holds the 16 catalogued, unique prefixes', () => {
  assert.equal(MODULE_PREFIXES.size, 16);
  for (const p of ['APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
    'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR']) {
    assert.ok(MODULE_PREFIXES.has(p), `missing prefix ${p}`);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `MODULE_PREFIXES` is not exported / undefined.

- [ ] **Step 4: Add the constant**

At the top of `scripts/lib/e2e-index-format.mjs` (after the existing `FAIL_STATUSES` line):

```js
export const MODULE_PREFIXES = new Set([
  'APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
  'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR',
]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/test-id-scheme.md scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): test-id scheme doc + MODULE_PREFIXES catalog"
```

---

## Task 2: `stripAnsi` + `formatRunDate` helpers

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```js
import { stripAnsi, formatRunDate } from './e2e-index-format.mjs';

test('stripAnsi removes color escape codes', () => {
  assert.equal(stripAnsi('[31mError:[39m boom'), 'Error: boom');
  assert.equal(stripAnsi(undefined), '');
});

test('formatRunDate yields YYYY-MM-DD HH:MM:SS from ISO, blank when missing', () => {
  assert.equal(formatRunDate('2026-06-11T03:15:42.123Z'), '2026-06-11 03:15:42');
  assert.equal(formatRunDate(''), '');
  assert.equal(formatRunDate(undefined), '');
  assert.equal(formatRunDate('not-a-date'), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `stripAnsi`/`formatRunDate` undefined.

- [ ] **Step 3: Add the helpers**

Add to `scripts/lib/e2e-index-format.mjs`:

```js
export function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/\[[0-9;]*m/g, '');
}

// startTime is an ISO string (UTC). Slice instead of new Date() so output is
// timezone-stable and deterministic in tests.
export function formatRunDate(startTime) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(String(startTime ?? ''));
  return m ? `${m[1]} ${m[2]}` : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): stripAnsi + formatRunDate helpers"
```

---

## Task 3: `extractAnnotations`

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { extractAnnotations } from './e2e-index-format.mjs';

test('extractAnnotations groups known types, collects repeated steps in order', () => {
  const out = extractAnnotations([
    { type: 'caseId', description: 'TC-CLU-030001' },
    { type: 'priority', description: 'P1' },
    { type: 'testType', description: 'CRUD' },
    { type: 'precondition', description: 'Logged in' },
    { type: 'step', description: 'open' },
    { type: 'step', description: 'save' },
    { type: 'expected', description: 'created' },
    { type: 'note', description: 'n/a' },
    { type: 'unknown', description: 'ignored' },
  ]);
  assert.equal(out.caseId, 'TC-CLU-030001');
  assert.equal(out.priority, 'P1');
  assert.equal(out.testType, 'CRUD');
  assert.deepEqual(out.preconditions, ['Logged in']);
  assert.deepEqual(out.steps, ['open', 'save']);
  assert.equal(out.expected, 'created');
  assert.equal(out.note, 'n/a');
});

test('extractAnnotations tolerates undefined/empty', () => {
  const out = extractAnnotations(undefined);
  assert.equal(out.caseId, '');
  assert.deepEqual(out.steps, []);
  assert.deepEqual(out.preconditions, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `extractAnnotations` undefined.

- [ ] **Step 3: Implement**

Add to `scripts/lib/e2e-index-format.mjs`:

```js
export function extractAnnotations(annotations) {
  const out = {
    caseId: '', priority: '', testType: '',
    preconditions: [], steps: [], expected: '', note: '',
  };
  for (const a of annotations ?? []) {
    const desc = a?.description ?? '';
    switch (a?.type) {
      case 'caseId': out.caseId = desc; break;
      case 'priority': out.priority = desc; break;
      case 'testType': out.testType = desc; break;
      case 'precondition': out.preconditions.push(desc); break;
      case 'step': out.steps.push(desc); break;
      case 'expected': out.expected = desc; break;
      case 'note': out.note = desc; break;
      default: break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): extractAnnotations groups annotation types"
```

---

## Task 4: Extend `parseResults` to capture annotations, startTime, errors

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs:27-59` (the `parseResults` function)
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
const annotatedFixture = {
  suites: [{
    title: 'clusters/cluster-create.spec.ts',
    file: 'e2e/tests/clusters/cluster-create.spec.ts',
    specs: [{
      id: 'spec1',
      title: 'creates a cluster',
      file: 'e2e/tests/clusters/cluster-create.spec.ts',
      line: 13,
      tests: [{
        annotations: [
          { type: 'caseId', description: 'TC-CLU-030001' },
          { type: 'step', description: 'open' },
        ],
        results: [{
          status: 'passed',
          duration: 900,
          startTime: '2026-06-11T03:15:42.000Z',
          errors: [],
          attachments: [],
        }],
      }],
    }],
  }],
};

test('parseResults captures annotations, startTime, errors', () => {
  const [t] = parseResults(annotatedFixture);
  assert.deepEqual(t.annotations, [
    { type: 'caseId', description: 'TC-CLU-030001' },
    { type: 'step', description: 'open' },
  ]);
  assert.equal(t.startTime, '2026-06-11T03:15:42.000Z');
  assert.deepEqual(t.errors, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `t.annotations`/`t.startTime`/`t.errors` are `undefined`.

- [ ] **Step 3: Extend `parseResults`**

In `scripts/lib/e2e-index-format.mjs`, inside the `for (const test of spec.tests ?? [])` loop, replace the `tests.push({ ... })` object with one that adds three fields:

```js
        tests.push({
          id: spec.id ?? `${spec.file}:${spec.line}`,
          file: spec.file ?? suite.file ?? 'unknown',
          titlePath: titleChain,
          title: spec.title ?? '(untitled)',
          status: result.status ?? 'unknown',
          durationMs: result.duration ?? 0,
          startTime: result.startTime ?? '',
          annotations: test.annotations ?? [],
          errors: result.errors ?? [],
          attachments,
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS (and the pre-existing `parseResults` test still passes).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): parseResults captures annotations/startTime/errors"
```

---

## Task 5: `toTestCase` — map a parsed test to the 13 fields

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { toTestCase } from './e2e-index-format.mjs';

test('toTestCase maps fields, numbers steps, applies caseId fallback', () => {
  const parsed = {
    id: 'spec1', titlePath: ['Cluster - Create'], title: 'creates a cluster',
    status: 'passed', durationMs: 900, startTime: '2026-06-11T03:15:42.000Z',
    annotations: [
      { type: 'caseId', description: 'TC-CLU-030001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Logged in' },
      { type: 'step', description: 'open' },
      { type: 'step', description: 'save' },
      { type: 'expected', description: 'created' },
    ],
    errors: [{ message: '[31mboom[39m' }],
  };
  const tc = toTestCase(parsed, 7);
  assert.equal(tc.seq, 7);
  assert.equal(tc.testId, 'TC-CLU-030001');
  assert.equal(tc.title, 'Cluster - Create › creates a cluster');
  assert.equal(tc.preconditions, 'Logged in');
  assert.equal(tc.steps, '1. open\n2. save');
  assert.equal(tc.expected, 'created');
  assert.equal(tc.priority, 'P1');
  assert.equal(tc.testType, 'CRUD');
  assert.equal(tc.runDate, '2026-06-11 03:15:42');
  assert.equal(tc.durationMs, 900);
  assert.equal(tc.error, 'boom');
  assert.equal(tc.note, '');
});

test('toTestCase falls back to spec id when caseId absent', () => {
  const tc = toTestCase({
    id: 'rawhash', titlePath: [], title: 't', status: 'skipped',
    durationMs: 0, startTime: '', annotations: [], errors: [],
  }, 1);
  assert.equal(tc.testId, 'rawhash');
  assert.equal(tc.steps, '');
  assert.equal(tc.runDate, '');
  assert.equal(tc.error, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `toTestCase` undefined.

- [ ] **Step 3: Implement**

Add to `scripts/lib/e2e-index-format.mjs`:

```js
export function toTestCase(test, seq) {
  const ann = extractAnnotations(test.annotations);
  const steps = ann.steps.length
    ? ann.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '';
  const error = stripAnsi(
    (test.errors ?? [])
      .map((e) => e?.message ?? e?.stack ?? '')
      .filter(Boolean)
      .join('\n\n')
  );
  const title = [...(test.titlePath ?? []), test.title].filter(Boolean).join(' › ');
  return {
    seq,
    testId: ann.caseId || test.id,
    status: test.status,
    title,
    preconditions: ann.preconditions.join('\n'),
    steps,
    expected: ann.expected,
    priority: ann.priority,
    testType: ann.testType,
    runDate: formatRunDate(test.startTime),
    durationMs: test.durationMs ?? 0,
    error,
    note: ann.note,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): toTestCase maps parsed test to 13 register fields"
```

---

## Task 6: `CSV_COLUMNS` + `toCsv` (RFC-4180)

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { CSV_COLUMNS, toCsv } from './e2e-index-format.mjs';

test('CSV_COLUMNS is the 13 columns in order', () => {
  assert.deepEqual(CSV_COLUMNS, [
    'Seq', 'Test ID', 'Status', 'Title', 'Preconditions', 'Steps',
    'Expected Result', 'Priority', 'Test Type', 'Run Date',
    'Duration (ms)', 'Error', 'Note',
  ]);
});

test('toCsv writes header + CRLF rows and RFC-4180-escapes', () => {
  const csv = toCsv([{
    seq: 1, testId: 'TC-CLU-030001', status: 'passed',
    title: 'a, b', steps: '1. x\n2. y', expected: 'ok',
    preconditions: '', priority: 'P1', testType: 'CRUD',
    runDate: '2026-06-11 03:15:42', durationMs: 900,
    error: 'he said "hi"', note: '',
  }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Seq,Test ID,Status,Title,Preconditions,Steps,Expected Result,Priority,Test Type,Run Date,Duration (ms),Error,Note');
  assert.match(lines[1], /^1,TC-CLU-030001,passed,"a, b",,"1\. x\n2\. y",ok,P1,CRUD,2026-06-11 03:15:42,900,"he said ""hi""",/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `CSV_COLUMNS`/`toCsv` undefined.

- [ ] **Step 3: Implement**

Add to `scripts/lib/e2e-index-format.mjs`:

```js
export const CSV_COLUMNS = [
  'Seq', 'Test ID', 'Status', 'Title', 'Preconditions', 'Steps',
  'Expected Result', 'Priority', 'Test Type', 'Run Date',
  'Duration (ms)', 'Error', 'Note',
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(testCases) {
  const header = CSV_COLUMNS.map(csvCell).join(',');
  const rows = testCases.map((tc) => [
    tc.seq, tc.testId, tc.status, tc.title, tc.preconditions, tc.steps,
    tc.expected, tc.priority, tc.testType, tc.runDate, tc.durationMs,
    tc.error, tc.note,
  ].map(csvCell).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): toCsv emits RFC-4180 13-column register"
```

---

## Task 7: `validateCaseIds`

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { validateCaseIds } from './e2e-index-format.mjs';

test('validateCaseIds flags format, unknown prefix, duplicate, missing', () => {
  const errs = validateCaseIds([
    { seq: 1, testId: 'TC-CLU-030001', title: 'a' },
    { seq: 2, testId: 'TC-CLU-030001', title: 'dup' },     // duplicate
    { seq: 3, testId: 'TC-ZZZ-030001', title: 'badpfx' },  // unknown prefix
    { seq: 4, testId: 'TC-CLU-3X', title: 'badfmt' },      // bad format
    { seq: 5, testId: 'rawhash', title: 'missing' },       // fallback / missing
  ]);
  assert.ok(errs.some((e) => /Duplicate Test ID "TC-CLU-030001"/.test(e)));
  assert.ok(errs.some((e) => /Unknown prefix "ZZZ"/.test(e)));
  assert.ok(errs.some((e) => /Invalid Test ID format: "TC-CLU-3X"/.test(e)));
  assert.ok(errs.some((e) => /missing caseId/.test(e)));
});

test('validateCaseIds returns [] for a clean set', () => {
  assert.deepEqual(
    validateCaseIds([{ seq: 1, testId: 'TC-CLU-030001', title: 'a' }]),
    []
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `validateCaseIds` undefined.

- [ ] **Step 3: Implement**

Add to `scripts/lib/e2e-index-format.mjs`:

```js
const CASE_ID_RE = /^TC-([A-Z]{2,5})-\d{6}$/;

export function validateCaseIds(testCases, prefixes = MODULE_PREFIXES) {
  const errors = [];
  const seen = new Map();
  for (const tc of testCases) {
    const id = tc.testId;
    if (!/^TC-/.test(String(id))) {
      errors.push(`Seq ${tc.seq} "${tc.title}": missing caseId (using fallback "${id}").`);
      continue;
    }
    const m = CASE_ID_RE.exec(id);
    if (!m) {
      errors.push(`Invalid Test ID format: "${id}" (expected TC-<PREFIX>-XXYYYY).`);
      continue;
    }
    if (!prefixes.has(m[1])) {
      errors.push(`Unknown prefix "${m[1]}" in "${id}".`);
    }
    if (seen.has(id)) {
      errors.push(`Duplicate Test ID "${id}" (seq ${seen.get(id)} and ${tc.seq}).`);
    } else {
      seen.set(id, tc.seq);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): validateCaseIds checks format/prefix/uniqueness"
```

---

## Task 8: Rework `renderIndexHtml` to expandable rows

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs:86-178` (`renderRow` + `renderIndexHtml`)
- Test: `scripts/lib/e2e-index-format.test.mjs`

Each test now renders as a **summary `<tr>`** plus a hidden **detail `<tr>`** toggled by a tiny inline script. The summary shows Seq · Test ID · Status · Priority · Test Type · Title · Run Date · Duration; the detail shows Preconditions, numbered Steps, Expected, Note, Error, and existing media. `renderIndexHtml` reads `test.case` (attached by the generator in Task 9) and `test.assets`.

- [ ] **Step 1: Update the existing render test**

Replace the `renderIndexHtml includes ...` test (currently at lines 94-119) with one that attaches a `case` per test and asserts the new structure:

```js
test('renderIndexHtml renders summary + detail rows with case fields and media', () => {
  const parsed = parseResults(fixture);
  const tests = parsed.map((t, i) => ({
    ...t,
    case: toTestCase({ ...t, annotations: [
      { type: 'caseId', description: i === 0 ? 'TC-CLU-010001' : 'TC-CLU-010002' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'step', description: 'load list' },
      { type: 'expected', description: 'rows visible' },
    ] }, i + 1),
    assets: t.status === 'passed'
      ? { thumb: 'assets/abc123/thumb.png', video: 'assets/abc123/video.webm', trace: 'assets/abc123/trace.zip' }
      : {},
  }));
  const html = renderIndexHtml({
    tests, summary: summarize(tests), generatedAt: '2026-06-11 10:00:00',
  });
  assert.match(html, /Passed 1/);
  assert.match(html, /TC-CLU-010001/);                       // Test ID column
  assert.match(html, /Smoke/);                               // Test Type column
  assert.match(html, /1\. load list/);                       // numbered steps in detail
  assert.match(html, /rows visible/);                        // expected in detail
  assert.match(html, /assets\/abc123\/video\.webm/);         // media in detail
  assert.match(html, /show-trace assets\/abc123\/trace\.zip/);
  assert.match(html, /testId=abc123/);
  assert.match(html, /ClusterManagement\.spec\.ts/);         // group header retained
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — old render lacks `case`-based columns / detail rows.

- [ ] **Step 3: Replace `renderRow` and `renderIndexHtml`**

In `scripts/lib/e2e-index-format.mjs`, replace everything from `function renderRow(test) {` through the end of `renderIndexHtml` with:

```js
function mediaCell(assets) {
  const a = assets ?? {};
  const thumb = a.thumb
    ? `<img class="thumb" src="${escapeHtml(a.thumb)}" alt="thumbnail" loading="lazy">`
    : '';
  const video = a.video
    ? `<video class="vid" controls preload="none" src="${escapeHtml(a.video)}"></video>`
    : '';
  const trace = a.trace
    ? `<code class="cmd">npx playwright show-trace ${escapeHtml(a.trace)}</code>`
    : '';
  if (!thumb && !video && !trace) return '<span class="muted">no artifacts</span>';
  return `${thumb}${video}${trace}`;
}

function field(label, value, opts = {}) {
  if (!value) return '';
  const body = opts.pre
    ? `<pre>${escapeHtml(value)}</pre>`
    : `<div>${escapeHtml(value)}</div>`;
  return `<div class="field"><span class="flabel">${label}</span>${body}</div>`;
}

function renderRows(test) {
  const c = test.case;
  const rowId = `d-${c.seq}`;
  const reportLink = `<a href="../playwright-report/index.html#?testId=${escapeHtml(safeId(test.id))}" target="_blank" rel="noopener">open in report</a>`;
  const detail = [
    field('Preconditions', c.preconditions),
    field('Steps', c.steps, { pre: true }),
    field('Expected Result', c.expected),
    field('Note', c.note),
    field('Error', c.error, { pre: true }),
  ].join('');
  return `
    <tr class="row" data-target="${rowId}">
      <td class="seq">${c.seq}</td>
      <td class="tid">${escapeHtml(c.testId)}</td>
      <td>${badge(c.status)}</td>
      <td>${escapeHtml(c.priority) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(c.testType) || '<span class="muted">—</span>'}</td>
      <td class="name">${escapeHtml(c.title)}</td>
      <td class="rundate">${escapeHtml(c.runDate) || '<span class="muted">—</span>'}</td>
      <td class="dur">${escapeHtml(formatDuration(c.durationMs))}</td>
    </tr>
    <tr class="detail" id="${rowId}" hidden>
      <td colspan="8">
        <div class="detail-grid">${detail || '<span class="muted">No documentation annotations.</span>'}</div>
        <div class="media">${mediaCell(test.assets)}<div class="reportlink">${reportLink}</div></div>
      </td>
    </tr>`;
}

export function renderIndexHtml({ tests, summary, generatedAt }) {
  const groups = new Map();
  for (const t of tests) {
    if (!groups.has(t.file)) groups.set(t.file, []);
    groups.get(t.file).push(t);
  }
  const sections = [...groups.entries()]
    .map(
      ([file, groupTests]) => `
    <section>
      <h2>${groupLabel(file)} <span class="count">(${groupTests.length})</span></h2>
      <table>
        <thead><tr>
          <th>Seq</th><th>Test ID</th><th>Status</th><th>Priority</th>
          <th>Type</th><th>Title</th><th>Run Date</th><th>Duration</th>
        </tr></thead>
        <tbody>${groupTests.map(renderRows).join('')}</tbody>
      </table>
    </section>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E Test-Case Register — ${escapeHtml(generatedAt)}</title>
<style>
  :root { --pass:#16a34a; --fail:#dc2626; --skip:#64748b; --primary:#2563eb; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
  header { padding: 24px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .meta { color: #475569; font-size: 14px; }
  .stats { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; }
  .stat { font-size: 14px; font-weight: 600; padding: 6px 12px; border-radius: 8px; background: #f1f5f9; }
  .stat.pass { color: var(--pass); } .stat.fail { color: var(--fail); } .stat.skip { color: var(--skip); }
  main { padding: 24px; }
  section { margin-bottom: 32px; }
  h2 { font-size: 16px; border-left: 3px solid var(--primary); padding-left: 10px; }
  .count { color: #94a3b8; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 13px; }
  th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
  tr.row { cursor: pointer; }
  tr.row:hover { background: #f8fafc; }
  .seq { color: #94a3b8; width: 40px; }
  .tid { font-family: ui-monospace, monospace; font-size: 12px; white-space: nowrap; }
  .badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; color: #fff; text-transform: uppercase; }
  .badge.pass { background: var(--pass); } .badge.fail { background: var(--fail); } .badge.skip { background: var(--skip); } .badge.other { background: #a16207; }
  .name { font-weight: 500; }
  .dur, .rundate { color: #64748b; white-space: nowrap; }
  tr.detail > td { background: #f8fafc; }
  .detail-grid { display: grid; gap: 12px; margin-bottom: 12px; }
  .field .flabel { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; margin-bottom: 2px; }
  .field pre { margin: 0; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; }
  .media { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .thumb { width: 160px; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
  .vid { width: 240px; height: auto; border-radius: 4px; background: #000; }
  .cmd { display: block; font-size: 11px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; word-break: break-all; }
  .reportlink { font-size: 12px; }
  .muted { color: #cbd5e1; }
  a { color: var(--primary); }
</style>
</head>
<body>
<header>
  <h1>E2E Test-Case Register</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)} — click a row to expand details</div>
  <div class="stats">
    <span class="stat">Total ${summary.total}</span>
    <span class="stat pass">Passed ${summary.passed}</span>
    <span class="stat fail">Failed ${summary.failed}</span>
    <span class="stat skip">Skipped ${summary.skipped}</span>
    <span class="stat">Duration ${escapeHtml(formatDuration(summary.durationMs))}</span>
  </div>
</header>
<main>${sections || '<p>No test results found.</p>'}</main>
<script>
  document.querySelectorAll('tr.row').forEach((row) => {
    row.addEventListener('click', () => {
      const d = document.getElementById(row.dataset.target);
      if (d) d.hidden = !d.hidden;
    });
  });
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS (all lib tests green).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): expandable-row register HTML with documentation detail"
```

---

## Task 9: Wire CSV + validation into the generator

**Files:**
- Modify: `scripts/generate-e2e-index.mjs`

- [ ] **Step 1: Update imports**

Replace the import block (lines 11-16) with:

```js
import {
  parseResults,
  summarize,
  renderIndexHtml,
  safeId,
  toTestCase,
  toCsv,
  validateCaseIds,
} from './lib/e2e-index-format.mjs';
```

- [ ] **Step 2: Attach `.case`, validate, write CSV**

After the asset-copy loop ends (after the closing `}` of `for (const test of tests) { ... }`, currently line 56) and before `const summary = summarize(tests);`, insert:

```js
// Build the 13-field test case per test (global sequence in report order).
tests.forEach((test, i) => {
  test.case = toTestCase(test, i + 1);
});

const caseIdWarnings = validateCaseIds(tests.map((t) => t.case));
for (const w of caseIdWarnings) {
  console.warn(`  ⚠ ${w}`);
}

writeFileSync(join(outDir, 'test-cases.csv'), toCsv(tests.map((t) => t.case)));
```

- [ ] **Step 3: Update the final console summary**

Replace the closing `console.log(...)` (lines 65-68) with:

```js
console.log(
  `Generated e2e-results/index.html + test-cases.csv — ${summary.total} test(s): ` +
    `${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped` +
    (caseIdWarnings.length ? ` (${caseIdWarnings.length} test-id warning(s))` : '') +
    '.'
);
```

- [ ] **Step 4: Smoke-test the generator against the last run (if present)**

Run: `node scripts/generate-e2e-index.mjs`
Expected: either it prints the new summary line and creates `e2e-results/test-cases.csv`, or it exits with the existing "No results at ..." message if no prior run exists. If results exist, verify:

Run: `head -1 e2e-results/test-cases.csv`
Expected: `Seq,Test ID,Status,Title,Preconditions,Steps,Expected Result,Priority,Test Type,Run Date,Duration (ms),Error,Note`

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-e2e-index.mjs
git commit -m "feat(e2e): generator writes test-cases.csv + warns on test-id issues"
```

---

## Task 10: Annotate all 43 spec files

Follow the **Rollout Protocol** above for every file. Each sub-task below is one feature folder: dispatch one subagent per sub-task. After each file, run `npx playwright test <file> --list` to confirm it still parses (no execution needed).

**Worked example** (the pattern every file follows) — `e2e/tests/clusters/cluster-create.spec.ts`, prefix `CLU`. The 5 tests classify as: 3 Create (`03`), 1 Validation (`20`), 1 Navigation (module-specific `40`):

```ts
test('should create a new cluster with all fields', {
  annotation: [
    { type: 'caseId', description: 'TC-CLU-030001' },
    { type: 'priority', description: 'P1' },
    { type: 'testType', description: 'CRUD' },
    { type: 'precondition', description: 'Authenticated as super admin (shared storageState)' },
    { type: 'step', description: 'Open Clusters management and click Add' },
    { type: 'step', description: 'Fill all cluster fields' },
    { type: 'step', description: 'Submit and wait for the save response' },
    { type: 'step', description: 'Search the new code in the list' },
    { type: 'expected', description: 'Save returns 200/201 and the cluster is visible in search' },
  ],
}, async ({ page }) => { /* unchanged */ });

test('should create a cluster with minimum required fields', {
  annotation: [
    { type: 'caseId', description: 'TC-CLU-030002' },
    { type: 'priority', description: 'P1' },
    { type: 'testType', description: 'CRUD' },
    { type: 'precondition', description: 'Authenticated as super admin' },
    { type: 'step', description: 'Open the new-cluster form' },
    { type: 'step', description: 'Fill only code and name' },
    { type: 'step', description: 'Submit and wait for save' },
    { type: 'expected', description: 'Save returns 200/201' },
  ],
}, async ({ page }) => { /* unchanged */ });

test('should create an inactive cluster', {
  annotation: [
    { type: 'caseId', description: 'TC-CLU-030003' },
    { type: 'priority', description: 'P2' },
    { type: 'testType', description: 'CRUD' },
    { type: 'precondition', description: 'Authenticated as super admin' },
    { type: 'step', description: 'Open the new-cluster form' },
    { type: 'step', description: 'Fill fields with is_active = false' },
    { type: 'step', description: 'Submit and wait for save' },
    { type: 'expected', description: 'Save returns 200/201 for an inactive cluster' },
  ],
}, async ({ page }) => { /* unchanged */ });

test('should show validation errors for empty required fields', {
  annotation: [
    { type: 'caseId', description: 'TC-CLU-200001' },
    { type: 'priority', description: 'P2' },
    { type: 'testType', description: 'Validation' },
    { type: 'precondition', description: 'On the new-cluster form' },
    { type: 'step', description: 'Submit the empty form' },
    { type: 'expected', description: 'Stays on /clusters/new (submission blocked)' },
  ],
}, async ({ page }) => { /* unchanged */ });

test('should navigate back to list when clicking back button', {
  annotation: [
    { type: 'caseId', description: 'TC-CLU-400001' },
    { type: 'priority', description: 'P2' },
    { type: 'testType', description: 'Navigation' },
    { type: 'precondition', description: 'On the new-cluster form' },
    { type: 'step', description: 'Click the back button' },
    { type: 'expected', description: 'Returns to /clusters' },
  ],
}, async ({ page }) => { /* unchanged */ });
```

Sequence numbering is **per (prefix, section)**: a prefix's `03` block continues across all of that feature's files (e.g. if `cluster-create` uses `TC-CLU-030001..03`, no other CLU file may reuse those). Subagents within a feature folder must coordinate numbering; dispatch **one subagent per folder** (not per file) so each folder's numbering is assigned by a single agent.

- [ ] **10a — `clusters/` (prefix `CLU`)**: `cluster-create.spec.ts`, `cluster-delete.spec.ts`, `cluster-edit.spec.ts`, `cluster-filter.spec.ts`, `cluster-list.spec.ts`, `cluster-search.spec.ts`. Sections: create→03, edit→04, delete→05, list→01, search→01, filter→01, validation→20, navigation→40.
- [ ] **10b — `business-units/` (prefix `BU`)**: `business-unit-create.spec.ts`, `business-unit-delete.spec.ts`, `business-unit-edit.spec.ts`, `business-unit-filter.spec.ts`, `business-unit-list.spec.ts`, `business-unit-search.spec.ts`.
- [ ] **10c — `users/` (prefix `USR`)**: `user-create.spec.ts`, `user-delete.spec.ts`, `user-edit.spec.ts`, `user-filter.spec.ts`, `user-list.spec.ts`, `user-search.spec.ts`.
- [ ] **10d — `applications/` (prefix `APP`)**: `application-create.spec.ts`, `application-delete.spec.ts`, `application-edit.spec.ts`, `application-list.spec.ts`.
- [ ] **10e — `news/` (prefix `NWS`)**: `news-create.spec.ts`, `news-delete.spec.ts`, `news-edit.spec.ts`, `news-filter.spec.ts`, `news-image-upload.spec.ts` (image upload → module-specific 40).
- [ ] **10f — `roles/` (prefix `ROL`)**: `role-crud.spec.ts` (split sections by purpose: list→01, create→03, edit→04, delete→05), `role-list.spec.ts`. **Invariant:** never modify seeded roles/permissions.
- [ ] **10g — `report-templates/` (prefix `RT`)**: `report-template-crud.spec.ts`, `report-template-list.spec.ts`.
- [ ] **10h — `print-template-mapping/` (prefix `PTM`)**: `print-mapping-crud.spec.ts`, `print-mapping-view.spec.ts` (view→02). **Invariant:** the CRUD spec unchecks `is_default`; note it via a `note` annotation. **Integration:** needs micro-report :5015 → testType `Integration`, section 30 where applicable.
- [ ] **10i — `user-platform/` (prefix `UP`)**: `user-platform-config.spec.ts` (role assign/unassign→04), `user-platform-list.spec.ts` (01). **Invariant:** never touch the login user's privileges.
- [ ] **10j — `super-admins/` (prefix `SA`)**: `super-admin-manage.spec.ts` (add→03, remove→05, security→10). **Invariant:** never touch the login user.
- [ ] **10k — `auth/` (prefix `AUTH`)**: `login.spec.ts` (01 + security 10–19), `logout.spec.ts` (security 10–19). Note: these opt out of shared auth — precondition differs ("starts unauthenticated").
- [ ] **10l — `broadcast/` (prefix `BRD`)**: `broadcast-compose.spec.ts` (validation→20, compose→40). **Invariant:** must never send; add a `note` recording the route guard.
- [ ] **10m — `profile/` (prefix `PRF`)**: `profile.spec.ts` (view→02, update→04). **Invariant:** serialized; never break that.
- [ ] **10n — `dashboard/` (prefix `DSH`)**: `dashboard.spec.ts` (smoke/view→01–02).
- [ ] **10o — `changelog/` (prefix `CHG`)**: `changelog.spec.ts` (list/view→01–02).
- [ ] **10p — `permission-catalog/` (prefix `PC`)**: `permission-catalog.spec.ts` (list/view→01–02).

- [ ] **Commit** after each folder:

```bash
git add e2e/tests/<folder>
git commit -m "test(e2e): annotate <folder> specs with TC-<PREFIX> case metadata"
```

---

## Task 11: Verify the unit suite is green

**Files:** none (verification only)

- [ ] **Step 1: Run the script test suite**

Run: `bun run test:scripts`
Expected: all `node --test` files pass, including every new `e2e-index-format` test. Zero failures.

- [ ] **Step 2: Confirm no stray spec parse errors**

Run: `npx playwright test --list > /dev/null && echo "ALL SPECS PARSE"`
Expected: prints `ALL SPECS PARSE` (every annotated spec still compiles and 182 tests are discoverable).

---

## Task 12: End-to-end artifact verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + generator**

Run: `bun run test:e2e:full`
Expected: Playwright runs all 182 tests against DEV, then the generator prints
`Generated e2e-results/index.html + test-cases.csv — N test(s): ...`.

- [ ] **Step 2: Verify the CSV header + row count**

Run: `head -1 e2e-results/test-cases.csv && echo "rows:" && tail -n +2 e2e-results/test-cases.csv | wc -l`
Expected: header is the exact 13 columns; row count equals the number of executed tests.

- [ ] **Step 3: Spot-check the register for unresolved IDs**

Run: `tail -n +2 e2e-results/test-cases.csv | cut -d, -f2 | grep -cv '^TC-' || echo 0`
Expected: `0` (every Test ID is a `TC-` id; no raw spec-id fallbacks). Any non-zero means a test is missing its `caseId` annotation — fix the offending spec.

- [ ] **Step 4: Open the HTML and confirm expand works**

Run: `open e2e-results/index.html`
Expected: rows show Seq/Test ID/Status/Priority/Type/Title/Run Date/Duration; clicking a row reveals Preconditions, numbered Steps, Expected, Note, Error, and media.

- [ ] **Step 5: Final commit (if any generated-file gitignore tweaks were needed)**

`e2e-results/` is already gitignored, so normally nothing to commit here. If `test-cases.csv` is not covered by the existing ignore, confirm:

Run: `git status --short e2e-results/`
Expected: no output (folder ignored). If `test-cases.csv` shows up, add it to `.gitignore` under the existing `e2e-results/` rule and commit that one-line change.

---

## Self-Review Notes

- **Spec coverage:** ID scheme (Task 1) · annotation vocabulary (Tasks 3, 10) · parser extension (Task 4) · 13-field mapping (Task 5) · CSV (Task 6) · validator (Task 7) · expandable HTML (Task 8) · generator wiring (Task 9) · bulk rollout all 43 files (Task 10) · tests (Tasks 2–8, 11) · e2e verification (Task 12). All spec sections map to a task.
- **Type consistency:** `toTestCase` field names (`seq, testId, status, title, preconditions, steps, expected, priority, testType, runDate, durationMs, error, note`) are used identically in `toCsv` (Task 6), `validateCaseIds` (`tc.testId`, `tc.seq`, `tc.title`, Task 7), and `renderIndexHtml` (`test.case.*`, Task 8). Generator attaches `test.case` (Task 9) which Task 8 consumes.
- **No behavior change:** Task 10 adds annotations only; all DEV-mutation invariants restated per folder.
