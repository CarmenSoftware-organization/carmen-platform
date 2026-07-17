import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke user.update. `Can` (the REAL component, not
// mocked here) reads this mock via useAuth() — mocking `Can` itself to always
// render its children would make the permission tests below vacuous (this is
// exactly what hid the Task 2 BusinessUnitEdit permission hole).
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/userService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: {
    getAll: vi.fn(),
    createUserBusinessUnit: vi.fn(),
    deleteUserBusinessUnit: vi.fn(),
  },
}));

import UserEdit from './UserEdit';
import userService from '../services/userService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeUser = {
  id: 'u1',
  username: 'jane@example.com',
  email: 'jane@example.com',
  alias_name: 'JD',
  firstname: 'Jane',
  middlename: '',
  lastname: 'Doe',
  is_active: true,
  business_units: [],
  clusters: [],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users/new" element={<UserEdit />} />
        <Route path="/users/:id/edit" element={<UserEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(userService.getById).mockResolvedValue({ data: fakeUser });
});

describe('UserEdit (integration)', () => {
  it('loads an existing user into the identity hero', async () => {
    renderAt('/users/u1/edit');
    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument();
  });
});

// Shared A4 not-found pattern, established on the ClusterEdit reference: a bad/deleted
// id gates the whole shell instead of rendering it over blank data under a banner.
describe('UserEdit — not-found state', () => {
  it('gates the edit shell behind a not-found state on a 404', async () => {
    asMock(userService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/users/nope/edit');

    expect(await screen.findByText('User not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to users/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(userService.getById).mockResolvedValue({ data: null });
    renderAt('/users/nope/edit');

    expect(await screen.findByText('User not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(userService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load user/i);
    expect(screen.queryByText('User not found')).toBeNull();
  });
});

// SECURITY REGRESSION. Change password previously had no <Can> gate at all, while
// the adjacent Edit button was gated on user.update — any user who could reach this
// page could open the reset-password dialog and call userService.resetPassword with
// no permission check at all.
describe('UserEdit — Change password is gated on user.update', () => {
  it('hides Change password (and Edit) without user.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Change password when the user holds user.update (discriminating control)', async () => {
    // Proves the assertions above are not vacuous (e.g. a bad selector that never
    // matches would make the negative assertions pass for the wrong reason).
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('button', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});

describe('UserEdit — Alias Name validation', () => {
  it('flags an alias over 3 characters on blur, matching Username/Email on the same form', async () => {
    const user = userEvent.setup();
    renderAt('/users/u1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const aliasInput = screen.getByRole('textbox', { name: /alias name/i });
    await user.clear(aliasInput);
    await user.type(aliasInput, 'ABCD');
    await user.tab();

    expect(await screen.findByText(/alias must be 1-3 alphanumeric characters/i)).toBeInTheDocument();
    expect(aliasInput).toHaveClass('border-destructive');
  });

  it('clears the alias error when the field regains focus, matching Username/Email', async () => {
    const user = userEvent.setup();
    renderAt('/users/u1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const aliasInput = screen.getByRole('textbox', { name: /alias name/i });
    await user.clear(aliasInput);
    await user.type(aliasInput, 'ABCD');
    await user.tab();
    expect(await screen.findByText(/alias must be 1-3 alphanumeric characters/i)).toBeInTheDocument();

    await user.click(aliasInput);
    expect(screen.queryByText(/alias must be 1-3 alphanumeric characters/i)).toBeNull();
  });
});
