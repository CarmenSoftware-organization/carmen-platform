import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClusterEditNav } from './ClusterEditNav';

beforeEach(() => {
  class MockIO { observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn(); constructor() {} }
  vi.stubGlobal('IntersectionObserver', MockIO as unknown as typeof IntersectionObserver);
});
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('ClusterEditNav', () => {
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users', count: 12 },
  ];

  it('renders a link per item with count badges', () => {
    render(<ClusterEditNav items={items} />);
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toHaveTextContent('12');
  });

  it('scrolls to a section on click', async () => {
    const target = document.createElement('div');
    target.id = 'users';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(<ClusterEditNav items={items} />);
    await userEvent.click(screen.getByRole('button', { name: /users/i }));
    expect(target.scrollIntoView).toHaveBeenCalled();
  });
});
