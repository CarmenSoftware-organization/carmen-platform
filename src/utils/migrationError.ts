import { toast } from 'sonner';
import { parseApiError } from './errorParser';
import type { TFunction } from '../i18n/types';

export const migrationStatusCode = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

/** Map a tenant-migration API error to the canonical toast. */
export const handleMigrationError = (err: unknown, t?: TFunction): void => {
  const code = migrationStatusCode(err);
  if (code === 403) {
    toast.error(t ? t('pages.tenantMigration.disabledOrSuperAdmin') : 'Migrations are disabled or require super-admin.');
  } else if (code === 409) {
    toast.warning(t ? t('pages.tenantMigration.alreadyRunning') : 'A migration is already running. Try again shortly.');
  } else {
    toast.error(parseApiError(err).message);
  }
};
