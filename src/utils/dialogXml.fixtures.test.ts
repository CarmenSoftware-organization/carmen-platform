import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogXml, type DialogField, type DialogParseResult } from './dialogXml';

// jsdom ทำให้ import.meta.url เป็น http:// — ใช้ dirname ของไฟล์แทน
const DIR = join(import.meta.dirname, '../../docs/dialog-xml/fixtures/');

const nameOf = (f: DialogField) => f.element.getAttribute('Name') ?? '';

interface Cell {
  kind: string;
  colSpan: number;
  names: string[];
  labels?: string[];
  heading?: string;
}

function summarize(r: DialogParseResult) {
  return {
    cols: r.cols,
    // ทุก cell ที่ preview วาด — ไม่กรองอะไรทิ้ง ไม่อย่างนั้น fixture จะมองไม่เห็นจุดที่สอง parser วาดต่างกัน
    cells: r.cells.map((c): Cell => {
      if (c.kind === 'range')
        return { kind: 'range', colSpan: c.layout.colSpan, names: [nameOf(c.from), nameOf(c.to)], labels: [c.label] };
      if (c.kind === 'group')
        return { kind: 'group', colSpan: c.layout.colSpan, names: c.fields.map(nameOf), labels: c.fields.map((f) => f.label), heading: c.label };
      return { kind: 'single', colSpan: c.layout.colSpan, names: [nameOf(c)], labels: [c.label] };
    }),
    warnings: r.warnings.map((w) => w.code),
  };
}

// labels / heading เทียบเฉพาะ fixture ที่ระบุไว้ — fixture ชุดเดิมไม่มีสองคีย์นี้
const fit = (actual: Cell[], expected: Cell[]): Cell[] =>
  actual.map((c, i) => {
    const e = expected[i] ?? {};
    const out: Cell = { kind: c.kind, colSpan: c.colSpan, names: c.names };
    if ('labels' in e) out.labels = c.labels;
    if ('heading' in e) out.heading = c.heading;
    return out;
  });

const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => f.replace(/\.xml$/, ''));

describe('dialog XML fixtures', () => {
  it.each(names)('%s', (name) => {
    const xml = readFileSync(`${DIR}${name}.xml`, 'utf8');
    const expected = JSON.parse(readFileSync(`${DIR}${name}.expected.json`, 'utf8'));
    const result = parseDialogXml(xml);
    expect(result.ok).toBe(true);
    const s = summarize(result);
    expect({ ...s, cells: fit(s.cells, expected.cells) }).toEqual(expected);
  });
});
