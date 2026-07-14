import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { summarizeNews, timeAgo, NewsroomSummary } from './NewsroomSummary';

describe('summarizeNews', () => {
  const list = [
    { id: 'a', status: 'draft' },
    { id: 'b', status: 'published', title: 'Older', published_at: '2026-07-01' },
    { id: 'c', status: 'published', title: 'Newest', published_at: '2026-07-10', business_unit_ids: ['x', 'y'] },
    { id: 'd', status: 'archived' },
    { id: 'e', status: 'published', title: 'Middle', published_at: '2026-07-05' },
  ];

  it('counts each pipeline stage', () => {
    const s = summarizeNews(list);
    expect(s.draft).toBe(1);
    expect(s.published).toBe(3);
    expect(s.archived).toBe(1);
    expect(s.total).toBe(5);
  });

  it('picks the most recently published article as the lead story', () => {
    const s = summarizeNews(list);
    expect(s.latest?.id).toBe('c');
    expect(s.latest?.title).toBe('Newest');
    expect(s.latest?.buCount).toBe(2);
  });

  it('treats a missing status as draft', () => {
    const s = summarizeNews([{ id: 'x' }, { id: 'y', status: 'published', published_at: '2026-01-01' }]);
    expect(s.draft).toBe(1);
    expect(s.published).toBe(1);
  });

  it('never counts a soft-deleted article', () => {
    const s = summarizeNews([...list, { id: 'z', status: 'published', published_at: '2026-12-31', deleted_at: '2026-07-02' }]);
    expect(s.published).toBe(3); // z excluded
    expect(s.latest?.id).toBe('c'); // z never becomes the lead
  });

  it('returns a null lead when nothing is published', () => {
    const s = summarizeNews([{ id: 'a', status: 'draft' }, { id: 'b', status: 'archived' }]);
    expect(s.latest).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-07-10T12:00:00Z');
  it('formats recent spans in words', () => {
    expect(timeAgo('2026-07-10T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-07-10T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-07-10T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-07-09T12:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-07-07T12:00:00Z', now)).toBe('3 days ago');
  });
  it('falls back to a date for older spans', () => {
    expect(timeAgo('2026-01-01T00:00:00Z', now)).toBe('2026-01-01');
  });
  it('handles a missing date', () => {
    expect(timeAgo(undefined, now)).toBe('—');
  });
});

describe('NewsroomSummary', () => {
  const summary = {
    total: 20,
    draft: 3,
    published: 12,
    archived: 5,
    latest: { id: 'c', title: 'New tax module is live', imageUrl: undefined, publishedAt: '2026-07-08', buCount: 0 },
  };

  const renderBand = (props = {}) =>
    render(
      <MemoryRouter>
        <NewsroomSummary summary={summary} loading={false} {...props} />
      </MemoryRouter>,
    );

  it('renders the lead headline and pipeline counts', () => {
    renderBand();
    expect(screen.getByText('New tax module is live')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/20 articles total/)).toBeInTheDocument();
  });

  it('labels a global lead story as Global', () => {
    renderBand();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('invites publishing when there is no lead story', () => {
    render(
      <MemoryRouter>
        <NewsroomSummary summary={{ ...summary, latest: null }} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nothing published yet')).toBeInTheDocument();
  });
});
