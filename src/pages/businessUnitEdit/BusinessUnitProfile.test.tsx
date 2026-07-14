import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitProfile from './BusinessUnitProfile';
import { initialFormData } from './types';

const formData = {
  ...initialFormData,
  code: 'ACME-TH',
  name: 'Acme Thailand',
  alias_name: 'ATH',
  is_active: true,
  hotel_address_line1: '123 Sukhumvit Rd',
  hotel_city: 'Bangkok',
  hotel_country: 'Thailand',
  hotel_tel: '+66 2 123 4567',
  tax_no: '0105558012345',
  timezone: 'Asia/Bangkok',
  max_license_users: '50',
};

const base = {
  formData,
  clusterName: 'Acme Hotels',
  currency: { id: 'x', code: 'THB', name: 'Thai Baht', symbol: '฿' },
  userCount: 42,
  meta: { created_at: '2025-02-14T00:00:00Z', created_by_name: 'A. Wong' },
  onNavigate: vi.fn(),
};

describe('BusinessUnitProfile', () => {
  it('leads with the BU name, code and parent cluster', () => {
    render(<BusinessUnitProfile {...base} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Thailand' })).toBeInTheDocument();
    expect(screen.getByText('ACME-TH', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Acme Hotels')).toBeInTheDocument();
  });

  it('shows real facts and marks empty ones "Not set"', () => {
    render(<BusinessUnitProfile {...base} />);
    expect(screen.getByText(/THB — Thai Baht/)).toBeInTheDocument();
    expect(screen.getByText('0105558012345')).toBeInTheDocument();
    expect(screen.getByText('42 of 50 licensed')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument(); // db_connection empty
    // Company not set
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
  });

  it('jumps to a section via the per-group Edit link', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<BusinessUnitProfile {...base} onNavigate={onNavigate} />);
    const editLinks = screen.getAllByRole('button', { name: 'Edit →' });
    await user.click(editLinks[0]); // Location → address
    expect(onNavigate).toHaveBeenCalledWith('address');
  });

  it('renders the provided edit action', () => {
    render(<BusinessUnitProfile {...base} editAction={<button type="button">Edit details</button>} />);
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });
});
