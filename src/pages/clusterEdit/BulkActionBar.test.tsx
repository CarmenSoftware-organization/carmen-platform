import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionBar } from './BulkActionBar';

describe('BulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<BulkActionBar count={0} onClear={() => {}} actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and fires an action', async () => {
    const onClick = vi.fn();
    render(
      <BulkActionBar
        count={3}
        onClear={() => {}}
        actions={[{ key: 'remove', label: 'Remove', onClick }]}
      />,
    );
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('clears the selection', async () => {
    const onClear = vi.fn();
    render(<BulkActionBar count={2} onClear={onClear} actions={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
