import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResults,
  summarize,
  escapeHtml,
  safeId,
  formatDuration,
  renderIndexHtml,
  MODULE_PREFIXES,
  stripAnsi,
  formatRunDate,
  extractAnnotations,
  toTestCase,
  CSV_COLUMNS,
  toCsv,
  validateCaseIds,
} from './e2e-index-format.mjs';

const fixture = {
  suites: [
    {
      title: 'cluster/ClusterManagement.spec.ts',
      file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
      specs: [
        {
          id: 'abc123',
          title: 'lists clusters',
          file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
          line: 10,
          tests: [
            {
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
              id: 'def456',
              title: 'filters by status',
              file: 'e2e/tests/cluster/ClusterManagement.spec.ts',
              line: 20,
              tests: [
                { results: [{ status: 'skipped', duration: 0, attachments: [] }] },
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

test('MODULE_PREFIXES holds the 16 catalogued, unique prefixes', () => {
  assert.equal(MODULE_PREFIXES.size, 16);
  for (const p of ['APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
    'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR']) {
    assert.ok(MODULE_PREFIXES.has(p), `missing prefix ${p}`);
  }
});

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

test('stripAnsi removes color escape codes', () => {
  assert.equal(stripAnsi('\x1b[31mError:\x1b[39m boom'), 'Error: boom');
  assert.equal(stripAnsi(undefined), '');
});

test('formatRunDate yields YYYY-MM-DD HH:MM:SS from ISO, blank when missing', () => {
  assert.equal(formatRunDate('2026-06-11T03:15:42.123Z'), '2026-06-11 03:15:42');
  assert.equal(formatRunDate(''), '');
  assert.equal(formatRunDate(undefined), '');
  assert.equal(formatRunDate('not-a-date'), '');
});

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
    errors: [{ message: '\x1b[31mboom\x1b[39m' }],
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
