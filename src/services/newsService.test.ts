import { describe, it, expect, vi, beforeEach } from 'vitest';
import newsService from './newsService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('newsService.getTags', () => {
  it('unwraps the { data } envelope into a string array', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: ['alpha', 'beta'] } });
    const tags = await newsService.getTags();
    expect(mockedApi.get).toHaveBeenCalledWith('/api/news/tags');
    expect(tags).toEqual(['alpha', 'beta']);
  });

  it('accepts a bare array response', async () => {
    mockedApi.get.mockResolvedValue({ data: ['x'] });
    const tags = await newsService.getTags();
    expect(tags).toEqual(['x']);
  });

  it('returns [] when the payload is not an array', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { not: 'an array' } } });
    const tags = await newsService.getTags();
    expect(tags).toEqual([]);
  });
});

describe('newsService.create tags encoding', () => {
  it('JSON-encodes tags in multipart form data', async () => {
    mockedApi.post.mockResolvedValue({ data: { id: 'n-1' } });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await newsService.create({ title: 'T', tags: ['a', 'b'] }, file);
    const fd = mockedApi.post.mock.calls[0][1] as FormData;
    expect(fd.get('tags')).toBe('["a","b"]');
  });

  it('forwards tags on the JSON (no-image) path', async () => {
    mockedApi.post.mockResolvedValue({ data: { id: 'n-1' } });
    await newsService.create({ title: 'T', tags: ['a'] });
    expect(mockedApi.post).toHaveBeenCalledWith('/api/news', { title: 'T', tags: ['a'] });
  });
});
