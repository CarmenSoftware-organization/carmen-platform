import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FetchErrorState } from './FetchErrorState';

describe('FetchErrorState', () => {
  it('renders the given message inside an alert region', () => {
    render(<FetchErrorState message="Couldn't load the catalog." onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the catalog.");
  });

  it('falls back to a default message', () => {
    render(<FetchErrorState onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this.");
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<FetchErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses a custom retry label', () => {
    render(<FetchErrorState onRetry={() => {}} retryLabel="Reload" />);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
