import { getErrorCode } from './errorParser';

// App secret vocabulary (x-app-secret). One module so the card, the interceptor and the hero
// cannot disagree about the stub, the codes or the re-mask time.

export const SECRET_PREFIX = 'cas_';
/** Base62 characters after the prefix — the stub is drawn to the same 44-char length. */
export const SECRET_BODY_LENGTH = 40;
/** A revealed secret masks itself again after this long. */
export const REMASK_MS = 30_000;

export const APP_SECRET_ERROR = {
  MISSING: 'APP_SECRET_MISSING',
  SELF_LOCK: 'APP_SECRET_SELF_LOCK',
  KEY_UNAVAILABLE: 'APP_SECRET_KEY_UNAVAILABLE',
  INVALID: 'APP_SECRET_INVALID',
} as const;

export type AppSecretErrorCode = (typeof APP_SECRET_ERROR)[keyof typeof APP_SECRET_ERROR];

const CODES: readonly string[] = Object.values(APP_SECRET_ERROR);

/** The app-secret error code on a failed request, if it is one of ours. */
export const secretErrorCode = (err: unknown): AppSecretErrorCode | undefined => {
  const code = getErrorCode(err);
  return code && CODES.includes(code) ? (code as AppSecretErrorCode) : undefined;
};

/**
 * The key stub: `cas_` + dots + last4, exactly as long as the real secret so revealing swaps
 * text in place. last4 is never hidden — it is how an admin tells which secret a client holds.
 */
export const maskedSecret = (last4?: string | null): string => {
  const tail = (last4 ?? '').slice(-4);
  return SECRET_PREFIX + '•'.repeat(SECRET_BODY_LENGTH - tail.length) + tail;
};
