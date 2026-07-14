import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NewsEdit from './NewsEdit';
import newsService from '../services/newsService';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/Can', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
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
