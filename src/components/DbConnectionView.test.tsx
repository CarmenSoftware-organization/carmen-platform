import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DbConnectionView from './DbConnectionView';

describe('DbConnectionView', () => {
  it('renders "-" for an empty connection', () => {
    render(<DbConnectionView value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('masks a bare/unparseable connection string with a working reveal toggle', async () => {
    const user = userEvent.setup();
    render(<DbConnectionView value="postgres://user:pw@host/db" />);
    expect(screen.queryByText('postgres://user:pw@host/db')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reveal connection string/i }));
    expect(screen.getByText('postgres://user:pw@host/db')).toBeInTheDocument();
  });

  it('masks a non-password sensitive key with a working reveal toggle', async () => {
    const user = userEvent.setup();
    render(<DbConnectionView value={JSON.stringify({ host: 'db.example.com', apiKey: 'abc123' })} />);
    // safe key -> shown directly, no toggle
    expect(screen.getByText('db.example.com')).toBeInTheDocument();
    // sensitive, non-password key -> masked with a reveal toggle
    expect(screen.queryByText('abc123')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reveal apiKey/i }));
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  // SECURITY. db_connection.password is redacted to '' by the backend on every
  // list/detail read, so a reveal toggle on this field would only ever show blank
  // — indistinguishable from "no password set". It must render as hidden with no
  // working reveal control; the on-demand guarded reveal lives in the edit-mode
  // DatabaseConnectionSection instead.
  it('renders password as hidden with no reveal toggle, regardless of the (redacted) value', () => {
    render(<DbConnectionView value={JSON.stringify({ host: 'db.example.com', password: '' })} />);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal password/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hide password/i })).not.toBeInTheDocument();
  });

  it('treats "password" case-insensitively', () => {
    render(<DbConnectionView value={JSON.stringify({ Password: '' })} />);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
