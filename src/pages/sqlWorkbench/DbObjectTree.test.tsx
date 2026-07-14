import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DbObjectTree } from './DbObjectTree';
import type { DbObjectsResponse } from '../../types';

const data: DbObjectsResponse = {
  tables: [{ schema: 'public', name: 'orders' }],
  views: [{ schema: 'public', name: 'v_test' }],
  procedures: [],
  columns: [],
};

describe('DbObjectTree', () => {
  it('renders a Tables section from data.tables', () => {
    render(
      <DbObjectTree
        data={data}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Tables')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('calls onSelect with type "table" when a table row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DbObjectTree
        data={data}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText('orders'));
    expect(onSelect).toHaveBeenCalledWith({ type: 'table', schema: 'public', name: 'orders' });
  });
});
