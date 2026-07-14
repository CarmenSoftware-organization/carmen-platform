import { describe, it, expect, vi, beforeEach } from 'vitest';
import currencyService from './currencyService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn() },
}));

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

describe('currencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getForBu fetches the tenant currencies endpoint sorted by code', async () => {
    const rows = [{ id: '1', code: 'USD', name: 'US Dollar', is_active: true }];
    mockApi.get.mockResolvedValue({ data: { data: rows } });
    const result = await currencyService.getForBu('T02');
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/config/T02/currencies?perpage=500&sort=code:asc',
    );
    expect(result).toEqual(rows);
  });

  it('getForBu tolerates a bare-array body', async () => {
    const rows = [{ id: '2', code: 'THB', name: 'Thai Baht' }];
    mockApi.get.mockResolvedValue({ data: rows });
    const result = await currencyService.getForBu('T02');
    expect(result).toEqual(rows);
  });

  it('getForBu returns [] when the body is not an array', async () => {
    mockApi.get.mockResolvedValue({ data: { data: { nope: true } } });
    const result = await currencyService.getForBu('T02');
    expect(result).toEqual([]);
  });
});
