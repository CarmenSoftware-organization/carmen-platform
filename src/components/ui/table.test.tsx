import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';

describe('Table', () => {
  it('renders a real <table> element with forwarded className (sticky contract)', () => {
    render(
      <Table className="table-sticky-left">
        <TableHeader>
          <TableRow>
            <TableHead>H</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>C</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const table = screen.getByRole('table');
    expect(table.tagName).toBe('TABLE');
    expect(table.className).toContain('table-sticky-left');
  });

  it('renders semantic native tags for thead/tbody/tr/th/td', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const headerCell = screen.getByText('Header');
    const bodyCell = screen.getByText('Cell');
    expect(headerCell.tagName).toBe('TH');
    expect(bodyCell.tagName).toBe('TD');

    const headerRow = headerCell.closest('tr');
    const bodyRow = bodyCell.closest('tr');
    expect(headerRow).not.toBeNull();
    expect(bodyRow).not.toBeNull();

    const thead = headerRow?.closest('thead');
    const tbody = bodyRow?.closest('tbody');
    expect(thead).not.toBeNull();
    expect(thead?.tagName).toBe('THEAD');
    expect(tbody).not.toBeNull();
    expect(tbody?.tagName).toBe('TBODY');
  });

  it('TableRow carries the zebra-row class', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Zebra</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const cell = screen.getByText('Zebra');
    const row = cell.closest('tr');
    expect(row).not.toBeNull();
    expect(row?.className).toContain('zebra-row');
  });

  it('wraps the table in a relative w-full rounded-lg div', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Wrapped</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const table = screen.getByRole('table');
    const wrapper = table.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('relative');
    expect(wrapper?.className).toContain('w-full');
    expect(wrapper?.className).toContain('rounded-lg');
  });

  it('renders TableFooter as a real <tfoot>', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Body</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    const footerCell = screen.getByText('Footer');
    const footerRow = footerCell.closest('tr');
    const tfoot = footerRow?.closest('tfoot');
    expect(tfoot).not.toBeNull();
    expect(tfoot?.tagName).toBe('TFOOT');
  });

  it('renders TableCaption as a real <caption>', () => {
    render(
      <Table>
        <TableCaption>My caption</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Body</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const caption = screen.getByText('My caption');
    expect(caption.tagName).toBe('CAPTION');
  });
});
