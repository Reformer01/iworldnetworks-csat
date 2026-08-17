/**
 * ISO 8601 week number helpers, shared by all BTS audit code.
 *
 * Single source of truth for audit-period labels (`YYYY-Www`).
 * Previously duplicated (with slight divergence risk) in the BTS audit page,
 * audit API route, and BTS customer import route.
 */

/**
 * Returns the ISO 8601 week number (1-53) for the given date.
 * Week 1 is the week containing the first Thursday of the year; the week
 * starts on Monday.
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week with Monday = 0 ... Sunday = 6.
  const dayNum = (d.getUTCDay() + 6) % 7;
  // Move to the Thursday of the current week (day 3 of an ISO week).
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  // First ISO week of the year contains the first Thursday (Jan 4).
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/**
 * Returns the current audit period label `YYYY-Www`.
 *
 * Uses the ISO week-year (the year of the Thursday of the week), so dates
 * around New Year's are labeled correctly (e.g. 2027-01-01 -> "2026-W53").
 */
export function getCurrentAuditPeriod(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  return `${isoYear}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
}
