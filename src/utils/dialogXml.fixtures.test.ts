import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogXml, type DialogField, type DialogParseResult } from './dialogXml';

// jsdom ทำให้ import.meta.url เป็น http:// — ใช้ dirname ของไฟล์แทน
const DIR = join(import.meta.dirname, '../../docs/dialog-xml/fixtures/');

const nameOf = (f: DialogField) => f.element.getAttribute('Name') ?? '';

function summarize(r: DialogParseResult) {
  return {
    cols: r.cols,
    // ทุก cell ที่ preview วาด — ไม่กรองอะไรทิ้ง ไม่อย่างนั้น fixture จะมองไม่เห็นจุดที่สอง parser วาดต่างกัน
    cells: r.cells.map((c) => {
      if (c.kind === 'range') return { kind: 'range', colSpan: c.layout.colSpan, names: [nameOf(c.from), nameOf(c.to)] };
      if (c.kind === 'group') return { kind: 'group', colSpan: c.layout.colSpan, names: c.fields.map(nameOf) };
      return { kind: 'single', colSpan: c.layout.colSpan, names: [nameOf(c)] };
    }),
    warnings: r.warnings.map((w) => w.code),
  };
}

const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => f.replace(/\.xml$/, ''));

describe('dialog XML fixtures', () => {
  it.each(names)('%s', (name) => {
    const xml = readFileSync(`${DIR}${name}.xml`, 'utf8');
    const expected = JSON.parse(readFileSync(`${DIR}${name}.expected.json`, 'utf8'));
    const result = parseDialogXml(xml);
    expect(result.ok).toBe(true);
    expect(summarize(result)).toEqual(expected);
  });
});
