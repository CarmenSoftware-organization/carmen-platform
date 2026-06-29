import { describe, it, expect } from 'vitest';
import { generateCSV } from './csvExport';

interface Row {
  name: string;
  code: string;
  note?: string | null;
}

const cols = [
  { key: 'name' as const, label: 'Name' },
  { key: 'code' as const, label: 'Code' },
];

describe('generateCSV', () => {
  it('builds a header row from the column labels', () => {
    expect(generateCSV<Row>([], cols)).toBe('Name,Code');
  });

  it('emits one line per row, preserving order', () => {
    const csv = generateCSV<Row>(
      [
        { name: 'A', code: '1' },
        { name: 'B', code: '2' },
      ],
      cols,
    );
    expect(csv).toBe('Name,Code\nA,1\nB,2');
  });

  it('quotes commas/quotes/newlines and doubles inner quotes', () => {
    const csv = generateCSV<Row>(
      [
        { name: 'a,b', code: 'he said "hi"' },
        { name: 'line1\nline2', code: 'x' },
      ],
      cols,
    );
    expect(csv).toBe('Name,Code\n"a,b","he said ""hi"""\n"line1\nline2",x');
  });

  it('renders null/undefined as an empty string', () => {
    const csv = generateCSV<Row>([{ name: 'A', code: '1', note: null }], [
      { key: 'note', label: 'Note' },
    ]);
    expect(csv).toBe('Note\n');
  });
});
