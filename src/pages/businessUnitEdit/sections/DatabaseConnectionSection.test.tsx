import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

// Mutable auth so a test can grant/revoke cluster.update. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself to
// always render its children would make the reveal-gate test below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../../services/businessUnitService', () => ({
  default: { revealDbPassword: vi.fn() },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import DatabaseConnectionSection from './DatabaseConnectionSection';
import businessUnitService from '../../../services/businessUnitService';

type DbProps = SectionFieldProps & {
  businessUnitId?: string;
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
};

const baseProps = (over: Partial<DbProps> = {}): DbProps => ({
  formData: {
    ...initialFormData,
    db_connection: [
      { key: 'host', value: 'localhost' },
      { key: 'password', value: 'secret' },
      { key: 'poolSize', value: '10' },
    ],
  },
  editing: true,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  onDbFieldChange: vi.fn(),
  onDbExtraChange: vi.fn(),
  onAddDbExtraRow: vi.fn(),
  onRemoveDbExtraRow: vi.fn(),
  ...over,
});

describe('DatabaseConnectionSection (edit mode)', () => {
  it('renders the known fields holding their loaded values', () => {
    render(<DatabaseConnectionSection {...baseProps()} />);
    expect(screen.getByLabelText('Host')).toHaveValue('localhost');
    expect(screen.getByLabelText('Port')).toHaveValue(null); // empty number input
    expect(screen.getByLabelText('User')).toHaveValue('');
  });

  it('calls onDbFieldChange when editing a known field', async () => {
    const user = userEvent.setup();
    const onDbFieldChange = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onDbFieldChange })} />);
    await user.type(screen.getByLabelText('Host'), 'X');
    expect(onDbFieldChange).toHaveBeenCalledWith('host', expect.any(String));
  });

  it('masks the password but reveals it on toggle', async () => {
    const user = userEvent.setup();
    render(<DatabaseConnectionSection {...baseProps()} />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /reveal password/i }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('renders unknown keys as extra rows and adds a row', async () => {
    const user = userEvent.setup();
    const onAddDbExtraRow = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onAddDbExtraRow })} />);
    expect(screen.getByDisplayValue('poolSize')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add field/i }));
    expect(onAddDbExtraRow).toHaveBeenCalled();
  });

  it('shows the masked read-only view when not editing', () => {
    render(<DatabaseConnectionSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('localhost')).toBeInTheDocument();
    expect(screen.queryByLabelText('Host')).not.toBeInTheDocument();
  });

  it('calls onRemoveDbExtraRow with the full-array index', async () => {
    const user = userEvent.setup();
    const onRemoveDbExtraRow = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onRemoveDbExtraRow })} />);
    await user.click(screen.getByRole('button', { name: /remove field/i }));
    expect(onRemoveDbExtraRow).toHaveBeenCalledWith(2);
  });

  it('calls onDbExtraChange with the full-array index when editing an extra key', async () => {
    const user = userEvent.setup();
    const onDbExtraChange = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onDbExtraChange })} />);
    await user.type(screen.getByDisplayValue('poolSize'), 'X');
    expect(onDbExtraChange).toHaveBeenCalledWith(2, 'key', expect.any(String));
  });

  it('toggles ssl via the checkbox', async () => {
    const user = userEvent.setup();
    const onDbFieldChange = vi.fn();
    render(<DatabaseConnectionSection {...baseProps({ onDbFieldChange })} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onDbFieldChange).toHaveBeenCalledWith('ssl', 'true');
  });

  it('warns when port is non-numeric', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: 'port', value: 'abc' }] },
    })} />);
    expect(screen.getByText(/port must be a number/i)).toBeInTheDocument();
  });

  it('does not warn for a numeric port', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: 'port', value: '5432' }] },
    })} />);
    expect(screen.queryByText(/port must be a number/i)).not.toBeInTheDocument();
  });

  it('warns when an extra row has a value but no key', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: { ...initialFormData, db_connection: [{ key: '', value: 'orphan' }] },
    })} />);
    expect(screen.getByText(/key is required/i)).toBeInTheDocument();
  });
});

// SECURITY. db_connection.password is now redacted to '' by the backend on every
// list/detail read (a separate PR), so the password field is write-only from the
// client's perspective: it never round-trips a real value from the API. The only
// path to the stored plaintext is the guarded on-demand reveal endpoint, gated
// server-side on cluster.update. This suite proves (a) the input never pretends to
// hold a real value, and (b) the reveal control is genuinely gated, not decorative.
describe('DatabaseConnectionSection — write-only password + guarded reveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.hasPermission = () => true;
  });

  it('renders the password write-only: blank input + "leave blank" hint, even when loaded with a (redacted) empty password', () => {
    render(<DatabaseConnectionSection {...baseProps({
      formData: {
        ...initialFormData,
        db_connection: [
          { key: 'host', value: 'db.example.com' },
          { key: 'password', value: '' },
        ],
      },
      businessUnitId: 'bu1',
    })} />);

    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByText(/leave blank to keep the current password/i)).toBeInTheDocument();
  });

  it('does not render the reveal control without cluster.update (discriminating negative)', () => {
    auth.hasPermission = () => false;
    render(<DatabaseConnectionSection {...baseProps({ businessUnitId: 'bu1' })} />);

    expect(screen.queryByRole('button', { name: /reveal current password/i })).not.toBeInTheDocument();
  });

  it('renders the reveal control with cluster.update, and shows the fetched plaintext on click without prefilling the input', async () => {
    auth.hasPermission = () => true;
    const user = userEvent.setup();
    vi.mocked(businessUnitService.revealDbPassword).mockResolvedValue({
      host: 'db.example.com',
      password: 'super-secret',
    });
    render(<DatabaseConnectionSection {...baseProps({
      formData: {
        ...initialFormData,
        db_connection: [
          { key: 'host', value: 'db.example.com' },
          { key: 'password', value: '' },
        ],
      },
      businessUnitId: 'bu1',
    })} />);

    const revealBtn = screen.getByRole('button', { name: /reveal current password/i });
    await user.click(revealBtn);

    expect(businessUnitService.revealDbPassword).toHaveBeenCalledWith('bu1');
    expect(await screen.findByText('super-secret')).toBeInTheDocument();
    // Never prefills the write-only input with the revealed value.
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('does not auto-fetch the reveal on mount', () => {
    render(<DatabaseConnectionSection {...baseProps({ businessUnitId: 'bu1' })} />);
    expect(businessUnitService.revealDbPassword).not.toHaveBeenCalled();
  });

  it('shows an error toast (not a thrown error) when the reveal fails', async () => {
    const user = userEvent.setup();
    vi.mocked(businessUnitService.revealDbPassword).mockRejectedValue({
      response: { data: { message: 'Forbidden' } },
    });
    render(<DatabaseConnectionSection {...baseProps({ businessUnitId: 'bu1' })} />);

    await user.click(screen.getByRole('button', { name: /reveal current password/i }));

    expect(await screen.findByRole('button', { name: /reveal current password/i })).not.toBeDisabled();
    expect(toast.error).toHaveBeenCalledWith('Forbidden');
  });

  it('has no reveal affordance for a new (unsaved) business unit even with cluster.update', () => {
    render(<DatabaseConnectionSection {...baseProps({ businessUnitId: undefined })} />);
    expect(screen.queryByRole('button', { name: /reveal current password/i })).not.toBeInTheDocument();
  });

  it('clears the revealed password once the section leaves edit mode', async () => {
    const user = userEvent.setup();
    vi.mocked(businessUnitService.revealDbPassword).mockResolvedValue({
      host: 'db.example.com',
      password: 'super-secret',
    });
    const props = baseProps({
      formData: {
        ...initialFormData,
        db_connection: [
          { key: 'host', value: 'db.example.com' },
          { key: 'password', value: '' },
        ],
      },
      businessUnitId: 'bu1',
    });
    const { rerender } = render(<DatabaseConnectionSection {...props} />);

    await user.click(screen.getByRole('button', { name: /reveal current password/i }));
    expect(await screen.findByText('super-secret')).toBeInTheDocument();

    // Leave edit mode, then come back — a reset-on-unmount would be indistinguishable
    // from this test, so the round-trip through the read-only branch is deliberate:
    // it proves the state itself was cleared, not just hidden by the branch.
    rerender(<DatabaseConnectionSection {...props} editing={false} />);
    rerender(<DatabaseConnectionSection {...props} editing={true} />);

    expect(screen.queryByText('super-secret')).not.toBeInTheDocument();
  });

  it('scopes the reveal gate to the business unit\'s own cluster (genuine per-cluster defense-in-depth)', () => {
    auth.hasPermission = (_perm: string, ctx?: { clusterId?: string }) => ctx?.clusterId === 'cluster-42';
    render(<DatabaseConnectionSection {...baseProps({
      businessUnitId: 'bu1',
      formData: { ...initialFormData, cluster_id: 'cluster-42', db_connection: [] },
    })} />);
    expect(screen.getByRole('button', { name: /reveal current password/i })).toBeInTheDocument();
  });

  it('does not grant the reveal when cluster.update is held for a different cluster', () => {
    auth.hasPermission = (_perm: string, ctx?: { clusterId?: string }) => ctx?.clusterId === 'cluster-other';
    render(<DatabaseConnectionSection {...baseProps({
      businessUnitId: 'bu1',
      formData: { ...initialFormData, cluster_id: 'cluster-42', db_connection: [] },
    })} />);
    expect(screen.queryByRole('button', { name: /reveal current password/i })).not.toBeInTheDocument();
  });

  // SECURITY REGRESSION (final review). `formData.cluster_id` can be empty/falsy for a
  // cluster-less BU. The old `<Can clusterId={formData.cluster_id}>` turned that into
  // `clusterId ? { clusterId } : undefined` -> `hasPermission(perm, undefined)`, which
  // falls through to checkPermission's broad "any cluster" branch — granting the reveal
  // off cluster.update held on ANY OTHER cluster. Must fail CLOSED via
  // UNRESOLVED_CLUSTER_ID (mirrors UserEdit.test.tsx's orphan-BU case / UserAccessTree.tsx).
  it('fails CLOSED on an empty cluster_id — cluster.update held on a different cluster must not grant the reveal', () => {
    // Mirrors real checkPermission's two branches: scoped to a real cluster id -> only
    // 'some-other-cluster' passes; NOT scoped (ctx undefined, what the old `<Can
    // clusterId={formData.cluster_id}>` produced for an empty cluster_id) -> broad "any
    // cluster" fallback -> true, since the admin holds cluster.update on
    // 'some-other-cluster'. A correct fix must never call hasPermission with ctx
    // undefined for this row.
    auth.hasPermission = (perm: string, ctx?: { clusterId?: string }) => {
      if (perm !== 'cluster.update') return false;
      if (ctx?.clusterId) return ctx.clusterId === 'some-other-cluster';
      return true;
    };
    render(<DatabaseConnectionSection {...baseProps({
      businessUnitId: 'bu1',
      formData: { ...initialFormData, cluster_id: '', db_connection: [] },
    })} />);
    expect(screen.queryByRole('button', { name: /reveal current password/i })).not.toBeInTheDocument();
  });
});
