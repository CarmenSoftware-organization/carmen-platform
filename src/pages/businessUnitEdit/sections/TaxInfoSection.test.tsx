import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaxInfoSection from './TaxInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: { ...initialFormData, tax_no: 'TX-1', branch_no: 'BR-9' },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('TaxInfoSection', () => {
  it('renders read-only values (no inputs) when not editing', () => {
    render(<TaxInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('TX-1')).toBeInTheDocument();
    expect(screen.getByText('BR-9')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tax number')).not.toBeInTheDocument();
  });

  it('renders inputs holding the values when editing', () => {
    render(<TaxInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Tax number')).toHaveValue('TX-1');
    expect(screen.getByPlaceholderText('Branch number')).toHaveValue('BR-9');
  });

  it('calls onChange when typing in an input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaxInfoSection {...baseProps({ editing: true, onChange })} />);
    await user.type(screen.getByPlaceholderText('Tax number'), 'X');
    expect(onChange).toHaveBeenCalled();
  });
});
