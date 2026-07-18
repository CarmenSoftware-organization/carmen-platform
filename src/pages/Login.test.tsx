import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import Login from './Login';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAuthenticated = false;
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

  it('flags a non-email username as invalid on blur', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username|email/i), 'not-an-email');
    await user.tab();

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
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

  it('blocks submission and does not call login when the username is not a valid email', async () => {
    const user = userEvent.setup();
    renderLogin();

    // A non-empty but invalid value is used here (not an empty field) because
    // the native HTML `required` attribute on the input already blocks jsdom
    // from ever dispatching the submit event for an empty required field —
    // handleSubmit's own pre-submit re-validation never even runs in that
    // case. An invalid-format value bypasses `required` and actually reaches
    // handleSubmit's validateField() check.
    await user.type(screen.getByLabelText(/username|email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
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
