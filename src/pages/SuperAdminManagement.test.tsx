import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Radix dropdown/dialog/select rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// The page reads localStorage directly on every render (search term).
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

// Mutable auth. Unlike UserManagement/ClusterEdit etc., `SuperAdminManagement` itself never
// reads `useAuth()` — there is no `<Can>` and no `isSuperAdmin` check anywhere in the page
// source (verified by reading the file). `isSuperAdmin`/`isAuthenticated`/`loading` here exist
// only to drive `PrivateRoute`, which is what this test actually exercises.
const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  loading: false,
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/superAdminService', () => ({
  default: {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../services/userService', () => ({
  default: {
    getAll: vi.fn(),
  },
}));

import SuperAdminManagement from './SuperAdminManagement';
import PrivateRoute from '../components/PrivateRoute';
import superAdminService from '../services/superAdminService';
import userService from '../services/userService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleSuperAdminRow = { id: 'sa1', user_id: 'u1', created_at: '2026-01-01T00:00:00Z', is_active: true };
const sampleUser = { id: 'u1', email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' };

const superAdminListResponse = { data: [sampleSuperAdminRow] };
const usersListResponse = { data: [sampleUser] };

// Mirrors the real route registration in App.tsx (`/platform/super-admins`, guarded by
// `<PrivateRoute requireSuperAdmin>`), not a bespoke wrapper — the whole point of this test is
// to prove the actual route configuration blocks/admits correctly.
const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/platform/super-admins']}>
      <Routes>
        <Route
          path="/platform/super-admins"
          element={
            <PrivateRoute requireSuperAdmin>
              <SuperAdminManagement />
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isAuthenticated = true;
  auth.loading = false;
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(superAdminService.list).mockResolvedValue(superAdminListResponse);
  asMock(superAdminService.add).mockResolvedValue({});
  asMock(superAdminService.remove).mockResolvedValue({});
  asMock(userService.getAll).mockResolvedValue(usersListResponse);
});

// SECURITY / AUDIT (Task 7, Step 1). `SuperAdminManagement.tsx` has NO per-control `<Can>` and
// NO `isSuperAdmin` check anywhere in its own source — no `useAuth` import at all. Every
// mutating control (header "Add Super Admin" button + dialog -> `superAdminService.add`, and
// each row's "Remove" action -> `superAdminService.remove`) renders and is wired
// unconditionally the moment the component mounts. This is the intentional design Wave 2
// documented: super admins bypass every permission check (`checkPermission` short-circuits to
// `true` once `is_super_admin` is set — `utils/permissions.ts:28`), so a `<Can permission="...">`
// gate would always evaluate true for the only audience that can ever legitimately reach this
// page, adding a checked box with no actual discrimination.
//
// Protection is therefore entirely at the ROUTE level: `App.tsx` registers
// `/platform/super-admins` as `<PrivateRoute requireSuperAdmin><SuperAdminManagement /></PrivateRoute>`
// (the only place `SuperAdminManagement` is ever rendered — verified by grep), and
// `PrivateRoute` (`src/components/PrivateRoute.tsx:60-62`) renders `<AccessDenied>` instead of
// `children` whenever `requireSuperAdmin && !isSuperAdmin`, so the page component never mounts
// for a non-super-admin — its unconditionally-wired Add/Remove UI never gets an audience. The
// sidebar nav item is also hidden for non-super-admins (`Layout.tsx:65,73`,
// `superAdminOnly: true`), but that's a UX nicety, not the security boundary; the boundary is
// `PrivateRoute`.
//
// Because `SuperAdminManagement` itself has no internal branch on `isSuperAdmin`, it would
// render the exact same actionable Add/Remove UI for a super-admin and a non-super-admin if it
// were ever mounted directly — there is no in-component signal to assert a discriminating pair
// against. So, per the task brief's fallback, this test proves the discriminating behaviour one
// layer up, at `PrivateRoute`, using the real route configuration.
describe('SuperAdminManagement — route-level requireSuperAdmin gate (no per-control <Can>, by design)', () => {
  it('blocks a non-super-admin: Access Denied renders, the mutating page never mounts', async () => {
    auth.isSuperAdmin = false;
    renderRoute();

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /super admins/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add super admin/i })).toBeNull();

    // The page's own fetchData (and therefore any super-admin data) never runs — proves the
    // block happens before the component mounts, not just that a banner is painted over it.
    expect(superAdminService.list).not.toHaveBeenCalled();
    expect(userService.getAll).not.toHaveBeenCalled();
  });

  it('admits a super-admin: renders the page with an actionable Add Super Admin control (discriminating control)', async () => {
    auth.isSuperAdmin = true;
    renderRoute();

    expect(await screen.findByRole('heading', { name: /super admins/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add super admin/i })).toBeInTheDocument();
    expect(screen.queryByText('Access Denied')).toBeNull();
    expect(superAdminService.list).toHaveBeenCalled();
  });

  it('admits a super-admin to the row Remove action too (discriminating control, second mutating control)', async () => {
    auth.isSuperAdmin = true;
    const user = userEvent.setup();
    renderRoute();

    await screen.findByRole('heading', { name: /super admins/i });
    await user.click(await screen.findByRole('button', { name: /actions for jane doe/i }));

    expect(await screen.findByRole('menuitem', { name: /remove/i })).toBeInTheDocument();
  });
});
