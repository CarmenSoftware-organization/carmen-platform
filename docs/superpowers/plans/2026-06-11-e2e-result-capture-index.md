# E2E Per-Test Capture + Custom Result Index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture video + screenshot + trace for every Playwright test (pass or fail) and generate a self-contained, shareable HTML index page listing every case with thumbnail, inline video, and trace access.

**Architecture:** Flip Playwright capture settings to always-on and add a JSON reporter. A dependency-free Node ESM script reads that JSON, copies each test's artifacts into a portable `e2e-results/assets/` folder, and renders `e2e-results/index.html`. Pure parse/render logic lives in a testable `scripts/lib/` module (unit-tested with `node:test`); the orchestrator script does only file I/O.

**Tech Stack:** Playwright (`@playwright/test`), Node 20+ ESM (`node:fs`/`node:path`/`node:url`), `node:test` for unit tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-e2e-result-capture-index-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `playwright.config.ts` (modify) | Capture settings → `on`; add `json` reporter |
| `scripts/lib/e2e-index-format.mjs` (new) | **Pure** logic: parse JSON report, summarize, render HTML. No I/O. |
| `scripts/lib/e2e-index-format.test.mjs` (new) | `node:test` unit tests for the pure logic |
| `scripts/generate-e2e-index.mjs` (new) | I/O orchestrator: read JSON, copy artifacts, write `index.html` |
| `package.json` (modify) | Add `test:e2e:index` and `test:e2e:full` scripts |
| `.gitignore` (modify) | Ignore `e2e-results/` |

---

## Task 1: Always-on capture + JSON reporter

**Files:**
- Modify: `playwright.config.ts:12-23`

- [ ] **Step 1: Add the JSON reporter**

In `playwright.config.ts`, change the `reporter` array (currently lines 12-15) to add a JSON reporter:

```ts
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
```

- [ ] **Step 2: Flip capture settings to always-on**

In the same file, change the three capture lines inside `use` (currently lines 20-22):

```ts
    screenshot: 'on',
    trace: 'on',
    video: 'on',
```

Leave everything else in `use` (`baseURL`, `headless`, `ignoreHTTPSErrors`, `storageState`) unchanged.

- [ ] **Step 3: Run one spec to verify artifacts + JSON are produced**

Run: `npx playwright test e2e/tests/clusters/cluster-list.spec.ts --workers=1`
Expected: tests run; afterward `e2e-results/results.json` exists and `test-results/` contains per-test folders with `video.webm`, `trace.zip`, and a screenshot `.png`.

Verify with: `ls e2e-results/results.json && find test-results -name 'video.webm' | head -1 && find test-results -name 'trace.zip' | head -1`
Expected: all three paths print (non-empty).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git commit -m "test(e2e): capture screenshot/video/trace on every test + json reporter"
```

---

## Task 2: Pure parse + summarize logic (TDD)

**Files:**
- Create: `scripts/lib/e2e-index-format.mjs`
- Test: `scripts/lib/e2e-index-format.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/e2e-index-format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResults,
  summarize,
  escapeHtml,
  safeId,
  formatDuration,
} from './e2e-index-format.mjs';

const fixture = {
  suites: [
    {
      title: 'cluster/ClusterManagement.spec.ts',
      file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
      specs: [
        {
          title: 'lists clusters',
          file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
          line: 10,
          tests: [
            {
              id: 'abc123',
              results: [
                {
                  status: 'passed',
                  duration: 1200,
                  attachments: [
                    { name: 'screenshot', path: '/tmp/test-finished-1.png' },
                    { name: 'video', path: '/tmp/video.webm' },
                    { name: 'trace', path: '/tmp/trace.zip' },
                  ],
                },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: 'filters',
          specs: [
            {
              title: 'filters by status',
              file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
              line: 20,
              tests: [
                { id: 'def456', results: [{ status: 'skipped', duration: 0, attachments: [] }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('parseResults flattens specs across nested suites', () => {
  const tests = parseResults(fixture);
  assert.equal(tests.length, 2);
  const [first, second] = tests;
  assert.equal(first.title, 'lists clusters');
  assert.deepEqual(first.titlePath, []);
  assert.equal(first.status, 'passed');
  assert.equal(first.attachments.video, '/tmp/video.webm');
  assert.equal(second.title, 'filters by status');
  assert.deepEqual(second.titlePath, ['filters']);
  assert.equal(second.status, 'skipped');
});

test('summarize counts by status and sums duration', () => {
  const s = summarize(parseResults(fixture));
  assert.equal(s.total, 2);
  assert.equal(s.passed, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.failed, 0);
  assert.equal(s.durationMs, 1200);
});

test('escapeHtml and safeId sanitize input', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.equal(safeId('a/b c'), 'a-b-c');
});

test('formatDuration humanizes ms', () => {
  assert.equal(formatDuration(0), '0ms');
  assert.equal(formatDuration(500), '500ms');
  assert.equal(formatDuration(1500), '1.5s');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — cannot resolve `./e2e-index-format.mjs` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/lib/e2e-index-format.mjs`:

```js
// Pure helpers for building the E2E result index. No fs / I/O here.

const FAIL_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeId(id) {
  return String(id ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function formatDuration(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Recursively collect specs from the Playwright JSON report, tracking the
// describe-title chain. The file-level suite title is the path, so the chain
// starts empty and only accumulates nested describe() titles.
export function parseResults(report) {
  const tests = [];

  const walkSuite = (suite, titleChain) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const result = results[results.length - 1] ?? {};
        const attachments = {};
        for (const att of result.attachments ?? []) {
          if (att.path && !attachments[att.name]) attachments[att.name] = att.path;
        }
        tests.push({
          id: test.id ?? `${spec.file}:${spec.line}`,
          file: spec.file ?? suite.file ?? 'unknown',
          titlePath: titleChain,
          title: spec.title ?? '(untitled)',
          status: result.status ?? 'unknown',
          durationMs: result.duration ?? 0,
          attachments,
        });
      }
    }
    for (const child of suite.suites ?? []) {
      walkSuite(child, [...titleChain, child.title].filter(Boolean));
    }
  };

  for (const fileSuite of report.suites ?? []) {
    walkSuite(fileSuite, []);
  }
  return tests;
}

export function summarize(tests) {
  const summary = { total: tests.length, passed: 0, failed: 0, skipped: 0, other: 0, durationMs: 0 };
  for (const t of tests) {
    summary.durationMs += t.durationMs || 0;
    if (t.status === 'passed') summary.passed += 1;
    else if (t.status === 'skipped') summary.skipped += 1;
    else if (FAIL_STATUSES.has(t.status)) summary.failed += 1;
    else summary.other += 1;
  }
  return summary;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): pure parse/summarize logic for result index"
```

---

## Task 3: HTML rendering (TDD)

**Files:**
- Modify: `scripts/lib/e2e-index-format.mjs` (add `renderIndexHtml` + private helpers)
- Modify: `scripts/lib/e2e-index-format.test.mjs` (add render test)

- [ ] **Step 1: Add the failing render test**

Append to `scripts/lib/e2e-index-format.test.mjs`:

```js
import { renderIndexHtml } from './e2e-index-format.mjs';

test('renderIndexHtml includes summary, groups, escaped names, media, trace', () => {
  const parsed = parseResults(fixture);
  const tests = parsed.map((t) => ({
    ...t,
    assets:
      t.status === 'passed'
        ? {
            thumb: 'assets/abc123/thumb.png',
            video: 'assets/abc123/video.webm',
            trace: 'assets/abc123/trace.zip',
          }
        : {},
  }));
  const html = renderIndexHtml({
    tests,
    summary: summarize(tests),
    generatedAt: '2026-06-11 10:00:00',
  });
  assert.match(html, /Passed 1/);
  assert.match(html, /Skipped 1/);
  assert.match(html, /ClusterManagement\.spec\.ts/);
  assert.match(html, /assets\/abc123\/video\.webm/);
  assert.match(html, /filters › filters by status/);
  assert.match(html, /show-trace assets\/abc123\/trace\.zip/);
  assert.match(html, /testId=abc123/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: FAIL — `renderIndexHtml` is not exported (undefined).

- [ ] **Step 3: Add the implementation**

Append to `scripts/lib/e2e-index-format.mjs`:

```js
function badge(status) {
  const cls =
    status === 'passed' ? 'pass'
    : status === 'skipped' ? 'skip'
    : FAIL_STATUSES.has(status) ? 'fail'
    : 'other';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function groupLabel(file) {
  return escapeHtml(String(file).replace(/^.*e2e\/tests\//, ''));
}

function renderRow(test) {
  const a = test.assets ?? {};
  const thumb = a.thumb
    ? `<img class="thumb" src="${escapeHtml(a.thumb)}" alt="thumbnail" loading="lazy">`
    : '<span class="muted">—</span>';
  const video = a.video
    ? `<video class="vid" controls preload="none" src="${escapeHtml(a.video)}"></video>`
    : '<span class="muted">—</span>';
  const traceCmd = a.trace
    ? `<code class="cmd">npx playwright show-trace ${escapeHtml(a.trace)}</code>`
    : '<span class="muted">—</span>';
  const reportLink = `<a href="../playwright-report/index.html#?testId=${escapeHtml(safeId(test.id))}" target="_blank" rel="noopener">open in report</a>`;
  const name = [...(test.titlePath ?? []), test.title].map(escapeHtml).join(' › ');
  return `
    <tr>
      <td>${badge(test.status)}</td>
      <td class="name">${name}</td>
      <td class="dur">${escapeHtml(formatDuration(test.durationMs))}</td>
      <td>${thumb}</td>
      <td>${video}</td>
      <td class="trace">${traceCmd}<br>${reportLink}</td>
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
        <thead><tr><th>Status</th><th>Test</th><th>Duration</th><th>Thumbnail</th><th>Video</th><th>Trace</th></tr></thead>
        <tbody>${groupTests.map(renderRow).join('')}</tbody>
      </table>
    </section>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E Results — ${escapeHtml(generatedAt)}</title>
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
  .badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; color: #fff; text-transform: uppercase; }
  .badge.pass { background: var(--pass); } .badge.fail { background: var(--fail); } .badge.skip { background: var(--skip); } .badge.other { background: #a16207; }
  .thumb { width: 160px; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
  .vid { width: 240px; height: auto; border-radius: 4px; background: #000; }
  .name { font-weight: 500; }
  .dur { color: #64748b; white-space: nowrap; }
  .cmd { display: block; font-size: 11px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; word-break: break-all; }
  .muted { color: #cbd5e1; }
  a { color: var(--primary); }
</style>
</head>
<body>
<header>
  <h1>E2E Test Results</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)}</div>
  <div class="stats">
    <span class="stat">Total ${summary.total}</span>
    <span class="stat pass">Passed ${summary.passed}</span>
    <span class="stat fail">Failed ${summary.failed}</span>
    <span class="stat skip">Skipped ${summary.skipped}</span>
    <span class="stat">Duration ${escapeHtml(formatDuration(summary.durationMs))}</span>
  </div>
</header>
<main>${sections || '<p>No test results found.</p>'}</main>
</body>
</html>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git commit -m "feat(e2e): render self-contained HTML result index"
```

---

## Task 4: I/O orchestrator script

**Files:**
- Create: `scripts/generate-e2e-index.mjs`

This task is verified by running against the real `e2e-results/results.json` produced in Task 1 (no unit test — it is thin I/O glue over the already-tested pure functions).

- [ ] **Step 1: Write the orchestrator**

Create `scripts/generate-e2e-index.mjs`:

```js
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import {
  parseResults,
  summarize,
  renderIndexHtml,
  safeId,
} from './lib/e2e-index-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'e2e-results');
const resultsPath = join(outDir, 'results.json');
const assetsDir = join(outDir, 'assets');

if (!existsSync(resultsPath)) {
  console.error(
    `No results at ${resultsPath}. Run the e2e suite first (e.g. bun run test:e2e:full).`
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));
const tests = parseResults(report);

// Rebuild assets from scratch so the folder reflects only the latest run.
rmSync(assetsDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

// Playwright attachment name -> friendly basename in the index folder.
const NAMES = { screenshot: 'thumb', video: 'video', trace: 'trace' };

for (const test of tests) {
  const id = safeId(test.id);
  const dir = join(assetsDir, id);
  test.assets = {};
  let made = false;
  for (const [attName, friendly] of Object.entries(NAMES)) {
    const src = test.attachments[attName];
    if (!src || !existsSync(src)) continue;
    if (!made) {
      mkdirSync(dir, { recursive: true });
      made = true;
    }
    const ext = extname(src);
    copyFileSync(src, join(dir, friendly + ext));
    test.assets[friendly] = `assets/${id}/${friendly}${ext}`;
  }
}

const summary = summarize(tests);
const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
writeFileSync(
  join(outDir, 'index.html'),
  renderIndexHtml({ tests, summary, generatedAt })
);

console.log(
  `Generated e2e-results/index.html — ${summary.total} test(s): ` +
    `${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`
);
```

- [ ] **Step 2: Run it against the real results from Task 1**

Run: `node scripts/generate-e2e-index.mjs`
Expected: prints `Generated e2e-results/index.html — N test(s): ...` with N matching the spec you ran in Task 1.

- [ ] **Step 3: Inspect the output**

Run: `ls e2e-results/index.html && ls e2e-results/assets/*/ | head`
Expected: `index.html` exists; at least one asset folder contains `thumb.png`, `video.webm`, `trace.zip`.

Open `e2e-results/index.html` in a browser and confirm: summary counts render, a thumbnail shows, a video plays inline, and the `show-trace` command + "open in report" link appear.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-e2e-index.mjs
git commit -m "feat(e2e): generate-e2e-index orchestrator (copy artifacts + write index)"
```

---

## Task 5: Wire scripts + gitignore

**Files:**
- Modify: `package.json` (scripts block — `test:e2e` lives near the top of `scripts`)
- Modify: `.gitignore:148-149`

- [ ] **Step 1: Add npm scripts**

In `package.json`, in the `"scripts"` object, immediately after the existing `"test:e2e:report"` line, add:

```jsonc
    "test:e2e:index": "node scripts/generate-e2e-index.mjs",
    "test:e2e:full": "npx playwright test; node scripts/generate-e2e-index.mjs",
```

Note: `test:e2e:full` uses `;` (not `&&`) so the index is generated even when some tests fail. Ensure the preceding line ends with a comma and JSON stays valid.

- [ ] **Step 2: Ignore the output folder**

In `.gitignore`, after the existing `playwright-report/` line (line 149), add:

```
e2e-results/
```

- [ ] **Step 3: Verify the scripts resolve and JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"`
Expected: `package.json OK`.

Run: `git status --short e2e-results 2>/dev/null; git check-ignore e2e-results/index.html`
Expected: `git check-ignore` prints `e2e-results/index.html` (confirming it is ignored); `git status` shows nothing under `e2e-results/`.

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore(e2e): add test:e2e:index/full scripts; ignore e2e-results/"
```

---

## Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Clean and run the full pipeline on one spec**

Run:
```bash
rm -rf e2e-results test-results
npx playwright test e2e/tests/clusters/cluster-list.spec.ts --workers=1
node scripts/generate-e2e-index.mjs
```
Expected: tests run, generator prints a summary with the correct passed count, and `e2e-results/index.html` exists.

- [ ] **Step 2: Confirm the `test:e2e:full` one-shot works**

Run: `bun run test:e2e:full -- e2e/tests/clusters/cluster-list.spec.ts` (or `npm run test:e2e:full -- e2e/tests/clusters/cluster-list.spec.ts`)
Expected: suite runs then the generator runs in the same command; `e2e-results/index.html` is regenerated.

- [ ] **Step 3: Confirm the missing-results guard**

Run: `rm -rf e2e-results && node scripts/generate-e2e-index.mjs; echo "exit=$?"`
Expected: prints the "No results at ..." message and `exit=1`.

- [ ] **Step 4: Re-run unit tests once more**

Run: `node --test scripts/lib/e2e-index-format.test.mjs`
Expected: PASS — 5 tests.

- [ ] **Step 5: Final visual confirmation**

Re-run Step 1, open `e2e-results/index.html`, and confirm every row (pass and, if any, skip/fail) shows a status badge, thumbnail, inline video, and trace access. No further commit needed (Task 6 produces no source changes).

---

## Notes / Constraints

- **No new dependencies** — plain Node ESM only, matching `scripts/bump-version.mjs` and `scripts/generate-changelog.mjs`.
- **Cost (accepted):** video + trace on the full 182-test suite materially increases runtime and disk (hundreds of MB to ~1–2 GB). Verification tasks deliberately run a single read-only spec (`cluster-list`) to avoid DEV mutation and keep iteration fast.
- **Trace caveat:** `trace.zip` is not browser-viewable — the index provides a `show-trace` command and a deep-link into the existing Playwright HTML report's trace viewer.
- **Local only:** no CI workflow changes. The `json` reporter and capture changes also apply under CI if it runs Playwright, but nothing publishes the index — that is out of scope by design.
