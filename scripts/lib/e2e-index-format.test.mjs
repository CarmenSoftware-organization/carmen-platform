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

import { renderIndexHtml } from './e2e-index-format.mjs';
import { MODULE_PREFIXES } from './e2e-index-format.mjs';
import { stripAnsi, formatRunDate } from './e2e-index-format.mjs';
import { extractAnnotations } from './e2e-index-format.mjs';

test('MODULE_PREFIXES holds the 16 catalogued, unique prefixes', () => {
  assert.equal(MODULE_PREFIXES.size, 16);
  for (const p of ['APP', 'AUTH', 'BRD', 'BU', 'CHG', 'CLU', 'DSH', 'NWS',
    'PC', 'PTM', 'PRF', 'RT', 'ROL', 'SA', 'UP', 'USR']) {
    assert.ok(MODULE_PREFIXES.has(p), `missing prefix ${p}`);
  }
});

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

test('stripAnsi removes color escape codes', () => {
  assert.equal(stripAnsi('[31mError:[39m boom'), 'Error: boom');
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
