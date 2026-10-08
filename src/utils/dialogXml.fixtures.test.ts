import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROL_TAGS, parseDialogXml, type DialogField, type DialogParseResult } from './dialogXml';

// jsdom ทำให้ import.meta.url เป็น http:// — ใช้ dirname ของไฟล์แทน
const DIR = join(import.meta.dirname, '../../docs/dialog-xml/fixtures/');
// Group arrives in Task 8 — delete this line then
const PENDING = /^group-/;

const isControl = (f: DialogField) => !!f.element && CONTROL_TAGS.has(f.element.tagName);
const nameOf = (f: DialogField) => f.element?.getAttribute('Name') ?? '';

function summarize(r: DialogParseResult) {
  return {
    cols: r.cols,
    cells: r.cells.flatMap((c) => {
      if (c.kind === 'range') return [{ kind: 'range', colSpan: c.layout.colSpan, names: [nameOf(c.from), nameOf(c.to)] }];
      if (c.kind === 'group') {
        return [{ kind: 'group', colSpan: c.layout.colSpan, names: c.fields.filter(isControl).map(nameOf) }];
      }
      return isControl(c) ? [{ kind: 'single', colSpan: c.layout.colSpan, names: [nameOf(c)] }] : [];
    }),
    warnings: r.warnings.map((w) => w.code),
  };
}

const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => f.replace(/\.xml$/, ''))
  .filter((n) => !PENDING.test(n));

describe('dialog XML fixtures', () => {
  it.each(names)('%s', (name) => {
    const xml = readFileSync(`${DIR}${name}.xml`, 'utf8');
    const expected = JSON.parse(readFileSync(`${DIR}${name}.expected.json`, 'utf8'));
    const result = parseDialogXml(xml);
    expect(result.ok).toBe(true);
    expect(summarize(result)).toEqual(expected);
  });
});
