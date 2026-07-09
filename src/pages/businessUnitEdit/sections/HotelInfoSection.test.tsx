import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HotelInfoSection from './HotelInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: {
    ...initialFormData,
    hotel_address_line1: '456 Beach Rd',
    hotel_postal_code: '10120',
    hotel_province: 'Phuket',
    hotel_longitude: '100.5330',
  },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('HotelInfoSection', () => {
  it('renders read-only address values when not editing', () => {
    render(<HotelInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('456 Beach Rd')).toBeInTheDocument();
    expect(screen.getByText('10120')).toBeInTheDocument();
    expect(screen.getByText('Phuket')).toBeInTheDocument();
    expect(screen.getByText('100.5330')).toBeInTheDocument();
  });

  it('renders inputs holding the new-field values when editing', () => {
    render(<HotelInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Address line 1')).toHaveValue('456 Beach Rd');
    expect(screen.getByPlaceholderText('Postal code')).toHaveValue('10120');
    expect(screen.getByPlaceholderText('Province')).toHaveValue('Phuket');
    expect(screen.getByPlaceholderText('Longitude')).toHaveValue('100.5330');
  });
});
