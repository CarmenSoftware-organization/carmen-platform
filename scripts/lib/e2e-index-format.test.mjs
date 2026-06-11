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
