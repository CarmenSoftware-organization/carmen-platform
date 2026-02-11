// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const generateCSV = <T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[]
): string => {
  const headers = columns.map(col => col.label).join(',');
  const rows = data.map(item =>
    columns.map(col => {
      const value = item[col.key];
      const stringValue = String(value ?? '');
      return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
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
