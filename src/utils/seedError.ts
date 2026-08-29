import { toast } from 'sonner';
import { parseApiError } from './errorParser';
import type { TFunction } from '../i18n/types';

/** Map a tenant-seed API error to a canonical toast. */
export const handleSeedError = (err: unknown, t?: TFunction): void => {
  const code = (err as { response?: { status?: number } })?.response?.status;
  if (code === 403) {
    toast.error(t ? t('pages.tenantMigration.seedDisabledOrSuperAdmin') : 'Seeding is disabled or requires super-admin.');
  } else {
    toast.error(parseApiError(err).message);
  }
};
