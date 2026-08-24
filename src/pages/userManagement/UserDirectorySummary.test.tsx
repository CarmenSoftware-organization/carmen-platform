import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserDirectorySummary } from './UserDirectorySummary';

describe('UserDirectorySummary', () => {
  const summary = {
    total: 128,
    active: 96,
    inactive: 32,
    deleted: 5,
    business_units: 8,
    newest: [
      { id: 'f1', firstname: 'Ana', lastname: 'Lopez' },
      { id: 'f2', firstname: 'Ben', lastname: 'North' },
    ],
  };

  it('renders the population and status split', () => {
    render(<UserDirectorySummary summary={summary} loading={false} />);
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows a "+N more" pill for members beyond the faces shown', () => {
    render(<UserDirectorySummary summary={summary} loading={false} />);
    expect(screen.getByText('+126')).toBeInTheDocument(); // 128 total − 2 faces
  });

  it('hides the archived legend when there are none', () => {
    render(<UserDirectorySummary summary={{ ...summary, deleted: 0 }} loading={false} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    render(<UserDirectorySummary summary={null} loading={false} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the directory summary.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
