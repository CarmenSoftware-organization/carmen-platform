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
