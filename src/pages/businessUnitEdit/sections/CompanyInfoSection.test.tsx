import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyInfoSection from './CompanyInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: {
    ...initialFormData,
    company_address_line1: '123 Riverside Rd',
    company_postal_code: '10500',
    company_city: 'Bangkok',
    company_latitude: '13.7248',
  },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('CompanyInfoSection', () => {
  it('renders read-only address values when not editing', () => {
    render(<CompanyInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('123 Riverside Rd')).toBeInTheDocument();
    expect(screen.getByText('10500')).toBeInTheDocument();
    expect(screen.getByText('Bangkok')).toBeInTheDocument();
    expect(screen.getByText('13.7248')).toBeInTheDocument();
  });

  it('renders inputs holding the new-field values when editing', () => {
    render(<CompanyInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Address line 1')).toHaveValue('123 Riverside Rd');
    expect(screen.getByPlaceholderText('Postal code')).toHaveValue('10500');
    expect(screen.getByPlaceholderText('City')).toHaveValue('Bangkok');
    expect(screen.getByPlaceholderText('Latitude')).toHaveValue('13.7248');
  });

  it('calls onChange when typing in an address input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CompanyInfoSection {...baseProps({ editing: true, onChange })} />);
    await user.type(screen.getByPlaceholderText('Province'), 'X');
    expect(onChange).toHaveBeenCalled();
  });
});
