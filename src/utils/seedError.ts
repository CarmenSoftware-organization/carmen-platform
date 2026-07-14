import { toast } from 'sonner';
import { parseApiError } from './errorParser';

/** Map a tenant-seed API error to a canonical toast. */
export const handleSeedError = (err: unknown): void => {
  const code = (err as { response?: { status?: number } })?.response?.status;
  if (code === 403) {
    toast.error('Seeding is disabled or requires super-admin.');
  } else {
    toast.error(parseApiError(err).message);
  }
};
