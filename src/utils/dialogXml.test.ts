import { describe, expect, it } from 'vitest';
import { parseDialogDocument, parseDialogXml } from './dialogXml';

describe('parseDialogXml', () => {
  it('reports empty input as an error code, not a crash', () => {
    expect(parseDialogXml('   ')).toMatchObject({ ok: false, error: 'empty' });
  });

  it('reports malformed XML with the parser detail', () => {
    const r = parseDialogXml('<Dialog><Label></Dialog>');
    expect(r).toMatchObject({ ok: false, error: 'parse' });
    expect(r.errorDetail).toBeTruthy();
  });

  it('requires a <Dialog> root', () => {
    expect(parseDialogXml('<Form/>')).toMatchObject({ ok: false, error: 'noDialogRoot' });
  });

  it('accepts whitespace around integers', () => {
    const r = parseDialogXml('<Dialog Cols=" 2 "><Label Text="S"/><Lookup Name="S" ColSpan=" 2"/></Dialog>');
    expect(r.cols).toBe(2);
    expect(r.cells[0].layout.colSpan).toBe(2);
    expect(r.warnings).toEqual([]);
  });

  it('drops what inventory drops — orphan labels and unlabelled controls — and warns instead', () => {
    const r = parseDialogXml('<Dialog><Label Text="Orphan"/><Label Text="X"/><Date Name="D"/><Date Name="Bare"/></Dialog>');
    expect(r.cells.map((c) => (c.kind === 'field' ? [c.label, c.element.getAttribute('Name')] : c.kind))).toEqual([['X', 'D']]);
    expect(r.warnings).toEqual([
      { code: 'labelWithoutControl', at: 'Orphan' },
      { code: 'controlWithoutLabel', at: 'Bare' },
    ]);
  });

  it('counts both ends of a range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="Date From"/><Date Name="DateFrom"/><Label Text="Date To"/><Date Name="DateTo"/></Dialog>',
    );
    expect(r.cells).toHaveLength(1);
    expect(r.counts).toEqual({ Date: 2 });
  });

  it('names the offending element in a warning', () => {
    const r = parseDialogXml('<Dialog Cols="2"><Label Text="P"/><Lookup Name="ProductFrom" ColSpan="5"/></Dialog>');
    expect(r.warnings).toEqual([{ code: 'colSpanClamped', raw: '5', used: 2, at: 'ProductFrom' }]);
  });

  it('does not pair From/To inside a group', () => {
    const r = parseDialogXml(`<Dialog Cols="2"><Group ColSpan="2">
      <Label Text="Date From"/><Date Name="DateFrom"/>
      <Label Text="Date To"/><Date Name="DateTo"/>
    </Group></Dialog>`);
    expect(r.cells).toHaveLength(1);
    const g = r.cells[0];
    expect(g.kind).toBe('group');
    if (g.kind === 'group') expect(g.fields.map((f) => f.label)).toEqual(['Date From', 'Date To']);
    expect(r.counts).toEqual({ Date: 2 });
  });

  it('an orphan label before a group takes no grid slot', () => {
    const r = parseDialogXml(
      '<Dialog Cols="2"><Label Text="Dangling"/><Group><Label Text="A"/><Date Name="A"/></Group></Dialog>',
    );
    expect(r.cells.map((c) => c.kind)).toEqual(['group']);
    expect(r.warnings.map((w) => w.code)).toEqual(['labelWithoutControl']);
  });

  it('exposes the label node of every field and both ends of a range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="Date From"/><Date Name="DateFrom"/><Label Text="to" Visible="false"/><Date Name="DateTo"/><Label Text="S"/><Lookup Name="S"/></Dialog>',
    );
    const [range, single] = r.cells;
    if (range.kind !== 'range' || single.kind !== 'field') throw new Error('unexpected cells');
    expect(range.from.labelElement?.getAttribute('Text')).toBe('Date From');
    expect(range.to.labelElement?.getAttribute('Visible')).toBe('false');
    expect(single.labelElement?.getAttribute('Text')).toBe('S');
  });

  it('exposes the <Group> element and its fields’ label nodes', () => {
    const r = parseDialogXml('<Dialog><Group ColSpan="1"><Label Text="A"/><Date Name="A"/></Group></Dialog>');
    const g = r.cells[0];
    if (g.kind !== 'group') throw new Error('expected group');
    expect(g.element.tagName).toBe('Group');
    expect(g.fields[0].labelElement?.getAttribute('Text')).toBe('A');
  });

  it('a self-labelled control has no label node and is flagged for the rollout notice', () => {
    const r = parseDialogXml('<Dialog><Date Name="A" Label="As at"/></Dialog>');
    const c = r.cells[0];
    if (c.kind !== 'field') throw new Error('expected field');
    expect(c.label).toBe('As at');
    expect(c.labelElement).toBeNull();
    expect(r.hasLabelAttr).toBe(true);
  });

  it('a Label on <Group> alone does not raise the rollout notice', () => {
    const r = parseDialogXml('<Dialog><Group Label="P"><Label Text="A"/><Date Name="A"/></Group></Dialog>');
    const g = r.cells[0];
    if (g.kind !== 'group') throw new Error('expected group');
    expect(g.label).toBe('P');
    expect(r.hasLabelAttr).toBe(false);
  });

  it('a hidden To label before a self-labelled To control makes no range', () => {
    const r = parseDialogXml(
      '<Dialog><Label Text="P"/><Date Name="PFrom"/><Label Text="to" Visible="false"/><Date Name="PTo" Label="End"/></Dialog>',
    );
    expect(r.cells.map((c) => (c.kind === 'field' ? c.label : c.kind))).toEqual(['P', 'End']);
  });

  it('parseDialogDocument returns cells that point into the given document', () => {
    const doc = new DOMParser().parseFromString('<Dialog><Label Text="A"/><Date Name="A"/></Dialog>', 'application/xml');
    const r = parseDialogDocument(doc);
    const c = r.cells[0];
    if (c.kind !== 'field') throw new Error('expected field');
    expect(c.element.ownerDocument).toBe(doc);
    expect(r.ok).toBe(true);
  });
});
