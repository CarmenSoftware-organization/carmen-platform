import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

// Mutable auth so a test can grant/revoke database_pool.read. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself to
// always render its children would make the permission-gate test below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../../services/databasePoolService', () => ({
  default: { getAll: vi.fn() },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import DatabaseConnectionSection from './DatabaseConnectionSection';
import databasePoolService from '../../../services/databasePoolService';

type Props = SectionFieldProps & {
  onPoolChange: (field: 'database_pool_id' | 'db_schema', value: string) => void;
};

const pools = [
  { id: 'p1', name: 'tenant-db-sg-01', host: 'h', port: 5432, database: 'd', username: 'u', is_active: true },
];

const baseProps = (over: Partial<Props> = {}): Props => ({
  formData: {
    ...initialFormData,
    database_pool_id: 'p1',
    db_schema: 'cbr_prod',
    database_pool_name: 'tenant-db-sg-01',
  },
  editing: true,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  onPoolChange: vi.fn(),
  ...over,
});

describe('DatabaseConnectionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(databasePoolService.getAll).mockResolvedValue({ data: pools });
    auth.hasPermission = () => true;
  });

  it('shows the pool name and schema in read mode without calling databasePoolService.getAll', () => {
    render(<DatabaseConnectionSection {...baseProps({ editing: false })} />);

    expect(screen.getByText('tenant-db-sg-01')).toBeInTheDocument();
    expect(screen.getByText('cbr_prod')).toBeInTheDocument();
    expect(databasePoolService.getAll).not.toHaveBeenCalled();
  });

  it('calls getAll on entering edit mode and renders options from the result', async () => {
    render(<DatabaseConnectionSection {...baseProps({ editing: true })} />);

    expect(databasePoolService.getAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('option', { name: 'tenant-db-sg-01' })).toBeInTheDocument();
  });

  it('shows a read-only view when the user lacks database_pool.read, without ever calling getAll', async () => {
    auth.hasPermission = (perm: string) => perm !== 'database_pool.read';
    render(<DatabaseConnectionSection {...baseProps({ editing: true })} />);
    expect(screen.queryByLabelText('Database Pool')).not.toBeInTheDocument();
    expect(screen.getByText(/platform-level permission/i)).toBeInTheDocument();
    // The fetch lives in a child only mounted inside <Can>, so a user who fails the
    // gate must never issue the request — that request would 403 and toast even
    // though the fallback view above renders correctly.
    expect(databasePoolService.getAll).not.toHaveBeenCalled();
  });

  it('calls onPoolChange when the pool select changes', async () => {
    const user = userEvent.setup();
    const onPoolChange = vi.fn();
    const twoPools = [
      ...pools,
      { id: 'p2', name: 'tenant-db-sg-02', host: 'h', port: 5432, database: 'd', username: 'u', is_active: true },
    ];
    vi.mocked(databasePoolService.getAll).mockResolvedValue({ data: twoPools });
    render(<DatabaseConnectionSection {...baseProps({ editing: true, onPoolChange })} />);

    const select = await screen.findByLabelText('Database Pool');
    await user.selectOptions(select, 'p2');

    expect(onPoolChange).toHaveBeenCalledWith('database_pool_id', 'p2');
  });

  it('keeps a bound-but-inactive pool in the options, labelled (inactive)', async () => {
    const inactivePool = { id: 'p9', name: 'legacy-pool', host: 'h', port: 5432, database: 'd', username: 'u', is_active: false };
    vi.mocked(databasePoolService.getAll).mockResolvedValue({ data: [inactivePool] });
    render(<DatabaseConnectionSection {...baseProps({
      editing: true,
      formData: { ...initialFormData, database_pool_id: 'p9', db_schema: 'x', database_pool_name: 'legacy-pool' },
    })} />);

    expect(await screen.findByRole('option', { name: 'legacy-pool (inactive)' })).toBeInTheDocument();
  });
});
