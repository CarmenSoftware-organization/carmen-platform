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

// OWASP CSV Injection (formula injection): a backend-supplied value opened in
// Excel/Google Sheets can execute as a formula if it starts with a trigger
// character. Cells must be neutralised with a leading single quote.
describe('generateCSV - formula injection hardening', () => {
  it('neutralises a value starting with =', () => {
    const csv = generateCSV<Row>([{ name: '=1+1', code: 'x' }], cols);
    expect(csv).toBe("Name,Code\n'=1+1,x");
  });

  it('neutralises a value starting with +', () => {
    const csv = generateCSV<Row>([{ name: '+1+1', code: 'x' }], cols);
    expect(csv).toBe("Name,Code\n'+1+1,x");
  });

  it('neutralises a value starting with @', () => {
    const csv = generateCSV<Row>([{ name: '@SUM(A1)', code: 'x' }], cols);
    expect(csv).toBe("Name,Code\n'@SUM(A1),x");
  });

  it('neutralises a value starting with a tab', () => {
    const csv = generateCSV<Row>([{ name: '\t=1+1', code: 'x' }], cols);
    expect(csv).toBe("Name,Code\n'\t=1+1,x");
  });

  it('neutralises a value starting with a carriage return', () => {
    // The neutralised value still contains a raw \r, so RFC-4180 quoting
    // (which now checks for \r, not just \n) wraps it in quotes.
    const csv = generateCSV<Row>([{ name: '\r=1+1', code: 'x' }], cols);
    expect(csv).toBe('Name,Code\n"\'\r=1+1",x');
  });

  it('does NOT alter a legitimate negative number', () => {
    const csv = generateCSV<Row>([{ name: '-5', code: '-12.5' }], cols);
    expect(csv).toBe('Name,Code\n-5,-12.5');
  });

  it('neutralises a leading - that is not a valid negative number', () => {
    const csv = generateCSV<Row>([{ name: '-=1+1', code: '-cmd' }], cols);
    expect(csv).toBe("Name,Code\n'-=1+1,'-cmd");
  });

  it('still applies RFC-4180 quoting after neutralising a formula prefix', () => {
    const csv = generateCSV<Row>([{ name: '=A1,B1', code: 'x' }], cols);
    expect(csv).toBe('Name,Code\n"\'=A1,B1",x');
  });

  it('leaves a plain value unchanged', () => {
    const csv = generateCSV<Row>([{ name: 'Acme', code: '1' }], cols);
    expect(csv).toBe('Name,Code\nAcme,1');
  });

  it('emits headers unchanged and only neutralises data cells', () => {
    const csv = generateCSV<Row>([{ name: '=1+1', code: '1' }], cols);
    const [headerLine] = csv.split('\n');
    expect(headerLine).toBe('Name,Code');
  });
});
