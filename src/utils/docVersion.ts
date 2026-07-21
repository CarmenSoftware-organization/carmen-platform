import { toast } from 'sonner';

// Optimistic-locking helpers for doc_version. The backend (carmen-turborepo-backend-v2)
// guards updates with a numeric doc_version and returns HTTP 409 (code DOC_VERSION_CONFLICT,
// message "Record was modified by another request …") when a stale version is sent.

/** Pull the optimistic-lock token off a loaded record, if the backend returned one. */
export const getDocVersion = (record: unknown): number | undefined => {
  if (record && typeof record === 'object' && 'doc_version' in record) {
    const v = (record as { doc_version?: unknown }).doc_version;
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
};

/**
 * True when an update failed because the record was changed by someone else.
 * Requires HTTP 409 AND a lock signal, so a name-collision 409 (e.g. ROLE_NAME_ALREADY_EXISTS)
 * is not misread as a version conflict.
 *
 * NOTE: the backend's TryCatch maps OptimisticLockError to ErrorCode.ALREADY_EXISTS, so the
 * response `code` may surface as ALREADY_EXISTS rather than DOC_VERSION_CONFLICT. The message
 * match is therefore load-bearing — the backend preserves the original "Record was modified by
 * another request …" text. Keep the message check; do not "simplify" it to the code check alone.
 */
export const isVersionConflict = (err: unknown): boolean => {
  const e = err as {
    response?: { status?: number; data?: { message?: string; code?: string } };
  };
  if (e?.response?.status !== 409) return false;
  const code = e.response?.data?.code;
  const msg = e.response?.data?.message ?? '';
  return code === 'DOC_VERSION_CONFLICT' || /modified by another request|doc_version/i.test(msg);
};

/** Canonical conflict toast. The caller refetches the record after calling this. */
export const notifyVersionConflict = (): void => {
  toast.error('This record was changed by someone else', {
    description: 'Reloading the latest version. Please re-apply your changes.',
  });
};
