// Pure helpers for building the E2E result index. No fs / I/O here.

const FAIL_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);

export const MODULE_PREFIXES = new Set([
  'APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
  'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR',
]);

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
