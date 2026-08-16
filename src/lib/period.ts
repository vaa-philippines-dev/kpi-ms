import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Start of the current period in UTC: the start of this week (per
 * weekStartDay, 0=Sunday..6=Saturday, default Monday) for WEEKLY, or the
 * 1st of this month for MONTHLY. weekStartDay is driven by the
 * WEEK_START_DAY setting — see lib/settings.ts.
 */
export function currentPeriodStart(
  period: KpiPeriod,
  now = new Date(),
  weekStartDay = 1,
): Date {
  if (period === KpiPeriod.WEEKLY) {
    const day = now.getUTCDay();
    const diffToStart = (day - weekStartDay + 7) % 7;
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - diffToStart,
      ),
    );
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the current UTC day. */
export function startOfToday(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Whole days between `date` and now. */
export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** `date` shifted by `days` (may be negative), preserving UTC midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Parses a `?date=YYYY-MM-DD` search param into a UTC midnight Date, for the
 * dashboard's week-by-week period navigator. Returns undefined for anything
 * missing or malformed, so callers can fall back to "now".
 */
export function parseAnchorDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `date` as a `YYYY-MM-DD` string, for building nav links. */
export function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Jul 6 – Jul 12, 2026" for a 7-day window starting at `start`. */
export function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, opts);
  return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
}
