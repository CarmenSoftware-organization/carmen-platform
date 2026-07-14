import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every domain service so fetchActivity can be driven deterministically.
// Factories must be self-contained — vi.mock is hoisted above module scope.
vi.mock('../../services/clusterService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/businessUnitService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/userService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/applicationService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/newsService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/reportTemplateService', () => ({ default: { getAll: vi.fn() } }));

import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import userService from '../../services/userService';
import applicationService from '../../services/applicationService';
import newsService from '../../services/newsService';
import reportTemplateService from '../../services/reportTemplateService';
import {
  ACTIVITY_SOURCES,
  deriveVerb,
  toActivityItem,
  mergeAndSort,
  extractAt,
  unwrapList,
  unwrapTotal,
  fetchActivity,
  type ActivityItem,
} from './activity';

const clusters = ACTIVITY_SOURCES.find((s) => s.key === 'clusters')!;
const news = ACTIVITY_SOURCES.find((s) => s.key === 'news')!;

describe('deriveVerb', () => {
  it('is "created" when created_at equals updated_at', () => {
    expect(deriveVerb('clusters', { created_at: '2026-07-14T09:00:00Z', updated_at: '2026-07-14T09:00:00Z' })).toBe('created');
  });
  it('is "updated" when they differ', () => {
    expect(deriveVerb('clusters', { created_at: '2026-07-10T09:00:00Z', updated_at: '2026-07-14T09:00:00Z' })).toBe('updated');
  });
  it('is "published" for news in published status', () => {
    expect(deriveVerb('news', { status: 'published', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-14T00:00:00Z' })).toBe('published');
  });
});

describe('extractAt', () => {
  it('prefers updated_at, falls back to audit then created_at', () => {
    expect(extractAt({ updated_at: 'A', created_at: 'B' })).toBe('A');
    expect(extractAt({ audit: { updated: { at: 'C' } } })).toBe('C');
    expect(extractAt({ created_at: 'B' })).toBe('B');
    expect(extractAt({})).toBeUndefined();
  });
});

describe('toActivityItem', () => {
  it('builds an item with edit href, name and who', () => {
    const item = toActivityItem(clusters, {
      id: 'c1', name: 'Acme Group', updated_at: '2026-07-14T09:00:00Z',
      created_at: '2026-07-01T00:00:00Z', updated_by_name: 'M. Tan',
    });
    expect(item).toMatchObject({ id: 'c1', name: 'Acme Group', who: 'M. Tan', verb: 'updated', href: '/clusters/c1/edit' });
  });
  it('reads "who" from the nested audit shape (news)', () => {
    const item = toActivityItem(news, {
      id: 'n1', title: 'Q3 rollout', status: 'published',
      audit: { created: { at: '2026-07-01T00:00:00Z' }, updated: { at: '2026-07-14T09:00:00Z', name: 'A. Wong' } },
    });
    expect(item).toMatchObject({ name: 'Q3 rollout', verb: 'published', who: 'A. Wong', href: '/news/n1/edit' });
  });
  it('returns null when the record has no id or no timestamp', () => {
    expect(toActivityItem(clusters, { name: 'x', updated_at: '2026-07-14T09:00:00Z' })).toBeNull();
    expect(toActivityItem(clusters, { id: 'c1', name: 'x' })).toBeNull();
  });
});

describe('mergeAndSort', () => {
  const mk = (id: string, at: string): ActivityItem => ({
    id, at, domainKey: 'x', domainLabel: 'X', icon: clusters.icon, verb: 'updated', name: id, href: '#',
  });
  it('orders newest first and caps', () => {
    const out = mergeAndSort([mk('a', '2026-07-10T00:00:00Z'), mk('b', '2026-07-14T00:00:00Z'), mk('c', '2026-07-12T00:00:00Z')], 2);
    expect(out.map((i) => i.id)).toEqual(['b', 'c']);
  });
});

describe('unwrapList', () => {
  const rec = { id: 'x' };
  it('handles bare array, single and double envelopes', () => {
    expect(unwrapList([rec])).toEqual([rec]);
    expect(unwrapList({ data: [rec] })).toEqual([rec]);
    expect(unwrapList({ data: { data: [rec], paginate: { total: 1 } } })).toEqual([rec]);
  });
  it('returns [] when no array is found', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ data: { nope: true } })).toEqual([]);
  });
});

describe('unwrapTotal', () => {
  it('finds paginate.total at any depth, else total, else 0', () => {
    expect(unwrapTotal({ paginate: { total: 7 } })).toBe(7);
    expect(unwrapTotal({ data: { paginate: { total: 9 } } })).toBe(9);
    expect(unwrapTotal({ total: 4 })).toBe(4);
    expect(unwrapTotal({ data: [] })).toBe(0);
  });
});

describe('fetchActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const s of [businessUnitService, userService, applicationService, reportTemplateService]) {
      vi.mocked(s.getAll).mockResolvedValue({ data: [] });
    }
  });

  it('merges domains, sorts newest-first, and skips a failing domain', async () => {
    vi.mocked(clusterService.getAll).mockResolvedValue({
      data: [{ id: 'c1', code: 'AC', name: 'Acme', is_active: true, updated_at: '2026-07-14T08:00:00Z', created_at: '2026-07-14T08:00:00Z' }],
    });
    // News carries no flat updated_at — timestamps live under `audit`.
    vi.mocked(newsService.getAll).mockResolvedValue({
      data: [{ id: 'n1', title: 'Post', status: 'published', published_at: '2026-07-14T09:00:00Z', audit: { updated: { at: '2026-07-14T09:00:00Z' } } }],
    });
    vi.mocked(userService.getAll).mockRejectedValue(new Error('boom'));
    // report-templates comes back double-enveloped — must be unwrapped, not crash the merge.
    vi.mocked(reportTemplateService.getAll).mockResolvedValue(
      // @ts-expect-error deliberately simulating a nested { data: { data: [] } } envelope
      { data: { data: [{ id: 'r1', name: 'v_sales', updated_at: '2026-07-14T07:00:00Z', created_at: '2026-07-14T07:00:00Z' }], paginate: { total: 1 } } },
    );

    const items = await fetchActivity();
    expect(items.map((i) => i.id)).toEqual(['n1', 'c1', 'r1']); // newest→oldest; user domain skipped; nested r1 unwrapped
    expect(items[1]).toMatchObject({ verb: 'created', domainKey: 'clusters' });
  });
});
