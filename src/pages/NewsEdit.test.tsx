import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NewsEdit from './NewsEdit';
import newsService from '../services/newsService';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

// Mutable auth so a test can revoke news.update. `Can` (the REAL component, not mocked
// here) reads this via useAuth() — mocking `Can` itself to always render its children
// would make the permission tests below vacuous, which is what hid the wave-2 holes.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));
// Mock heavy children that don't render cleanly in jsdom (CodeMirror / file input).
vi.mock('../components/MarkdownEditor', () => ({ MarkdownEditor: () => <div data-testid="md" /> }));
vi.mock('../components/ImageUpload', () => ({ ImageUpload: () => <div data-testid="img" /> }));
vi.mock('../components/BusinessUnitMultiSelect', () => ({ BusinessUnitMultiSelect: () => <div data-testid="bu" /> }));
vi.mock('../services/newsService', () => ({
  default: { getById: vi.fn(), getTags: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const mocked = newsService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  mocked.getTags.mockResolvedValue(['policy']);
  mocked.create.mockResolvedValue({ data: { id: 'n-new' } });
});

const renderNew = () =>
  render(
    <MemoryRouter initialEntries={['/news/new']}>
      <Routes>
        <Route path="/news/new" element={<NewsEdit />} />
        <Route path="/news/:id/edit" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('NewsEdit tags', () => {
  it('adds a typed tag and includes it in the create payload', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText(/headline/i), 'My news');
    const tagInput = screen.getByPlaceholderText('Add a tag...');
    await user.type(tagInput, 'urgent{Enter}');
    await user.click(screen.getByRole('button', { name: /create news/i }));
    await waitFor(() => expect(mocked.create).toHaveBeenCalled());
    const [payload] = mocked.create.mock.calls[0];
    expect(payload.tags).toEqual(['urgent']);
  });
});

// SECURITY. The lone gate on this page guards the Edit toggle (news.update) — the only
// way into edit mode for an existing article. It must FAIL if the gate is deleted.
describe('NewsEdit — edit toggle is gated on news.update', () => {
  const existing = {
    data: {
      id: 'n1',
      title: 'Existing headline',
      contents: 'body',
      status: 'draft',
      tags: ['policy'],
      business_unit_ids: [],
    },
  };

  const renderExisting = () =>
    render(
      <MemoryRouter initialEntries={['/news/n1/edit']}>
        <Routes>
          <Route path="/news/:id/edit" element={<NewsEdit />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    mocked.getById.mockResolvedValue(existing);
  });

  it('hides the Edit toggle without news.update', async () => {
    auth.hasPermission = () => false;
    renderExisting();

    // Positive anchor: the record really did load, so the negative below is meaningful.
    expect(await screen.findByRole('heading', { level: 1, name: 'Existing headline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  // Discriminating control — proves the negative above isn't passing on a bad selector,
  // and that the gate keys on news.update specifically rather than any truthy permission.
  it('shows the Edit toggle with news.update (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'news.update';
    renderExisting();

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('does not open on an unrelated permission', async () => {
    auth.hasPermission = (perm) => perm === 'news.read';
    renderExisting();

    expect(await screen.findByRole('heading', { level: 1, name: 'Existing headline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });
});
