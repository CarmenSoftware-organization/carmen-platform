import { describe, expect, it } from 'vitest';
import { dataSourceUnknown, rangeWillSplit, validateDataSource, validateName, validateRows } from './dialogXmlValidate';

const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const byName = (d: Document, n: string) => Array.from(d.getElementsByTagName('*')).find((e) => e.getAttribute('Name') === n) as Element;

describe('validateName', () => {
  const d = doc('<Dialog><Label Text="A"/><Date Name="A"/><Date Name="Bare"/><Group><Label Text="G"/><Lookup Name="G"/></Group></Dialog>');
  const a = byName(d, 'A');

  it('requires a value and a code-like pattern', () => {
    expect(validateName('  ', a)).toBe('nameRequired');
    expect(validateName('1st', a)).toBe('namePattern');
    expect(validateName('has space', a)).toBe('namePattern');
    expect(validateName('Date_From2', a)).toBeNull();
  });

  it('is unique across the whole document, including groups and controls the parser drops', () => {
    expect(validateName('G', a)).toBe('nameDuplicate');
    expect(validateName('Bare', a)).toBe('nameDuplicate');
    expect(validateName('A', a)).toBeNull();
  });
});

describe('validateRows', () => {
  it('rejects empty cells and the ~ separator', () => {
    expect(validateRows([{ item: 'All', value: 'ALL' }])).toBeNull();
    expect(validateRows([{ item: 'All', value: ' ' }])).toBe('itemsEmptyRow');
    expect(validateRows([{ item: 'A~B', value: 'x' }])).toBe('itemsTilde');
  });

  it('rejects a list with no rows at all', () => {
    expect(validateRows([])).toBe('itemsNone');
  });
});

describe('rangeWillSplit', () => {
  const d = doc('<Dialog><Label Text="to"/><Label Text="Date To"/><Label Text="x" Visible="false"/></Dialog>');
  const [toText, other, hidden] = Array.from(d.documentElement.children);

  it('a range held together by a "to" or hidden label never splits on rename', () => {
    expect(rangeWillSplit('Start', 'End', toText)).toBe(false);
    expect(rangeWillSplit('Start', 'End', hidden)).toBe(false);
  });

  it('a range held together by names splits once the names stop matching', () => {
    expect(rangeWillSplit('DateFrom', 'DateTo', other)).toBe(false);
    expect(rangeWillSplit('DateStart', 'DateTo', other)).toBe(true);
  });
});

describe('validateDataSource', () => {
  it('requires a non-blank source', () => {
    expect(validateDataSource('')).toBe('dataSourceRequired');
    expect(validateDataSource('   ')).toBe('dataSourceRequired');
    expect(validateDataSource('@vendor_list')).toBeNull();
  });
});

describe('dataSourceUnknown', () => {
  it('knows inventory’s list case-insensitively; empty is not unknown', () => {
    expect(dataSourceUnknown('@vendor_list')).toBe(false);
    expect(dataSourceUnknown('@VENDOR_LIST')).toBe(false);
    expect(dataSourceUnknown('@location_consigment_list')).toBe(false);
    expect(dataSourceUnknown('@supplier_list')).toBe(true);
    expect(dataSourceUnknown('')).toBe(false);
  });
});
