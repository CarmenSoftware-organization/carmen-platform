import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeBus, BuSummary } from './BuSummary';

describe('summarizeBus', () => {
  const list = [
    { is_active: true, cluster_id: 'c1' },
    { is_active: true, cluster_id: 'c1' },
    { is_active: false, cluster_id: 'c2' },
    { is_active: true, cluster_name: 'Beta' },
  ];

  it('counts active / inactive and distinct clusters over the non-deleted list', () => {
    const s = summarizeBus(list, 4);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.inactive).toBe(1);
    expect(s.clusters).toBe(3); // c1, c2, Beta
    expect(s.archived).toBe(4);
  });

  it('never counts a soft-deleted row that slips into the list', () => {
    const s = summarizeBus([...list, { is_active: true, deleted_at: '2026-01-01', cluster_id: 'c9' }]);
    expect(s.total).toBe(4);
    expect(s.clusters).toBe(3);
  });
});

describe('BuSummary', () => {
  it('renders the total, cluster spread and status split', () => {
    render(<BuSummary summary={{ total: 97, active: 84, inactive: 13, archived: 4, clusters: 10 }} loading={false} />);
    expect(screen.getByText('97')).toBeInTheDocument();
    expect(screen.getByText(/across 10 clusters/)).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('hides the archived legend when there are none', () => {
    render(<BuSummary summary={{ total: 5, active: 5, inactive: 0, archived: 0, clusters: 1 }} loading={false} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });
});
