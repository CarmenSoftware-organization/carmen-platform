// Date helpers for the dashboard activity stream. There is no date library in
// this repo (see CLAUDE.md · DateTime) — keep these pure and locale-stable so
// they're trivially testable with an injected `now`.

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

/** Stable group key + human label for the day an event happened, relative to `now`. */
export function dayGroup(iso?: string | null, now: Date = new Date()): DayGroup {
  if (!iso) return { key: 'unknown', label: 'Earlier' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Earlier' };
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  let label: string;
  if (days <= 0) label = 'Today';
  else if (days === 1) label = 'Yesterday';
  else if (days < 7) label = WEEKDAYS[d.getDay()];
  else label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return { key, label };
}

/** Coarse 'x ago' phrasing, for the row's title tooltip. */
export function relativeTime(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.round(h / 24);
  if (dd < 30) return `${dd}d ago`;
  const mo = Math.round(dd / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
