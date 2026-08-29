// Date helpers for the dashboard activity stream. There is no date library in
// this repo (see CLAUDE.md · DateTime) — keep these pure and locale-stable so
// they're trivially testable with an injected `now`.
//
// `relativeTime` takes an OPTIONAL trailing `t` (same shape as auditColumns.tsx) rather
// than calling useI18n() itself: this module is pure and has no React context. Without
// `t` it returns exactly the English literals it always has, which is what keeps
// relativeTime.test.ts passing unchanged and leaves dashboard/ActivityStream.tsx — the
// only other caller, on a page with no useI18n() yet — rendering as before.
//
// `dayGroup` got the same optional `t` in slice 10b, when its only caller — the dashboard
// activity stream — was itself translated. Until then it was deliberately left English:
// translating it earlier would have put Thai day headers on an otherwise English page.
//
// `formatClock` stays untranslated on purpose: 'HH:MM' in 24-hour form is identical in both
// languages, so there is nothing to translate and no locale to pick.
import type { TFunction } from '../i18n/types';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 'HH:MM' in 24-hour local time; '' when the input isn't a valid date. */
export function formatClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface DayGroup {
  key: string;
  label: string;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/**
 * Stable group key + human label for the day an event happened, relative to `now`.
 * Pass `t` to translate the label; the `key` never changes, so grouping is language-stable
 * (two rows on the same day stay one group even if the user switches language mid-render).
 */
export function dayGroup(iso?: string | null, now: Date = new Date(), t?: TFunction): DayGroup {
  const earlier = () => ({ key: 'unknown', label: t ? t('common.dayGroup.earlier') : 'Earlier' });
  if (!iso) return earlier();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return earlier();
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  let label: string;
  if (days <= 0) label = t ? t('common.dayGroup.today') : 'Today';
  else if (days === 1) label = t ? t('common.dayGroup.yesterday') : 'Yesterday';
  else if (days < 7) label = t ? t(`common.weekday.${WEEKDAY_KEYS[d.getDay()]}`) : WEEKDAYS[d.getDay()];
  else {
    label = t
      ? t('common.dayGroup.monthDay', {
          month: t(`common.monthShort.${MONTH_KEYS[d.getMonth()]}`),
          day: d.getDate(),
        })
      : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  return { key, label };
}

/** Coarse 'x ago' phrasing, for the row's title tooltip. Pass `t` to translate it. */
export function relativeTime(iso?: string | null, now: Date = new Date(), t?: TFunction): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return t ? t('common.timeAgo.justNow') : 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return t ? t('common.timeAgo.minutes', { count: m }) : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return t ? t('common.timeAgo.hours', { count: h }) : `${h}h ago`;
  const dd = Math.round(h / 24);
  if (dd < 30) return t ? t('common.timeAgo.days', { count: dd }) : `${dd}d ago`;
  const mo = Math.round(dd / 30);
  if (mo < 12) return t ? t('common.timeAgo.months', { count: mo }) : `${mo}mo ago`;
  const y = Math.round(mo / 12);
  return t ? t('common.timeAgo.years', { count: y }) : `${y}y ago`;
}
