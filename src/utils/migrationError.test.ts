import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { handleMigrationError, migrationStatusCode } from './migrationError';
import { toast } from 'sonner';

describe('migrationError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('403 → super-admin error toast', () => {
    handleMigrationError({ response: { status: 403 } });
    expect(toast.error).toHaveBeenCalledWith('Migrations are disabled or require super-admin.');
  });

  it('409 → already-running warning toast', () => {
    handleMigrationError({ response: { status: 409 } });
    expect(toast.warning).toHaveBeenCalledWith('A migration is already running. Try again shortly.');
  });

  it('other status → error toast with a message', () => {
    handleMigrationError({ message: 'boom' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('migrationStatusCode reads response.status', () => {
    expect(migrationStatusCode({ response: { status: 500 } })).toBe(500);
    expect(migrationStatusCode({})).toBeUndefined();
  });
});
