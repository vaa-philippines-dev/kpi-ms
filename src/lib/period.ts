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

/** `now` shifted back by `hours` (may be negative to shift forward). */
export function hoursAgo(hours: number, now = new Date()): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Whole days between `date` and now. */
export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** `date` shifted by `days` (may be negative), preserving UTC midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** `date` shifted by `months` (may be negative), preserving UTC day-of-month. */
export function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
  );
}

/** The last instant of `date`'s UTC month. */
export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
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

/** "1 yr 2 mo" / "3 mo" / "12 days" for a tenure length in days. */
export function formatDuration(days: number): string {
  if (!days || days < 0) return "0 days";
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remDays = days % 30;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years !== 1 ? "s" : ""}`);
  if (months) parts.push(`${months} mo${months !== 1 ? "s" : ""}`);
  if (!years && !months) parts.push(`${remDays} day${remDays !== 1 ? "s" : ""}`);
  return parts.join(" ");
}

/** "Jul 6 – Jul 12, 2026" for a 7-day window starting at `start`. */
export function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, opts);
  return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
}
