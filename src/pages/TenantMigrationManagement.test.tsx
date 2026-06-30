// src/pages/TenantMigrationManagement.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/KeyboardShortcuts', () => ({ useGlobalShortcuts: () => {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/businessUnitService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deployStream: vi.fn(), deployAllStream: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import TenantMigrationManagement from './TenantMigrationManagement';
import businessUnitService from '../services/businessUnitService';
import tenantMigrationService from '../services/tenantMigrationService';
import { useAuth } from '../context/AuthContext';

const BUS = [
  { id: 'b1', code: 'BU01', name: 'Hotel One', is_active: true },
  { id: 'b2', code: 'BU02', name: 'Hotel Two', is_active: true },
];

const renderPage = () => render(<MemoryRouter><TenantMigrationManagement /></MemoryRouter>);

describe('TenantMigrationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
    vi.mocked(businessUnitService.getAll).mockResolvedValue({ data: BUS } as never);
  });

  it('renders a row per BU with Unknown status and does NOT fetch status on load', async () => {
    renderPage();
    expect(await screen.findByText('BU01')).toBeInTheDocument();
    expect(screen.getByText('Hotel Two')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(2);
    expect(tenantMigrationService.getStatus).not.toHaveBeenCalled();
  });

  it('shows an Export button once BUs are loaded', async () => {
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
  });
});
