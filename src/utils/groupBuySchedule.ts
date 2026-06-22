/**
 * Pure, side-effect-free formatters for a group-buy batch's announced schedule
 * (admin-set starts_at / ends_at). Kept out of React so the hero countdown and
 * date-range label can be unit tested deterministically. All calendar formatting
 * is done in UTC so the displayed date matches the stored calendar date
 * regardless of the viewer's timezone.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const monthDay = (date: Date): string =>
  date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const monthDayYear = (date: Date): string =>
  date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const dayOfMonth = (date: Date): string =>
  date.toLocaleDateString('en-PH', { day: 'numeric', timeZone: 'UTC' });

const parse = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Human-readable announced window for the hero. Collapses redundant month/year
 * parts when the start and end share them.
 *
 *   formatDateRange('2026-06-22', '2026-06-25') -> 'Jun 22 – 25'
 *   formatDateRange('2026-06-22', '2026-07-05') -> 'Jun 22 – Jul 5'
 *   formatDateRange('2026-06-22', null)         -> 'from Jun 22'
 *   formatDateRange(null, '2026-07-05')         -> 'until Jul 5'
 *   formatDateRange(null, null)                 -> ''
 */
export const formatDateRange = (
  start: string | null | undefined,
  end: string | null | undefined,
): string => {
  const startDate = parse(start);
  const endDate = parse(end);

  if (!startDate && !endDate) return '';
  if (startDate && !endDate) return `from ${monthDay(startDate)}`;
  if (!startDate && endDate) return `until ${monthDay(endDate)}`;

  // Both present — narrow for TypeScript.
  const from = startDate as Date;
  const to = endDate as Date;

  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  if (!sameYear) {
    return `${monthDayYear(from)} – ${monthDayYear(to)}`;
  }

  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const right = sameMonth ? dayOfMonth(to) : monthDay(to);
  return `${monthDay(from)} – ${right}`;
};

export interface Countdown {
  /** True once the finish date has passed. */
  expired: boolean;
  /** Remaining-time label such as '2d 14h', '3h 30m', or '45m'. Empty when expired. */
  label: string;
}

/**
 * Time remaining until the batch's finish date, expressed at two units of
 * precision. Returns null when no finish date is set so the hero can omit the
 * countdown entirely. `now` is injectable for deterministic tests; callers in
 * the UI pass the live clock.
 */
export const getCountdown = (
  endsAt: string | null | undefined,
  now: Date = new Date(),
): Countdown | null => {
  const end = parse(endsAt);
  if (!end) return null;

  const remaining = end.getTime() - now.getTime();
  if (remaining <= 0) {
    return { expired: true, label: '' };
  }

  const days = Math.floor(remaining / MS_PER_DAY);
  const hours = Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE);

  let label: string;
  if (days > 0) {
    label = `${days}d ${hours}h`;
  } else if (hours > 0) {
    label = `${hours}h ${minutes}m`;
  } else {
    label = `${minutes}m`;
  }

  return { expired: false, label };
};

export interface CountdownParts {
  /** True once the finish date has passed. */
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Remaining time until the finish date, broken into individual day/hour/minute/
 * second parts for a big, live hero countdown. Returns null when no finish date
 * is set, and zeroed parts (expired: true) once the deadline has passed. `now`
 * is injectable for deterministic tests.
 */
export const getCountdownParts = (
  endsAt: string | null | undefined,
  now: Date = new Date(),
): CountdownParts | null => {
  const end = parse(endsAt);
  if (!end) return null;

  const remaining = end.getTime() - now.getTime();
  if (remaining <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    expired: false,
    days: Math.floor(remaining / MS_PER_DAY),
    hours: Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((remaining % MS_PER_MINUTE) / MS_PER_SECOND),
  };
};
