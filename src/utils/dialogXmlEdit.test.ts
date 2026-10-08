import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogXml, type DialogCell } from './dialogXml';
import {
  containerMap,
  dropTarget,
  groupCells,
  moveCell,
  setColSpan,
  setCols,
  ungroup,
} from './dialogXmlEdit';

// jsdom ทำให้ import.meta.url เป็น http:// — ใช้ dirname ของไฟล์แทน
const FX = join(import.meta.dirname, '../../docs/dialog-xml/fixtures/');
const read = (name: string) => readFileSync(`${FX}${name}.xml`, 'utf8');
const cellsOf = (xml: string) => parseDialogXml(xml).cells;
const keysOf = (xml: string) => cellsOf(xml).map((c) => c.key);
const nameOf = (c: DialogCell): string => {
  if (c.kind === 'range') return `range:${c.from.element.getAttribute('Name')},${c.to.element.getAttribute('Name')}`;
  if (c.kind === 'group') return `group:${c.fields.map((f) => f.element.getAttribute('Name')).join(',')}`;
  return c.element.getAttribute('Name') ?? '';
};
const shape = (xml: string) => cellsOf(xml).map(nameOf);

const SIMPLE = `<Dialog Cols="2">
  <Label Text="Date From"/><Date Name="DateFrom"/>
  <Label Text="Date To"/><Date Name="DateTo"/>
  <Label Text="Status"/><Lookup Name="Status" Items="A" Values="A"/>
</Dialog>`;

describe('setCols', () => {
  it('adds Cols and removes it again at 1, leaving everything else byte-identical', () => {
    const x = read('real-Inventory_Balance_Report');
    const two = setCols(x, 2);
    expect(two).toBe(x.replace('<Dialog>', '<Dialog Cols="2">'));
    expect(setCols(two, 1)).toBe(x);
  });

  it('clamps to 1..4', () => {
    expect(setCols(SIMPLE, 9)).toContain('<Dialog Cols="4">');
    expect(setCols(SIMPLE, 0)).not.toContain('Cols=');
  });
});

describe('setColSpan', () => {
  it('writes ColSpan on a range’s From control and removes it at 1', () => {
    const [rangeKey] = keysOf(SIMPLE);
    const out = setColSpan(SIMPLE, rangeKey, 2);
    expect(out).toContain('<Date Name="DateFrom" ColSpan="2"/>');
    expect(setColSpan(out, rangeKey, 1)).toBe(SIMPLE);
  });

  it('clamps to the dialog’s Cols', () => {
    const [, statusKey] = keysOf(SIMPLE);
    expect(setColSpan(SIMPLE, statusKey, 7)).toContain('<Lookup Name="Status" Items="A" Values="A" ColSpan="2"/>');
  });
});

describe('moveCell', () => {
  const reals = readdirSync(FX)
    .filter((f) => f.startsWith('real-') && f.endsWith('.xml'))
    .map((f) => f.replace(/\.xml$/, ''));

  it.each(reals)('%s: moving the first cell to the end and back restores the original bytes', (name) => {
    const x = read(name);
    const keys = keysOf(x);
    if (keys.length < 2) return;
    const moved = moveCell(x, keys[0], { end: 'dialog' });
    expect(shape(moved)).toEqual([...shape(x).slice(1), shape(x)[0]]);
    const mk = keysOf(moved);
    expect(moveCell(moved, mk[mk.length - 1], { before: mk[0] })).toBe(x);
  });

  it('move before itself is a no-op', () => {
    const [k] = keysOf(SIMPLE);
    expect(moveCell(SIMPLE, k, { before: k })).toBe(SIMPLE);
  });

  it('comments and unknown elements stay in place', () => {
    const x = `<Dialog>
  <!-- c -->
  <Label Text="A"/><Date Name="A"/>
  <Spacer/>
  <Label Text="B"/><Date Name="B"/>
</Dialog>`;
    const [a, b] = keysOf(x);
    expect(moveCell(x, b, { before: a })).toBe(`<Dialog>
  <!-- c -->
  <Label Text="B"/><Date Name="B"/>
  <Label Text="A"/><Date Name="A"/>
  <Spacer/>
</Dialog>`);
  });

  it('a group cannot move into a group', () => {
    const x = `<Dialog Cols="2">
  <Group>
    <Label Text="A"/><Date Name="A"/>
  </Group>
  <Group>
    <Label Text="B"/><Date Name="B"/>
  </Group>
</Dialog>`;
    const [g1, g2] = keysOf(x);
    expect(moveCell(x, g1, { end: g2 })).toBe(x);
  });

  it('removes a group once its last field moves out', () => {
    let x = read('group-basic');
    for (let i = 0; i < 2; i++) {
      const g = cellsOf(x)[0];
      if (g.kind !== 'group') throw new Error('expected group first');
      x = moveCell(x, g.fields[0].key, { end: 'dialog' });
    }
    expect(x).not.toContain('<Group');
    expect(shape(x)).toEqual(['GroupBy', 'range:DateFrom,DateTo']);
  });

  it('a range moved into a group splits into two fields', () => {
    const x = `<Dialog Cols="2">
  <Group>
    <Label Text="S"/><Lookup Name="S" Items="A" Values="A"/>
  </Group>
  <Label Text="Date From"/><Date Name="DateFrom"/>
  <Label Text="Date To"/><Date Name="DateTo"/>
</Dialog>`;
    const [g, range] = keysOf(x);
    expect(shape(moveCell(x, range, { end: g }))).toEqual(['group:S,DateFrom,DateTo']);
  });

  it('returns the input for an unknown key or broken XML', () => {
    expect(moveCell(SIMPLE, 'nope', { end: 'dialog' })).toBe(SIMPLE);
    expect(moveCell('<Dialog><Label', 'x', { end: 'dialog' })).toBe('<Dialog><Label');
  });
});

describe('groupCells / ungroup', () => {
  it('groups in document order, then ungroups back to the original bytes', () => {
    const [range, status] = keysOf(SIMPLE);
    const grouped = groupCells(SIMPLE, [status, range]);
    expect(grouped).toBe(`<Dialog Cols="2">
  <Group>
    <Label Text="Date From"/><Date Name="DateFrom"/>
    <Label Text="Date To"/><Date Name="DateTo"/>
    <Label Text="Status"/><Lookup Name="Status" Items="A" Values="A"/>
  </Group>
</Dialog>`);
    const [g] = keysOf(grouped);
    expect(ungroup(grouped, g)).toBe(SIMPLE);
  });

  it('refuses fewer than two cells, groups, and ranges with a hidden To label', () => {
    const [range] = keysOf(SIMPLE);
    expect(groupCells(SIMPLE, [range])).toBe(SIMPLE);
    const legacy = `<Dialog>
  <Label Text="Vendor"/><Lookup Name="VendorFrom"/>
  <Label Text="to" Visible="false"/><Lookup Name="VendorTo"/>
  <Label Text="S"/><Lookup Name="S"/>
</Dialog>`;
    expect(groupCells(legacy, keysOf(legacy))).toBe(legacy);
  });
});

describe('text outside the root', () => {
  it('keeps a declaration, a missing trailing newline, and CRLF line endings', () => {
    const x = '<?xml version="1.0"?>\r\n<Dialog>\r\n  <Label Text="A"/><Date Name="A"/>\r\n  <Label Text="B"/><Date Name="B"/>\r\n</Dialog>';
    const [a, b] = keysOf(x);
    expect(moveCell(x, b, { before: a })).toBe(
      '<?xml version="1.0"?>\r\n<Dialog>\r\n  <Label Text="B"/><Date Name="B"/>\r\n  <Label Text="A"/><Date Name="A"/>\r\n</Dialog>',
    );
  });
});

describe('dropTarget', () => {
  const map = { dialog: ['a', 'b', 'c', 'g'], groups: { g: ['g1', 'g2'] } };
  it('dragging down within a container lands after the item it is over', () => {
    expect(dropTarget(map, 'a', 'b')).toEqual({ before: 'c' });
    expect(dropTarget(map, 'a', 'g')).toEqual({ end: 'dialog' });
  });
  it('dragging up, or across containers, lands before the item it is over', () => {
    expect(dropTarget(map, 'c', 'a')).toEqual({ before: 'a' });
    expect(dropTarget(map, 'a', 'g2')).toEqual({ before: 'g2' });
  });
  it('end zones and self-drops', () => {
    expect(dropTarget(map, 'a', 'end:g')).toEqual({ end: 'g' });
    expect(dropTarget(map, 'a', 'a')).toBeNull();
  });
  it('containerMap lists group fields under their group', () => {
    const x = read('group-basic');
    const m = containerMap(cellsOf(x));
    expect(m.dialog).toHaveLength(2);
    expect(Object.values(m.groups)[0]).toHaveLength(2);
  });
});
