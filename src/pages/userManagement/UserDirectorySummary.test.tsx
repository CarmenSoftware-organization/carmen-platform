import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeUsers, UserDirectorySummary, FACE_LIMIT } from './UserDirectorySummary';

describe('summarizeUsers', () => {
  const list = [
    { id: 'u1', is_active: true, firstname: 'Ana', lastname: 'Lopez', created_at: '2026-01-04', business_unit: [{ id: 'b1' }, { id: 'b2' }] },
    { id: 'u2', is_active: true, name: 'Ben', created_at: '2026-01-02', business_unit: [{ id: 'b1' }] },
    { id: 'u3', is_active: false, username: 'carl', created_at: '2026-01-03', business_unit: [{ id: 'b3' }] },
  ];

  it('counts active / inactive and distinct business units over the non-deleted list', () => {
    const s = summarizeUsers(list, 4);
    expect(s.total).toBe(3);
    expect(s.active).toBe(2);
    expect(s.inactive).toBe(1);
    expect(s.businessUnits).toBe(3); // b1, b2, b3
    expect(s.archived).toBe(4);
  });

  it('never counts a soft-deleted row that slips into the list', () => {
    const s = summarizeUsers([...list, { id: 'u9', is_active: true, deleted_at: '2026-01-01', business_unit: [{ id: 'b9' }] }]);
    expect(s.total).toBe(3);
    expect(s.businessUnits).toBe(3); // b9 excluded
  });

  it('reads audit fallbacks for deleted + created dates', () => {
    const s = summarizeUsers([
      { id: 'a', is_active: true, name: 'New', audit: { created: { at: '2026-02-09' } } },
      { id: 'z', is_active: true, name: 'Gone', audit: { deleted: { at: '2026-02-01' } } },
    ]);
    expect(s.total).toBe(1);
    expect(s.faces[0]?.id).toBe('a');
  });

  it('orders faces newest-first and caps them at FACE_LIMIT', () => {
    const many = Array.from({ length: FACE_LIMIT + 3 }, (_, i) => ({
      id: `u${i}`,
      is_active: true,
      name: `User ${i}`,
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const s = summarizeUsers(many);
    expect(s.faces).toHaveLength(FACE_LIMIT);
    expect(s.faces[0].id).toBe(`u${FACE_LIMIT + 2}`); // highest date first
  });

  it('derives initials from name parts, then falls back to a single field', () => {
    const s = summarizeUsers([
      { id: 'p', is_active: true, firstname: 'Grace', lastname: 'Hopper', created_at: '2026-01-05' },
      { id: 'q', is_active: true, username: 'admin', created_at: '2026-01-01' },
    ]);
    const byId = Object.fromEntries(s.faces.map((f) => [f.id, f]));
    expect(byId.p.initials).toBe('GH');
    expect(byId.q.initials).toBe('AD');
  });
});

describe('UserDirectorySummary', () => {
  const summary = {
    total: 128,
    active: 96,
    inactive: 32,
    archived: 5,
    businessUnits: 8,
    faces: [
      { id: 'f1', initials: 'AL', label: 'Ana Lopez' },
      { id: 'f2', initials: 'BN', label: 'Ben North' },
    ],
  };

  it('renders the population and status split', () => {
    render(<UserDirectorySummary summary={summary} loading={false} />);
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows a "+N more" pill for members beyond the faces shown', () => {
    render(<UserDirectorySummary summary={summary} loading={false} />);
    expect(screen.getByText('+126')).toBeInTheDocument(); // 128 total − 2 faces
  });

  it('hides the archived legend when there are none', () => {
    render(<UserDirectorySummary summary={{ ...summary, archived: 0 }} loading={false} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });
});
