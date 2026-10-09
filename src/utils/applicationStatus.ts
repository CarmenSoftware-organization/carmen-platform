import type { ApplicationStatus } from '../types';
import type { TKey } from '../i18n/types';

// Status vocabulary for applications (status modes). One module so the list, the edit page,
// the hero and the registry band cannot disagree about labels, colours or the fallback.

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ['running', 'maintenance', 'read_only', 'disabled'];

export const isApplicationStatus = (v: unknown): v is ApplicationStatus =>
  typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);

/**
 * The record's status. A backend that predates status modes sends only `is_active` —
 * `false` meant "switched off", which is what `disabled` means now.
 */
export const statusOf = (app: unknown): ApplicationStatus => {
  if (!app || typeof app !== 'object') return 'running';
  const { status, is_active } = app as { status?: unknown; is_active?: unknown };
  if (isApplicationStatus(status)) return status;
  return is_active === false ? 'disabled' : 'running';
};

export const STATUS_LABEL_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.status.running',
  maintenance: 'pages.applications.status.maintenance',
  read_only: 'pages.applications.status.read_only',
  disabled: 'pages.applications.status.disabled',
};

export const STATUS_HELP_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusHelp.running',
  maintenance: 'pages.applications.statusHelp.maintenance',
  read_only: 'pages.applications.statusHelp.read_only',
  disabled: 'pages.applications.statusHelp.disabled',
};

export const STATUS_CONFIRM_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusConfirm.running',
  maintenance: 'pages.applications.statusConfirm.maintenance',
  read_only: 'pages.applications.statusConfirm.read_only',
  disabled: 'pages.applications.statusConfirm.disabled',
};

export const STATUS_COUNT_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusCountLower.running',
  maintenance: 'pages.applications.statusCountLower.maintenance',
  read_only: 'pages.applications.statusCountLower.read_only',
  disabled: 'pages.applications.statusCountLower.disabled',
};

export const STATUS_BADGE_VARIANT: Record<ApplicationStatus, 'success' | 'warning' | 'info' | 'secondary'> = {
  running: 'success',
  maintenance: 'warning',
  read_only: 'info',
  disabled: 'secondary',
};

/**
 * True when `id` is the App ID this very page sends as `x-app-id`. Taking that app out of
 * `running` would lock the page out of the endpoint needed to switch it back — the gateway
 * refuses it (409 APP_SELF_LOCK) and the UI does not offer it.
 */
export const isOwnApp = (id?: string): boolean => {
  const own = import.meta.env.REACT_APP_API_APP_ID;
  return Boolean(id && own && id.toLowerCase() === String(own).toLowerCase());
};

/** 409 from `PATCH /status` refusing to take the caller's own app out of `running`. */
export const isSelfLockError = (err: unknown): boolean => {
  const e = err as {
    response?: { status?: number; data?: { code?: string; error?: string | { code?: string } } };
  };
  if (e?.response?.status !== 409) return false;
  const data = e.response?.data;
  const nested = typeof data?.error === 'object' && data.error !== null ? data.error.code : undefined;
  return nested === 'APP_SELF_LOCK' || data?.code === 'APP_SELF_LOCK';
};

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC ISO → the `YYYY-MM-DDTHH:mm` local wall-clock value a `datetime-local` input expects. */
export const toDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `datetime-local` value (local wall clock) → UTC ISO with `Z`; `undefined` when empty or invalid. */
export const fromDatetimeLocal = (local: string): string | undefined => {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Local, human display of `status_until`; '' when absent or invalid. */
export const formatStatusUntil = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};

/** True when the announced expected-back time has already gone by. */
export const isPastUntil = (iso?: string | null, now: Date = new Date()): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < now.getTime();
};
