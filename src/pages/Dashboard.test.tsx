import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import applicationService from '../services/applicationService';
import newsService from '../services/newsService';
import reportTemplateService from '../services/reportTemplateService';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Each service's getAll serves both the counts loader (reads paginate.total) and
// the activity fetch (reads .data). Factories are fully self-contained — vi.mock
// is hoisted above module scope, so they can't reference outer variables.
vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'c1', name: 'Acme Cluster', updated_at: '2026-07-14T09:00:00Z', created_at: '2026-07-01T00:00:00Z', updated_by_name: 'M. Tan' }], paginate: { total: 3 } }) },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'b1', name: 'Acme Thailand', code: 'ACME-TH', updated_at: '2026-07-13T09:00:00Z', created_at: '2026-07-13T09:00:00Z' }], paginate: { total: 3 } }) },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'u1', name: 'j.lee', email: 'j@a.co', updated_at: '2026-07-12T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } }) },
}));
vi.mock('../services/applicationService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'a1', name: 'Mobile POS', updated_at: '2026-07-11T09:00:00Z', created_at: '2026-07-11T09:00:00Z' }], paginate: { total: 3 } }) },
}));
vi.mock('../services/newsService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'n1', title: 'Q3 rollout', status: 'published', updated_at: '2026-07-10T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } }) },
}));
vi.mock('../services/reportTemplateService', () => ({
  default: { getAll: vi.fn().mockResolvedValue({ data: [{ id: 'r1', name: 'v_sales', updated_at: '2026-07-09T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } }) },
}));

// Default resolved values, re-applied in beforeEach so a test that overrides one
// service's mock (e.g. to simulate a fetch failure) can't leak into later tests —
// vi.clearAllMocks() clears call history but not previously-set implementations.
const CLUSTER_OK = { data: [{ id: 'c1', name: 'Acme Cluster', updated_at: '2026-07-14T09:00:00Z', created_at: '2026-07-01T00:00:00Z', updated_by_name: 'M. Tan' }], paginate: { total: 3 } };
const BU_OK = { data: [{ id: 'b1', name: 'Acme Thailand', code: 'ACME-TH', updated_at: '2026-07-13T09:00:00Z', created_at: '2026-07-13T09:00:00Z' }], paginate: { total: 3 } };
const USER_OK = { data: [{ id: 'u1', name: 'j.lee', email: 'j@a.co', updated_at: '2026-07-12T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } };
const APP_OK = { data: [{ id: 'a1', name: 'Mobile POS', updated_at: '2026-07-11T09:00:00Z', created_at: '2026-07-11T09:00:00Z' }], paginate: { total: 3 } };
const NEWS_OK = { data: [{ id: 'n1', title: 'Q3 rollout', status: 'published', updated_at: '2026-07-10T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } };
const REPORT_OK = { data: [{ id: 'r1', name: 'v_sales', updated_at: '2026-07-09T09:00:00Z', created_at: '2026-07-01T00:00:00Z' }], paginate: { total: 3 } };

// Test fixtures are intentionally partial (only the fields the dashboard reads),
// so mocks are cast through `ReturnType<typeof vi.fn>` rather than typed against
// each service's real (much stricter) response shape — same pattern as
// ClusterEdit.test.tsx's `asMock`.
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const renderPage = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(clusterService.getAll).mockResolvedValue(CLUSTER_OK);
    asMock(businessUnitService.getAll).mockResolvedValue(BU_OK);
    asMock(userService.getAll).mockResolvedValue(USER_OK);
    asMock(applicationService.getAll).mockResolvedValue(APP_OK);
    asMock(newsService.getAll).mockResolvedValue(NEWS_OK);
    asMock(reportTemplateService.getAll).mockResolvedValue(REPORT_OK);
  });

  it('renders the recent-activity stream across domains', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Acme Cluster')).toBeInTheDocument();
    expect(await screen.findByText('Q3 rollout')).toBeInTheDocument();
    // verbs derived from timestamps: created (created_at === updated_at) + published (news)
    expect(screen.getAllByText('created').length).toBeGreaterThan(0);
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('links an activity row to that record’s edit page', async () => {
    renderPage();
    const link = (await screen.findByText('Acme Cluster')).closest('a');
    expect(link).toHaveAttribute('href', '/clusters/c1/edit');
  });

  it('shows the counts rail with governed total and per-domain counts', async () => {
    renderPage();
    expect(await screen.findByText('records governed')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument()); // 6 domains × total 3
  });

  it('filters the stream by domain', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Cluster');
    await user.click(screen.getByRole('button', { name: /^News/ }));
    expect(screen.getByText('Q3 rollout')).toBeInTheDocument();
    expect(screen.queryByText('Acme Cluster')).not.toBeInTheDocument();
  });

  it('surfaces an error with retry when a counts fetch fails (P0)', async () => {
    // Fails one of the six domain fetches feeding CountsRail. Before the fix, the
    // per-domain catch in Dashboard.tsx's load() was empty — the rail would sit
    // silently at "—" forever with no alert and no way to recover.
    asMock(clusterService.getAll).mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
  });

  it('clears the counts error on a successful retry', async () => {
    const user = userEvent.setup();
    asMock(clusterService.getAll).mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const retry = await screen.findByRole('button', { name: /retry|try again/i });
    asMock(clusterService.getAll).mockResolvedValue(CLUSTER_OK);
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    // All 6 domains healthy again → full governed total (6 × 3), proving recovery
    // isn't just "error cleared" but the clusters domain's real data came back.
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
  });

  it('renders activity verbs as a Badge, not a raw hand-rolled span', async () => {
    renderPage();
    const verbEl = (await screen.findAllByText('created'))[0];
    // Badge renders as a styled <div>, not the old <span className={cn(...verb.text)}>.
    expect(verbEl.tagName).toBe('DIV');
    expect(verbEl.className).toMatch(/rounded-md/);
  });

  it('shows a status region while activity is loading', () => {
    renderPage();
    expect(screen.getByRole('status', { name: /loading activity/i })).toBeInTheDocument();
  });
});
