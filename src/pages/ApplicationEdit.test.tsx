import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke application.update. `Can` (the REAL component,
// not mocked here) reads this via useAuth() — mocking `Can` itself to always render
// its children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/applicationService', () => ({
  default: {
    getById: vi.fn(),
    getApiCatalog: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import ApplicationEdit from './ApplicationEdit';
import applicationService from '../services/applicationService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeApp = {
  id: 'a1',
  name: 'mobile-app',
  description: 'Mobile client',
  is_active: true,
  allow_all: false,
  device: 'mobile',
  api_names: ['cluster.read'],
  created_at: '2026-01-05T10:00:00Z',
  created_by_name: 'Ada Lovelace',
  updated_at: '2026-02-10T10:00:00Z',
  updated_by_name: 'Grace Hopper',
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/applications/new" element={<ApplicationEdit />} />
        <Route path="/applications/:id/edit" element={<ApplicationEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(applicationService.getApiCatalog).mockResolvedValue({ groups: [], api_names: [] });
});

describe('ApplicationEdit (integration)', () => {
  it('loads an existing application into the identity hero, including audit meta', async () => {
    asMock(applicationService.getById).mockResolvedValue({ data: fakeApp });
    renderAt('/applications/a1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'mobile-app' })).toBeInTheDocument();
    expect(screen.getByText('a1', { selector: 'span' })).toBeInTheDocument();
    // The audit fields the backend returns are now read and surfaced.
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.getByText(/5 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByText(/10 Feb 2026/)).toBeInTheDocument();
    expect(screen.getByText(/by Grace Hopper/)).toBeInTheDocument();
  });

  it('starts a new application in edit mode without calling getById, using PageHeader', async () => {
    renderAt('/applications/new');

    expect(await screen.findByText('Add Application')).toBeInTheDocument();
    expect(screen.getByText('Create a new application')).toBeInTheDocument();
    expect(applicationService.getById).not.toHaveBeenCalled();
    // The isNew path uses the lighter PageHeader, not the full identity hero.
    expect(screen.queryByText('(unnamed application)')).not.toBeInTheDocument();
  });
});

describe('ApplicationEdit — loading state', () => {
  it('shows a loading region matching the loaded two-Card layout', async () => {
    const deferred = createDeferred<{ data: typeof fakeApp }>();
    asMock(applicationService.getById).mockReturnValue(deferred.promise);
    renderAt('/applications/a1/edit');

    expect(screen.getByRole('status', { name: /loading application/i })).toBeInTheDocument();
    deferred.resolve({ data: fakeApp });
    expect(await screen.findByRole('heading', { level: 1, name: 'mobile-app' })).toBeInTheDocument();
  });
});

describe('ApplicationEdit — not-found state', () => {
  it('gates the edit shell behind a not-found state on a 404', async () => {
    asMock(applicationService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/applications/nope/edit');

    expect(await screen.findByText('Application not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to applications/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(applicationService.getById).mockResolvedValue({ data: null });
    renderAt('/applications/nope/edit');

    expect(await screen.findByText('Application not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(applicationService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/applications/a1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load application/i);
    expect(screen.queryByText('Application not found')).toBeNull();
  });
});

describe('ApplicationEdit — Edit is gated on application.update', () => {
  beforeEach(() => {
    asMock(applicationService.getById).mockResolvedValue({ data: fakeApp });
  });

  it('hides Edit without application.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/applications/a1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'mobile-app' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Edit when application.update is held (discriminating control)', async () => {
    renderAt('/applications/a1/edit');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});

// Loading-vs-empty conflation fix: `catalogGroups.length === 0` alone can't tell a
// still-loading catalog apart from one that genuinely returned zero groups.
describe('ApplicationEdit — API catalog states', () => {
  it('shows a loading message while the catalog fetch is in flight', async () => {
    const deferred = createDeferred<{ groups: never[]; api_names: never[] }>();
    asMock(applicationService.getApiCatalog).mockReturnValue(deferred.promise);
    renderAt('/applications/new');

    expect(await screen.findByText('Loading catalog…')).toBeInTheDocument();
    // Left pending deliberately — no further assertions depend on resolution.
  });

  it('distinguishes a loaded-but-empty catalog from the loading state', async () => {
    asMock(applicationService.getApiCatalog).mockResolvedValue({ groups: [], api_names: [] });
    renderAt('/applications/new');

    expect(await screen.findByText('No API endpoints are defined in the catalog yet.')).toBeInTheDocument();
    expect(screen.queryByText('Loading catalog…')).not.toBeInTheDocument();
  });

  it('shows FetchErrorState on catalog failure, keeps the ChipInput fallback, and retries on demand', async () => {
    const user = userEvent.setup();
    asMock(applicationService.getApiCatalog)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ groups: [{ module: 'cluster', api_names: ['cluster.read'] }], api_names: ['cluster.read'] });
    renderAt('/applications/new');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the API catalog.");
    expect(screen.getByPlaceholderText('Type an api_name and press Enter')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(applicationService.getApiCatalog).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('cluster')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
