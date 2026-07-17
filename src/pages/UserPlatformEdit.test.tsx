import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke user_platform.manage. `Can` (the REAL component,
// not mocked here) reads this via useAuth() — mocking `Can` itself to always render its
// children would make the permission tests below vacuous, which is exactly what hid the
// wave-2 permission holes on the pages this page's harness is copied from.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/userService', () => ({ default: { getById: vi.fn() } }));
vi.mock('../services/userRoleService', () => ({ default: { list: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
vi.mock('../services/roleService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/clusterService', () => ({ default: { getAll: vi.fn() } }));

import UserPlatformEdit from './UserPlatformEdit';
import userService from '../services/userService';
import userRoleService from '../services/userRoleService';
import roleService from '../services/roleService';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeUser = {
  id: 'u1',
  username: 'jane@example.com',
  email: 'jane@example.com',
  firstname: 'Jane',
  lastname: 'Doe',
};

const assignment = {
  id: 'ra1',
  role_id: 'r1',
  role_name: 'Platform Admin',
  scope: { type: 'platform' as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(userService.getById).mockResolvedValue({ data: fakeUser });
  asMock(userRoleService.list).mockResolvedValue([assignment]);
  asMock(roleService.getAll).mockResolvedValue({ data: [{ id: 'r1', name: 'Platform Admin' }] });
  asMock(clusterService.getAll).mockResolvedValue({ data: [{ id: 'c1', name: 'Acme Cluster' }] });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/platform/user-platform/u1']}>
      <Routes>
        <Route path="/platform/user-platform/:userId" element={<UserPlatformEdit />} />
      </Routes>
    </MemoryRouter>,
  );

describe('UserPlatformEdit (integration)', () => {
  it('loads the user and their role assignments', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });
});

// SECURITY. Every write surface on this page is gated on user_platform.manage:
//   1. the Add Role button          (UserPlatformEdit.tsx:211)
//   2. the per-assignment Remove    (UserPlatformEdit.tsx:235)
//   3. the add-role mini-form       (UserPlatformEdit.tsx:252)
// These tests must FAIL if gate 1 or 2 is deleted. See the note on gate 3 below.
describe('UserPlatformEdit — role write surfaces are gated on user_platform.manage', () => {
  it('hides Add Role and Remove without user_platform.manage', async () => {
    auth.hasPermission = () => false;
    renderPage();

    // Positive anchor: the page really rendered, so the negatives below are meaningful.
    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /add role/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove platform admin/i })).toBeNull();
  });

  // Discriminating control. Proves the negatives above aren't passing because of a bad
  // selector, and that the gates key on user_platform.manage rather than any truthy perm.
  it('shows Add Role and Remove when user_platform.manage is held (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'user_platform.manage';
    renderPage();

    expect(await screen.findByRole('button', { name: /add role/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove platform admin/i })).toBeInTheDocument();
  });

  it('does not unlock the write surfaces on the read-only permission', async () => {
    auth.hasPermission = (perm) => perm === 'user_platform.read';
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add role/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove platform admin/i })).toBeNull();
  });

  // Gate 3 (the mini-form at :252) is only reachable through gate 1's Add Role button,
  // so no UI path can open the form without user_platform.manage — this asserts the
  // reachable behaviour. NOTE: because both gates read the same permission and the form
  // has no other opener, deleting gate 3 *alone* would not fail any test. It is
  // defense-in-depth behind gate 1; see the task report.
  it('opens the add-role form only with user_platform.manage', async () => {
    auth.hasPermission = (perm) => perm === 'user_platform.manage';
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /add role/i }));

    expect(await screen.findByLabelText(/role \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scope/i)).toBeInTheDocument();
  });

  it('never renders the add-role form without user_platform.manage', async () => {
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/role \*/i)).toBeNull();
  });
});
