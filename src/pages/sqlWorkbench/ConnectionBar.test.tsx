import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionBar } from './ConnectionBar';
import type { BusinessUnit } from '../../types';

const bu: BusinessUnit = {
  id: '1',
  code: 'ACME-TH',
  name: 'Acme Thailand',
  cluster_name: 'Acme Group',
  is_active: true,
};

describe('ConnectionBar', () => {
  it('shows the connected tenant code, name and cluster', () => {
    render(<ConnectionBar bu={bu} canWrite onSwitch={() => {}} />);
    expect(screen.getByText('ACME-TH')).toBeInTheDocument();
    expect(screen.getByText('Acme Thailand')).toBeInTheDocument();
    expect(screen.getByText(/Acme Group/)).toBeInTheDocument();
  });

  it('signals read / write when the user can manage, read-only otherwise', () => {
    const { rerender } = render(<ConnectionBar bu={bu} canWrite onSwitch={() => {}} />);
    expect(screen.getByText('read / write')).toBeInTheDocument();
    rerender(<ConnectionBar bu={bu} canWrite={false} onSwitch={() => {}} />);
    expect(screen.getByText('read-only')).toBeInTheDocument();
  });

  it('prompts to choose a BU when none is connected', () => {
    render(<ConnectionBar bu={null} canWrite={false} onSwitch={() => {}} />);
    expect(screen.getByText('No tenant selected')).toBeInTheDocument();
  });

  it('opens the switcher when the button is pressed', async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionBar bu={bu} canWrite onSwitch={onSwitch} />);
    await user.click(screen.getByLabelText('Switch business unit'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });
});
