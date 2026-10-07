import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mutable auth so each test controls what login() resolves to, and whether the
// user is already authenticated. `useAuth` is mocked (not the real AuthContext) —
// Login.tsx has no other dependency on AuthContext internals.
const auth = vi.hoisted(() => ({
  login: vi.fn(),
  isAuthenticated: false,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

// สวิตช์ Google จาก gateway — ค่าเริ่มต้นของเทสต์คือเปิด เพื่อให้เทสต์ปุ่มเดิมยังหาปุ่มเจอ
const googleSignIn = vi.hoisted(() => ({ enabled: true }));
vi.mock('../services/googleSignInService', () => ({
  fetchGoogleSignInEnabled: () => Promise.resolve(googleSignIn.enabled),
}));

import Login from './Login';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// ปุ่ม Google แสดงทันทีแต่ disabled จนกว่าคำตอบของ status จะมาถึง — รอให้กดได้ก่อนคลิก
async function findEnabledGoogleButton() {
  const button = await screen.findByRole('button', { name: /continue with google/i });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

function renderLogin(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAuthenticated = false;
  googleSignIn.enabled = true;
});

describe('Login — rate-limit resubmit lock', () => {
  it('keeps submit disabled after a rate-limit (429) response', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({
      success: false,
      error: 'Too many login attempts. Please try again later.',
    });
    renderLogin();

    await user.type(screen.getByLabelText(/username|email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i);
    expect(screen.getByRole('button', { name: /sign in|locked|wait/i })).toBeDisabled();
  });

  it('does not lock the submit button for a non-rate-limit error (discriminates the 429-specific match)', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({
      success: false,
      error: 'Invalid email/username or password.',
    });
    renderLogin();

    await user.type(screen.getByLabelText(/username|email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });

  it('clears the lock once the user edits a field, allowing another attempt', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({
      success: false,
      error: 'Too many login attempts. Please try again later.',
    });
    renderLogin();

    const usernameInput = screen.getByLabelText(/username|email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(usernameInput, 'a@b.co');
    await user.type(passwordInput, 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i);
    expect(screen.getByRole('button', { name: /sign in|locked|wait/i })).toBeDisabled();

    // Editing a field is the honest way out of a plain disabled+message lock —
    // no invented countdown/Retry-After exists to auto-clear it.
    await user.type(passwordInput, 'x');

    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });
});

describe('Login — onBlur validation', () => {
  it('shows a validation message on blur of an empty username', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByLabelText(/username|email/i));
    await user.tab();

    expect(await screen.findByText(/required|valid/i)).toBeInTheDocument();
  });

  it('shows a validation message on blur of an empty password', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByLabelText(/password/i));
    await user.tab();

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it('clears the field error once the user edits the field again', async () => {
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/username|email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // Give password a value first — otherwise the refocus that user.type()
    // performs on usernameInput below blurs the still-empty password field
    // as a side effect and raises its own "Password is required" message,
    // which would falsely satisfy a broad /required/i assertion below.
    await user.type(passwordInput, 'secret123');

    await user.click(usernameInput);
    await user.tab();
    expect(await screen.findByText('Username is required')).toBeInTheDocument();

    await user.type(usernameInput, 'a@b.co');
    expect(screen.queryByText('Username is required')).toBeNull();
  });
});

describe('Login — non-email username support', () => {
  // The field is labeled "Email or username" and the backend's own 401 copy is
  // 'Invalid email/username or password.' — plain usernames (e.g. 'admin') are a
  // supported, first-class login path, not just email addresses. A prior
  // (buggy) version of getFieldError delegated every non-empty username to
  // validateField('username', …), which is email-only — that silently blocked
  // all username-based logins. This test fails against that buggy code.
  it('accepts a plain non-email username on blur and submits it to login()', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({ success: true });
    renderLogin();

    const usernameInput = screen.getByLabelText(/username|email/i);
    await user.type(usernameInput, 'admin');
    await user.tab();

    // No email-format error on blur for a plain username.
    expect(screen.queryByText(/valid email address/i)).toBeNull();

    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(auth.login).toHaveBeenCalledWith({ username: 'admin', password: 'secret123' });
  });
});

describe('Login — happy path and generic error', () => {
  it('navigates away on a successful login (no error banner rendered)', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({ success: true });
    renderLogin();

    await user.type(screen.getByLabelText(/username|email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(auth.login).toHaveBeenCalledWith({ username: 'a@b.co', password: 'secret123' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a role="alert" banner with the message from a generic failed login', async () => {
    const user = userEvent.setup();
    asMock(auth.login).mockResolvedValue({ success: false, error: 'Login failed' });
    renderLogin();

    await user.type(screen.getByLabelText(/username|email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/login failed/i);
  });
});

describe('Login — Google sign-in', () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('sends the browser to the gateway authorize endpoint for Platform', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(await findEnabledGoogleButton());

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0] as string, 'http://x');
    expect(url.pathname).toBe('/api/auth/google/authorize');
    expect(url.searchParams.get('app')).toBe('platform');
    expect(url.searchParams.get('locale')).toBe('en');
    expect(url.searchParams.has('next')).toBe(false);
  });

  it('carries a deep link through to the gateway as `next`', async () => {
    const user = userEvent.setup();
    renderLogin('/login?next=%2Fclusters');

    await user.click(await findEnabledGoogleButton());

    const url = new URL(assign.mock.calls[0][0] as string, 'http://x');
    expect(url.searchParams.get('next')).toBe('/clusters');
  });

  it.each([
    ['google_no_account', /no carmen platform account/i],
    ['google_account_conflict', /conflicts with another account/i],
    ['google_too_many_attempts', /too many sign-in attempts/i],
    ['google_failed', /google sign-in failed/i],
    ['google_disabled', /google sign-in is turned off/i],
    ['access_denied_platform', /not authorized to access this platform/i],
  ])('translates the error code %s into a banner', (code, text) => {
    renderLogin(`/login?error=${code}`);

    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('never renders free text from the URL: an unknown code shows the generic message', () => {
    renderLogin('/login?error=Your%20account%20is%20suspended%20call%20555-0100');

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/google sign-in failed/i);
    expect(banner).not.toHaveTextContent(/555-0100/);
  });

  it('shows no banner when there is no error code', () => {
    renderLogin('/login');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Login — hardening of URL-supplied values', () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'treats the object-prototype name %s as an unknown code, not a crash',
    (code) => {
      renderLogin(`/login?error=${code}`);

      expect(screen.getByRole('alert')).toHaveTextContent(/google sign-in failed/i);
    },
  );

  it('does not forward an unsafe `next` (tab-smuggled host) to the gateway', async () => {
    const user = userEvent.setup();
    renderLogin('/login?next=%2F%09%2Fevil.example.com');

    await user.click(await findEnabledGoogleButton());

    const url = new URL(assign.mock.calls[0][0] as string, 'http://x');
    expect(url.searchParams.has('next')).toBe(false);
  });

  it('drops the bold Access Denied heading once the user starts typing again', async () => {
    const user = userEvent.setup();
    renderLogin('/login?error=access_denied_platform');
    expect(screen.getByRole('alert')).toHaveTextContent(/access denied/i);

    await user.type(screen.getByLabelText(/username|email/i), 'a');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
