import { APP_SECRET_ERROR, secretErrorCode } from '../utils/applicationSecret';

// How this build identifies itself to the gateway beyond `x-app-id`. Every request path spreads
// `appSecretHeader()`: the axios instance (api.ts), the bare-axios refresh call (tokenRefresh.ts)
// and the four fetch() streamers. Must not import ./api — tokenRefresh.ts imports this module.

const secret = (): string => String(import.meta.env.REACT_APP_API_APP_SECRET ?? '').trim();

/** `{ 'x-app-secret': … }` when the build has a secret, `{}` otherwise — never an empty header. */
export const appSecretHeader = (): { 'x-app-secret'?: string } => {
  const s = secret();
  return s ? { 'x-app-secret': s } : {};
};

/** True when this build sends a secret at all (the gateway still decides whether it is valid). */
export const hasAppSecret = (): boolean => secret() !== '';

/** 401 from the gateway's secret check — this build's secret is missing, wrong or out of date. */
export const isAppSecretInvalid = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 401 &&
  secretErrorCode(err) === APP_SECRET_ERROR.INVALID;
