import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { handleSeedError } from './seedError';
import { toast } from 'sonner';

describe('handleSeedError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a super-admin message on 403', () => {
    handleSeedError({ response: { status: 403 } });
    expect(toast.error).toHaveBeenCalledWith('Seeding is disabled or requires super-admin.');
  });

  it('falls back to parseApiError message otherwise', () => {
    handleSeedError({ response: { status: 500, data: { message: 'kaboom' } } });
    expect(toast.error).toHaveBeenCalledWith('kaboom');
  });
});
