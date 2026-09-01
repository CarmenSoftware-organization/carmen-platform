import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionInfoCard, type SubscriptionFormData } from './SubscriptionInfoCard';

const formData: SubscriptionFormData = {
  cluster_id: 'c1',
  business_unit_id: 'b1',
  subscription_number: 'SUB-2608-0001',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  status: 'active',
};

const base = (over: Record<string, unknown> = {}) => ({
  formData,
  fieldErrors: {},
  editing: false,
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('SubscriptionInfoCard — read-only mode', () => {
  it('renders the period as read-only text, not inputs', () => {
    render(<SubscriptionInfoCard {...base()} />);
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-12-31')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('SubscriptionInfoCard — editing mode', () => {
  it('renders editable inputs and calls onChange/onBlur', async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionInfoCard {...base({ editing: true, onChange, onBlur })} />);

    const startInput = screen.getByLabelText(/start date/i);
    await user.click(startInput);
    await user.tab();
    expect(onBlur).toHaveBeenCalled();

    const statusSelect = screen.getByDisplayValue('Active') as HTMLSelectElement;
    await user.selectOptions(statusSelect, 'inactive');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows a field error message under the offending field', () => {
    render(
      <SubscriptionInfoCard
        {...base({ editing: true, fieldErrors: { end_date: 'End date must be after start date' } })}
      />,
    );
    expect(screen.getByText('End date must be after start date')).toBeInTheDocument();
  });
});

/**
 * ตัวตนของสัญญาย้ายขึ้น `IssuedSubscriptionPlate` แล้ว การ์ดนี้จึงต้อง **ไม่** วาดมันซ้ำเป็นกล่อง
 * มีขอบ — นั่นคือทั้งหมดที่การออกแบบรอบนี้แก้ ถ้าช่องเหล่านี้กลับมาแปลว่าหน้าถอยกลับไปที่เดิม
 */
describe('SubscriptionInfoCard — identity belongs to the plate, not this card', () => {
  it('never renders cluster, business unit, or subscription number', () => {
    render(<SubscriptionInfoCard {...base({ editing: true })} />);
    expect(screen.queryByText('SUB-2608-0001')).toBeNull();
    expect(screen.queryByLabelText(/cluster/i)).toBeNull();
    expect(screen.queryByLabelText(/business unit/i)).toBeNull();
  });

  it('does not repeat the effective state beside status', () => {
    render(<SubscriptionInfoCard {...base()} />);
    expect(screen.queryByText(/effective state/i)).toBeNull();
  });
});
