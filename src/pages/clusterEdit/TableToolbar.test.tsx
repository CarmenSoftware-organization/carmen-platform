import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableToolbar } from './TableToolbar';

describe('TableToolbar', () => {
  it('calls onSearchChange as the user types', async () => {
    const onSearchChange = vi.fn();
    render(<TableToolbar search="" onSearchChange={onSearchChange} placeholder="Search units" />);
    await userEvent.type(screen.getByPlaceholderText('Search units'), 'ho');
    expect(onSearchChange).toHaveBeenLastCalledWith('o'); // last keystroke value (controlled by parent)
  });

  it('renders filter chips and toggles them', async () => {
    const onToggle = vi.fn();
    render(
      <TableToolbar
        search=""
        onSearchChange={() => {}}
        filters={[{ key: 'active', label: 'Active', active: false, onToggle }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('marks an active chip with aria-pressed', () => {
    render(
      <TableToolbar
        search=""
        onSearchChange={() => {}}
        filters={[{ key: 'active', label: 'Active', active: true, onToggle: () => {} }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
  });
});
