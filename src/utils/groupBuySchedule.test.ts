import { describe, it, expect } from 'vitest';
import { formatDateRange, getCountdown, getCountdownParts } from './groupBuySchedule';

describe('formatDateRange', () => {
  it('returns empty string when both dates are missing', () => {
    expect(formatDateRange(null, null)).toBe('');
  });

  it('formats a same-month range compactly', () => {
    // Arrange
    const start = '2026-06-22T00:00:00Z';
    const end = '2026-06-25T00:00:00Z';

    // Act / Assert
    expect(formatDateRange(start, end)).toBe('Jun 22 – 25');
  });

  it('formats a cross-month range with both months', () => {
    expect(formatDateRange('2026-06-22T00:00:00Z', '2026-07-05T00:00:00Z')).toBe('Jun 22 – Jul 5');
  });

  it('includes the year on a cross-year range', () => {
    expect(formatDateRange('2025-12-28T00:00:00Z', '2026-01-03T00:00:00Z')).toBe(
      'Dec 28, 2025 – Jan 3, 2026',
    );
  });

  it('renders an open-ended start with a "from" prefix', () => {
    expect(formatDateRange('2026-06-22T00:00:00Z', null)).toBe('from Jun 22');
  });

  it('renders a deadline-only window with an "until" prefix', () => {
    expect(formatDateRange(null, '2026-07-05T00:00:00Z')).toBe('until Jul 5');
  });
});

describe('getCountdown', () => {
  it('returns null when there is no finish date', () => {
    expect(getCountdown(null, new Date('2026-06-22T00:00:00Z'))).toBeNull();
  });

  it('marks a past finish date as expired', () => {
    const result = getCountdown('2026-06-20T00:00:00Z', new Date('2026-06-22T00:00:00Z'));
    expect(result).toEqual({ expired: true, label: '' });
  });

  it('reports days and hours when more than a day remains', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const end = new Date('2026-06-24T14:00:00Z'); // 2d 14h later
    expect(getCountdown(end.toISOString(), now)).toEqual({ expired: false, label: '2d 14h' });
  });

  it('reports hours and minutes within the final day', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const end = new Date('2026-06-22T03:30:00Z'); // 3h 30m later
    expect(getCountdown(end.toISOString(), now)).toEqual({ expired: false, label: '3h 30m' });
  });

  it('reports minutes only within the final hour', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const end = new Date('2026-06-22T00:45:00Z'); // 45m later
    expect(getCountdown(end.toISOString(), now)).toEqual({ expired: false, label: '45m' });
  });
});

describe('getCountdownParts', () => {
  it('returns null when there is no finish date', () => {
    expect(getCountdownParts(null, new Date('2026-06-22T00:00:00Z'))).toBeNull();
  });

  it('breaks the remaining time into day/hour/minute/second parts', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const end = new Date('2026-06-24T14:09:30Z'); // 2d 14h 9m 30s later
    expect(getCountdownParts(end.toISOString(), now)).toEqual({
      expired: false,
      days: 2,
      hours: 14,
      minutes: 9,
      seconds: 30,
    });
  });

  it('reports an expired window with zeroed parts once the finish date passes', () => {
    const now = new Date('2026-06-22T00:00:00Z');
    const end = new Date('2026-06-20T00:00:00Z');
    expect(getCountdownParts(end.toISOString(), now)).toEqual({
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});
