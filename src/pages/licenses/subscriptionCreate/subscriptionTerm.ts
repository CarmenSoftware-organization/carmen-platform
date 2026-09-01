/**
 * Calendar arithmetic for a contract's term, done on the same plain `'YYYY-MM-DD'` strings the
 * form holds — never through a local `Date`.
 *
 * This is the same rule `SubscriptionForm.tsx`'s `toYmd`/`fromYmd` pair documents at length:
 * `start_date`/`end_date` are calendar boundaries, not instants, and a round-trip through the
 * browser's local midnight is a full-day error in any timezone ahead of UTC. Everything below
 * therefore parses to plain integers and, where a real day count is needed, does the addition in
 * `Date.UTC` — where every day is exactly 86400000ms and no DST shift exists to lose an hour to.
 */

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

const parse = (v: string): Ymd | null => {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return hit ? { y: +hit[1], m: +hit[2], d: +hit[3] } : null;
};

const toUtcMs = ({ y, m, d }: Ymd): number => Date.UTC(y, m - 1, d);

const fromUtcMs = (ms: number): Ymd => {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};

const format = ({ y, m, d }: Ymd): string => `${y}-${pad(m)}-${pad(d)}`;

/** Days in a 1-based month. `m = 0` rolls back to December of the previous year, as callers below rely on. */
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Today as `'YYYY-MM-DD'` in the user's own timezone — the date they would pick off a calendar.
 *
 * Local parts on purpose, unlike everything else in this file: "today" is a wall-clock fact about
 * where the user is sitting, not a UTC instant. In Bangkok at 01:00 the UTC date is still
 * yesterday, and a form that opens on yesterday's date is wrong in the way a user notices.
 */
export const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * The last day of a month, as `'YYYY-MM-DD'`. `month` is 1-based and is allowed to run past 12,
 * which rolls into the following year — that is how the 13th and 14th options below are built.
 */
export const endOfMonth = (year: number, month: number): string =>
  format(fromUtcMs(Date.UTC(year, month, 0)));

export interface MonthEndOption {
  /** 1-based, and may exceed 12: 13 is January of `year + 1`. */
  month: number;
  /** The calendar year the option actually lands in, after any roll-over. */
  year: number;
  /** The end date itself, ready to drop into the form. */
  date: string;
}

/**
 * The fourteen month-ends a contract is normally written to: every month of `year`, then January
 * and February of the year after.
 *
 * Contracts here end on a month boundary rather than on an anniversary, so the end date is picked
 * from a calendar of month-ends, not computed from a length. The two extra months exist because a
 * term started late in the year is routinely written into the next one, and having to type
 * `2027-01-31` by hand for the most ordinary case is the form failing at its job.
 */
export const monthEndOptions = (year: number): MonthEndOption[] =>
  Array.from({ length: 14 }, (_, i) => {
    const month = i + 1;
    return {
      month,
      year: month > 12 ? year + 1 : year,
      date: endOfMonth(year, month),
    };
  });

/** The calendar year a start date falls in, or `null` when it is unset or malformed. */
export const yearOf = (ymd: string): number | null => parse(ymd)?.y ?? null;

export interface Term {
  months: number;
  days: number;
}

/**
 * How long the contract runs, counted **inclusively** — `start` and `end` are both covered days,
 * so 2026-01-01 → 2026-12-31 is 12 months, not "11 months and 30 days". That is done by measuring
 * to the day *after* `end`, which is where the term actually stops.
 *
 * Returns `null` when either date is unset or malformed, and when `end` is not after `start` —
 * a term of zero or negative length is not a duration to be drawn, it is the validation error the
 * form already reports under the field.
 */
export const contractTerm = (start: string, end: string): Term | null => {
  const s = parse(start);
  const e = parse(end);
  if (!s || !e) return null;

  const stop = fromUtcMs(toUtcMs(e) + DAY_MS);
  let months = (stop.y - s.y) * 12 + (stop.m - s.m);
  let days = stop.d - s.d;
  if (days < 0) {
    months -= 1;
    // The remainder is measured in the month `stop` fell short of completing, not in `stop`'s own.
    days += daysInMonth(stop.y, stop.m - 1);
  }
  if (months < 0 || (months === 0 && days <= 0)) return null;
  return { months, days };
};
