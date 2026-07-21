// A leading -, when it's a genuine negative number, must be left alone.
const isValidNegativeNumber = (value: string): boolean => /^-\d+(\.\d+)?$/.test(value);

// OWASP CSV injection: spreadsheet apps (Excel, Google Sheets) parse a cell as
// a formula if it starts with =, +, @, or a tab/carriage return, so a
// backend-supplied value like `=cmd|'/c calc'!A1` can execute on open.
// Prefixing a single quote forces the cell to be read as literal text.
const neutraliseFormulaPrefix = (value: string): string => {
  if (value.startsWith('-') && isValidNegativeNumber(value)) {
    return value;
  }
  return /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const generateCSV = <T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[]
): string => {
  const headers = columns.map(col => col.label).join(',');
  const rows = data.map(item =>
    columns.map(col => {
      const value = item[col.key];
      const stringValue = neutraliseFormulaPrefix(String(value ?? ''));
      return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')
        ? `"${stringValue.replace(/"/g, '""')}"`
        : stringValue;
    }).join(',')
  );
  return [headers, ...rows].join('\n');
};

export const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};
