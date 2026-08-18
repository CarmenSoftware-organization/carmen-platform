import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionInfoCard, type SubscriptionFormData } from './SubscriptionInfoCard';
import type { Cluster } from '../../types';

const formData: SubscriptionFormData = {
  cluster_id: 'c1',
  subscription_number: 'SUB-0001',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  status: 'active',
};

const clusters: Cluster[] = [
  { id: 'c1', code: 'CLS1', name: 'Acme Cluster', is_active: true },
  { id: 'c2', code: 'CLS2', name: 'Beta Cluster', is_active: true },
];

const base = (over: Record<string, unknown> = {}) => ({
  formData,
  fieldErrors: {},
  editing: false,
  isNew: false,
  clusters: [],
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('SubscriptionInfoCard — read-only mode', () => {
  it('renders every field as read-only text, not inputs', () => {
    render(<SubscriptionInfoCard {...base({ clusterLabel: 'Acme Cluster (CLS1)' })} />);
    expect(screen.getByText('Acme Cluster (CLS1)')).toBeInTheDocument();
    expect(screen.getByText('SUB-0001')).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-12-31')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows the backend-computed state next to status, without recomputing it', () => {
    render(
      <SubscriptionInfoCard
        {...base({ clusterLabel: 'Acme Cluster (CLS1)', state: 'expired' })}
      />,
    );
    // status itself (raw DB value) still reads 'active' — the badge...
    expect(screen.getByText('active')).toBeInTheDocument();
    // ...while the effective/computed state is shown alongside as 'expired'.
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('never shows the state helper for a brand-new (not yet created) subscription', () => {
    render(<SubscriptionInfoCard {...base({ isNew: true, state: undefined })} />);
    expect(screen.queryByText(/effective state/i)).toBeNull();
  });
});

describe('SubscriptionInfoCard — editing mode', () => {
  it('renders editable inputs and calls onChange/onBlur', async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionInfoCard {...base({ editing: true, onChange, onBlur })} />);

    const numberInput = screen.getByDisplayValue('SUB-0001');
    await user.click(numberInput);
    await user.tab();
    expect(onBlur).toHaveBeenCalled();

    const statusSelect = screen.getByDisplayValue('Active') as HTMLSelectElement;
    await user.selectOptions(statusSelect, 'inactive');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows a field error message under the offending field', () => {
    render(
      <SubscriptionInfoCard
        {...base({ editing: true, fieldErrors: { subscription_number: 'Subscription number is required' } })}
      />,
    );
    expect(screen.getByText('Subscription number is required')).toBeInTheDocument();
  });
});

describe('SubscriptionInfoCard — cluster field is create-only', () => {
  it('renders a cluster picker only when editing AND isNew', () => {
    render(<SubscriptionInfoCard {...base({ editing: true, isNew: true, clusters })} />);
    const select = screen.getByLabelText(/cluster/i) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'CLS1 - Acme Cluster' })).toBeInTheDocument();
  });

  it('keeps cluster read-only on an existing subscription even with edit permission', () => {
    render(
      <SubscriptionInfoCard
        {...base({ editing: true, isNew: false, clusters, clusterLabel: 'Acme Cluster (CLS1)' })}
      />,
    );
    expect(screen.getByText('Acme Cluster (CLS1)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/cluster/i)).toBeNull();
  });

  it('surfaces a cluster_id field error', () => {
    render(
      <SubscriptionInfoCard
        {...base({ editing: true, isNew: true, clusters, fieldErrors: { cluster_id: 'Cluster is required' } })}
      />,
    );
    expect(screen.getByText('Cluster is required')).toBeInTheDocument();
  });
});
