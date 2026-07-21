import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(table?.className).not.toContain('table-sticky-left-4');
  });

  it('adds both table-sticky-left-3 and -4 when stickyLeftColumns={4}', () => {
    const { container } = render(<DataTable columns={columns} data={data} stickyLeftColumns={4} />);
    const table = container.querySelector('table');
    expect(table?.className).toContain('table-sticky-left-3');
    expect(table?.className).toContain('table-sticky-left-4');
  });
});

type CardRow = { id: string; code: string; name: string; active: boolean };

const cardData: CardRow[] = [{ id: '1', code: 'HQ-01', name: 'Head Office', active: true }];

const cardColumns: ColumnDef<CardRow, unknown>[] = [
  { accessorKey: 'code', header: 'Code', meta: { card: 'title' } },
  { accessorKey: 'name', header: 'Name', meta: { card: 'title' } },
  {
    accessorKey: 'active',
    header: 'Status',
    meta: { card: 'badge' },
    cell: ({ row }) => <span>{row.original.active ? 'Active' : 'Inactive'}</span>,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <button aria-label={`Actions for ${row.original.name}`}>menu</button>,
  },
];

// Each test sets the viewport before rendering; useMediaQuery reads matchMedia
// synchronously in its lazy initializer, so the stub must exist first.
function setViewport(isDesktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width/.test(query) ? isDesktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('DataTable responsive card view', () => {
  it('renders a table on desktop', () => {
    setViewport(true);
    const { container } = render(<DataTable columns={cardColumns} data={cardData} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('renders cards (no table) below the breakpoint', () => {
    setViewport(false);
    const { container } = render(<DataTable columns={cardColumns} data={cardData} />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('HQ-01')).toBeInTheDocument();
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actions for head office/i })).toBeInTheDocument();
  });

  it('keeps a per-row selection checkbox in card mode', () => {
    setViewport(false);
    render(<DataTable columns={cardColumns} data={cardData} enableRowSelection getRowId={(r) => r.id} />);
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('falls back to the table when mobileCards is disabled', () => {
    setViewport(false);
    const { container } = render(<DataTable columns={cardColumns} data={cardData} mobileCards={false} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('shows the empty message in card mode when there are no rows', () => {
    setViewport(false);
    const { container } = render(<DataTable columns={columns} data={[]} />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });
});
