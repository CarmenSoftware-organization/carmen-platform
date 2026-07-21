import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

type Row = { name: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }) => row.original.name },
];
const data: Row[] = [{ name: 'Alpha' }];

describe('DataTable — tableLayout prop', () => {
  it('uses table-fixed by default (existing pages unchanged)', () => {
    const { container } = render(<DataTable columns={columns} data={data} />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.className).toContain('table-fixed');
    expect(table?.className).not.toContain('table-auto');
  });

  it('uses table-auto when tableLayout="auto" (fit-content opt-in)', () => {
    const { container } = render(<DataTable columns={columns} data={data} tableLayout="auto" />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.className).toContain('table-auto');
    expect(table?.className).not.toContain('table-fixed');
  });
});

describe('DataTable — stickyLeftColumns prop', () => {
  it('freezes two left columns by default (no table-sticky-left-3)', () => {
    const { container } = render(<DataTable columns={columns} data={data} />);
    const table = container.querySelector('table');
    expect(table?.className).toContain('table-sticky-left');
    expect(table?.className).not.toContain('table-sticky-left-3');
  });

  it('adds table-sticky-left-3 when stickyLeftColumns={3}', () => {
    const { container } = render(<DataTable columns={columns} data={data} stickyLeftColumns={3} />);
    const table = container.querySelector('table');
    expect(table?.className).toContain('table-sticky-left-3');
  });
});
