// Pure helpers for building the E2E result index. No fs / I/O here.

const FAIL_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);

export const MODULE_PREFIXES = new Set([
  'APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
  'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR',
]);

export function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

// startTime is an ISO string (UTC). Slice instead of new Date() so output is
// timezone-stable and deterministic in tests.
export function formatRunDate(startTime) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(String(startTime ?? ''));
  return m ? `${m[1]} ${m[2]}` : '';
}

const CASE_ID_RE = /^TC-([A-Z]{2,5})-\d{6}$/;

export function validateCaseIds(testCases, prefixes = MODULE_PREFIXES) {
  const errors = [];
  const seen = new Map();
  for (const tc of testCases ?? []) {
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
