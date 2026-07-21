import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterfaceEntitlementCard from './InterfaceEntitlementCard';
import interfaceEntitlementService from '../services/interfaceEntitlementService';

vi.mock('../services/interfaceEntitlementService', () => ({
  default: {
    getByBuCode: vi.fn(),
    setByBuCode: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockService = vi.mocked(interfaceEntitlementService);

describe('InterfaceEntitlementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gates on super-admin and does not fetch when not a super-admin', () => {
    render(<InterfaceEntitlementCard buCode="BU01" isSuperAdmin={false} />);
    expect(screen.getByText('Super-admin required.')).toBeInTheDocument();
    expect(mockService.getByBuCode).not.toHaveBeenCalled();
  });

  it('loads the entitlement and reflects it in the checkboxes', async () => {
    mockService.getByBuCode.mockResolvedValue(['pos_micros']);
    render(<InterfaceEntitlementCard buCode="BU01" isSuperAdmin />);

    const micros = await screen.findByLabelText('Oracle Micros');
    expect(micros).toBeChecked();
    expect(screen.getByLabelText('Square')).not.toBeChecked();
    // not dirty on load → Save disabled
    expect(screen.getByRole('button', { name: /Save entitlement/i })).toBeDisabled();
  });

  it('saves the updated selection when a brand is toggled', async () => {
    mockService.getByBuCode.mockResolvedValue(['pos_micros']);
    mockService.setByBuCode.mockResolvedValue(['pos_micros', 'pos_square']);
    const user = userEvent.setup();
    render(<InterfaceEntitlementCard buCode="BU01" isSuperAdmin />);

    const square = await screen.findByLabelText('Square');
    await user.click(square);

    const saveButton = screen.getByRole('button', { name: /Save entitlement/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() =>
      expect(mockService.setByBuCode).toHaveBeenCalledWith('BU01', [
        'pos_micros',
        'pos_square',
      ]),
    );
  });
});
