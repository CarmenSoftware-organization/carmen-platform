import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, validateChangelog } from './changelog-format.mjs';

const sample = {
  unreleased: { Added: ['New thing'] },
  versions: [
    { version: '0.1.0', date: '2026-06-01', changes: { Added: ['First'], Fixed: ['A bug'] } },
  ],
};

test('renderMarkdown includes header banner', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /^# Changelog/);
  assert.match(md, /do not edit by hand/);
});

test('renderMarkdown renders Unreleased section when buffer non-empty', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /## \[Unreleased\]\n\n### Added\n- New thing/);
});

test('renderMarkdown omits Unreleased when buffer empty', () => {
  const md = renderMarkdown({ ...sample, unreleased: {} });
  assert.ok(!md.includes('[Unreleased]'));
});

test('renderMarkdown renders versions with date and category order', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /## \[0\.1\.0\] - 2026-06-01/);
  // Added must appear before Fixed (fixed category order)
  assert.ok(md.indexOf('### Added') < md.indexOf('### Fixed'));
});

test('renderMarkdown skips empty categories', () => {
  const md = renderMarkdown({ unreleased: {}, versions: [
    { version: '1.0.0', date: '2026-01-01', changes: { Added: [], Fixed: ['x'] } },
  ]});
  assert.ok(!md.includes('### Added'));
  assert.match(md, /### Fixed\n- x/);
});

test('validateChangelog flags missing version and date', () => {
  const errors = validateChangelog({ unreleased: {}, versions: [{ changes: {} }] });
  assert.equal(errors.length, 2);
});

test('validateChangelog passes for valid input', () => {
  assert.deepEqual(validateChangelog(sample), []);
});
