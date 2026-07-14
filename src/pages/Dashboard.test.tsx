import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

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

const renderPage = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
