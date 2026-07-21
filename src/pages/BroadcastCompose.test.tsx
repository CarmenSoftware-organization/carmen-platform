import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke broadcast.send. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself to always render its
// children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/broadcastService', () => ({
  default: { sendBu: vi.fn(), sendSystem: vi.fn() },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn() },
}));

// Mocked so the failure-path test below can assert exactly what text reaches the
// user, instead of relying on sonner's real (headless-in-jsdom) toast store.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import BroadcastCompose from './BroadcastCompose';
import broadcastService from '../services/broadcastService';
import businessUnitService from '../services/businessUnitService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeBu = { id: 'bu1', code: 'BU1', name: 'Test BU', is_active: true };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/broadcasts/new" element={<BroadcastCompose />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(businessUnitService.getAll).mockResolvedValue({ data: [fakeBu] });
});

// hasPermission()=>false forces the default/only reachable tab to 'bu' (system tabs
// are hidden), so filling title + message + business unit is enough to pass validate().
async function fillBuForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Scheduled maintenance');
  await user.type(screen.getByLabelText('Message'), 'The system will be down briefly.');
  await waitFor(() => expect(screen.getByLabelText('Business unit')).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText('Business unit'), 'BU1');
}

// SECURITY REGRESSION. `broadcast.send` gates the visible Send button (<Can> in
// BroadcastCompose.tsx), but the ConfirmDialog it opens renders outside that gate and
// the Ctrl/Cmd+S shortcut calls handleSend() directly — bypassing the button entirely.
// A user with zero permissions must not be able to reach broadcastService via keyboard.
describe('BroadcastCompose — Ctrl/Cmd+S is gated on broadcast.send', () => {
  it('does not reach broadcastService when the user has no broadcast.send permission', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderAt('/broadcasts/new');

    await fillBuForm(user);

    // Positive control: the Send button itself is correctly hidden.
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();

    await user.keyboard('{Control>}s{/Control}');

    // The shortcut must not be able to open the confirm dialog either.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(broadcastService.sendBu).not.toHaveBeenCalled();
    expect(broadcastService.sendSystem).not.toHaveBeenCalled();
  });

  it('discriminating control: with broadcast.send granted, Ctrl/Cmd+S still reaches Send', async () => {
    // Proves the fix above isn't just disabling the shortcut outright.
    const user = userEvent.setup();
    renderAt('/broadcasts/new');

    // canSendSystem=true defaults to the "All users" tab — title + message is enough.
    await user.type(screen.getByLabelText('Title'), 'Scheduled maintenance');
    await user.type(screen.getByLabelText('Message'), 'The system will be down briefly.');

    await user.keyboard('{Control>}s{/Control}');

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(broadcastService.sendSystem).toHaveBeenCalledTimes(1));
    expect(broadcastService.sendBu).not.toHaveBeenCalled();
  });
});

// HONEST ERROR HANDLING. Backend PR #239 now enforces broadcast.send server-side
// (previously the FE gate was the only boundary). When that server-side check
// rejects the request, the failure must reach the user as the backend's own
// message — never sonner's default/axios-generated "Request failed with status
// code 403" — otherwise a user who slips past the (intentionally coarse) FE gate
// gets a useless, unactionable error instead of the real reason.
describe('BroadcastCompose — send failure surfaces the backend-parsed message, not a raw axios string', () => {
  it('shows the parsed backend message on a 403 from broadcastService.sendSystem', async () => {
    asMock(broadcastService.sendSystem).mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: 'Missing platform permission: broadcast.send' } },
      },
    });
    const user = userEvent.setup();
    renderAt('/broadcasts/new');

    // canSendSystem=true (default mock) defaults to the "All users" tab.
    await user.type(screen.getByLabelText('Title'), 'Scheduled maintenance');
    await user.type(screen.getByLabelText('Message'), 'The system will be down briefly.');

    await user.click(screen.getByRole('button', { name: /^send$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(broadcastService.sendSystem).toHaveBeenCalledTimes(1));

    // The real backend message must reach the user...
    expect(toast.error).toHaveBeenCalledWith('Missing platform permission: broadcast.send');
    // ...and the raw axios-generated message must never be what the toast shows.
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Request failed with status code'));
    expect(toast.error).not.toHaveBeenCalledWith('[object Object]');

    // Same message persists in the in-page banner (BroadcastCompose keeps a banner
    // alongside the toast since the toast auto-dismisses).
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing platform permission: broadcast.send');
  });
});
