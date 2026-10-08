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
  setControlAttrs,
  setGroupLabel,
  setLabelText,
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

describe('review minors', () => {
  it('dropping the last cell on its own end zone leaves hand-formatted XML untouched', () => {
    const x = '<Dialog>\n  <Label Text="A"/><Date Name="A"/>\n  <Label Text="B"/>\n  <Date Name="B"/>\n</Dialog>';
    const keys = keysOf(x);
    expect(moveCell(x, keys[keys.length - 1], { end: 'dialog' })).toBe(x);
  });

  it('a comment before the root that mentions <Dialog does not break the output', () => {
    const x = '<!-- old <Dialog Cols="9"> -->\n<Dialog>\n  <Label Text="A"/><Date Name="A"/>\n</Dialog>';
    const out = setCols(x, 2);
    expect(out).toBe('<!-- old <Dialog Cols="9"> -->\n<Dialog Cols="2">\n  <Label Text="A"/><Date Name="A"/>\n</Dialog>');
  });

  it('keeps a comment after a self-closing root', () => {
    expect(setCols('<Dialog/>\n<!-- trailing -->', 2)).toBe('<Dialog Cols="2"/>\n<!-- trailing -->');
  });

  it('a group left with no control is unwrapped, not left behind or deleted with its leftovers', () => {
    const x = `<Dialog>
  <Group>
    <!-- keep me -->
    <Label Text="A"/><Date Name="A"/>
  </Group>
</Dialog>`;
    const g = cellsOf(x)[0];
    if (g.kind !== 'group') throw new Error('expected group');
    expect(moveCell(x, g.fields[0].key, { end: 'dialog' })).toBe(`<Dialog>
  <!-- keep me -->
  <Label Text="A"/><Date Name="A"/>
</Dialog>`);
  });

  it('creates <Group> in the root namespace', () => {
    const x = '<Dialog xmlns="urn:x">\n  <Label Text="A"/><Date Name="A"/>\n  <Label Text="B"/><Date Name="B"/>\n</Dialog>';
    const out = groupCells(x, keysOf(x));
    expect(out).toContain('<Group>');
    expect(out).not.toContain('xmlns=""');
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
  it('a field dropped on its own group, or a group on its own contents, is a no-op', () => {
    expect(dropTarget(map, 'g1', 'g')).toBeNull();
    expect(dropTarget(map, 'g', 'g2')).toBeNull();
    expect(dropTarget(map, 'g', 'end:g')).toBeNull();
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

describe('Label attribute', () => {
  it('moves a self-labelled field as its control alone, and back to the original bytes', () => {
    const xml = read('label-attr-basic');
    const moved = moveCell(xml, keysOf(xml)[0], { end: 'dialog' });
    expect(shape(moved)).toEqual(['Location', 'Status', 'AsAt']);
    const keys = keysOf(moved);
    expect(moveCell(moved, keys[2], { before: keys[0] })).toBe(xml);
  });

  it('groups and ungroups self-labelled fields back to the original bytes', () => {
    const xml = read('label-attr-basic');
    const keys = keysOf(xml);
    const grouped = groupCells(xml, [keys[0], keys[1]]);
    expect(shape(grouped)).toEqual(['group:AsAt,Location', 'Status']);
    expect(ungroup(grouped, keysOf(grouped)[0])).toBe(xml);
  });

  it('does not join an orphan <Label> onto the self-labelled control after it', () => {
    const xml = '<Dialog>\n  <Label Text="B"/><Date Name="B"/>\n  <Label Text="Orphan"/>\n  <Date Name="A" Label="A"/>\n</Dialog>';
    const moved = moveCell(xml, keysOf(xml)[0], { end: 'dialog' });
    expect(moved).toBe('<Dialog>\n  <Label Text="Orphan"/>\n  <Date Name="A" Label="A"/>\n  <Label Text="B"/><Date Name="B"/>\n</Dialog>');
  });
});

describe('property ops', () => {
  const XML = `<Dialog Cols="2">
  <Label Text="Date"/><Date Name="DateFrom"/>
  <Label Text="to" Visible="false"/><Date Name="DateTo"/>
  <Lookup Name="Status" Label="Status" Items="ALL~Open" Values="ALL~O" Tooltip="t"/>
  <Group Label="P">
    <Label Text="Vendor"/><Lookup Name="Vendor" DataSource="@vendor_list"/>
  </Group>
</Dialog>
`;
  const [range, status, group] = cellsOf(XML);
  const vendorKey = group.kind === 'group' ? group.fields[0].key : '';

  it('setControlAttrs changes only the listed attributes and leaves the rest byte-identical', () => {
    const out = setControlAttrs(XML, status.key, undefined, { Multi: 'true', Tooltip: null });
    expect(out).toBe(XML.replace(' Tooltip="t"/>', ' Multi="true"/>'));
  });

  it('setControlAttrs addresses each side of a range and fields inside a group', () => {
    const to = setControlAttrs(XML, range.key, 'to', { Value: '@today' });
    expect(to).toContain('<Date Name="DateTo" Value="@today"/>');
    expect(setControlAttrs(XML, range.key, undefined, { Value: 'x' })).toBe(XML);
    const v = setControlAttrs(XML, vendorKey, undefined, { DataSource: null, Items: 'A', Values: 'a' });
    expect(v).toContain('<Lookup Name="Vendor" Items="A" Values="a"/>');
  });

  it('setControlAttrs: empty string removes; bad key or broken XML returns the input', () => {
    expect(setControlAttrs(XML, status.key, undefined, { Items: '', Values: '' })).not.toContain('Items=');
    expect(setControlAttrs(XML, 'nope', undefined, { Multi: 'true' })).toBe(XML);
    expect(setControlAttrs('<Dialog>', status.key, undefined, { Multi: 'true' })).toBe('<Dialog>');
  });

  it('setLabelText edits a classic <Label Text>, a self label in place, and never the To side', () => {
    expect(setLabelText(XML, range.key, 'from', 'Period')).toContain('<Label Text="Period"/><Date Name="DateFrom"/>');
    expect(setLabelText(XML, range.key, 'to', 'x')).toBe(XML);
    expect(setLabelText(XML, status.key, undefined, 'State')).toContain('<Lookup Name="Status" Label="State"');
  });

  it('clearing a self label keeps Label="" rather than turning the control into a bare one', () => {
    expect(setLabelText(XML, status.key, undefined, '')).toContain('<Lookup Name="Status" Label=""');
  });

  it('setGroupLabel sets, and removes when blank', () => {
    expect(setGroupLabel(XML, group.key, ' Supplier ')).toContain('<Group Label="Supplier">');
    expect(setGroupLabel(XML, group.key, '  ')).toContain('<Group>');
    expect(setGroupLabel(XML, status.key, 'x')).toBe(XML);
  });

  it('quotes, ampersands, angle brackets and Thai survive a round trip', () => {
    const text = 'ผู้ขาย "A" & <B>';
    const out = setLabelText(XML, status.key, undefined, text);
    const c = cellsOf(out)[1];
    expect(c.kind === 'field' && c.label).toBe(text);
  });
});
