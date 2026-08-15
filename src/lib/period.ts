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
