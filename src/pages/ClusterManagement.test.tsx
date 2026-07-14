import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown + dialog rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the page reads it on render.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/Can', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn(), delete: vi.fn() },
}));

import ClusterManagement from './ClusterManagement';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const clusters = [
  { id: 'c1', code: 'ACME', name: 'Acme Hotels', is_active: true, bu_count: 14, max_license_bu: 20, users_count: 100, total_max_license_users: 200, created_at: '2025-02-01T00:00:00Z' },
  { id: 'c2', code: 'BETA', name: 'Beta Foods', is_active: true, bu_count: 0, max_license_bu: 10, users_count: 5, total_max_license_users: 50, created_at: '2025-03-01T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  asMock(clusterService.getAll).mockResolvedValue({ data: clusters, paginate: { total: 2, page: 1, perpage: 10 } });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ClusterManagement />
    </MemoryRouter>,
  );

const openRowDelete = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }));
  await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
};

describe('ClusterManagement delete guard', () => {
  it('blocks deleting a cluster that still has business units', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Hotels');

    await openRowDelete(user, 'Acme Hotels');

    expect(toast.error).toHaveBeenCalledWith(
      "Can't delete Acme Hotels",
      expect.objectContaining({ description: expect.stringContaining('14 business units') }),
    );
    // the confirm dialog must not open, and nothing is deleted
    expect(screen.queryByText(/are you sure you want to delete this cluster/i)).toBeNull();
    expect(clusterService.delete).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog for a cluster with no business units', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beta Foods');

    await openRowDelete(user, 'Beta Foods');

    expect(await screen.findByText(/are you sure you want to delete this cluster/i)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
