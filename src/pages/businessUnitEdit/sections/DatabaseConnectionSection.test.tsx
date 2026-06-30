import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatabaseConnectionSection from './DatabaseConnectionSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

type DbProps = SectionFieldProps & {
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
