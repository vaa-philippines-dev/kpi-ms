import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Start of the current period in UTC: the Monday of this week for WEEKLY,
 * or the 1st of this month for MONTHLY.
 */
export function currentPeriodStart(period: KpiPeriod, now = new Date()): Date {
  if (period === KpiPeriod.WEEKLY) {
    const day = now.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - diffToMonday,
      ),
    );
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
