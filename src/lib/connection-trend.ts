import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

export type ConnectionTrendPoint = {
  periodStart: Date;
  /** Null = no KPI row exists for this period at all (nothing submitted),
   *  distinct from NO_DATA (something was submitted but explicitly marked
   *  as having no data). */
  status: PerformanceStatus | null;
};

/** One week/month back from `periodStart` — same stepping as lib/trend.ts. */
function stepBack(periodStart: Date, period: KpiPeriod): Date {
  if (period === KpiPeriod.WEEKLY) {
    return new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1),
  );
}

/**
 * One connection's rolled-up status for the last `periods` weeks/months,
 * oldest first — the per-connection counterpart to lib/trend.ts's
 * system-wide getPerformanceTrend (which counts connections per status, not
 * one connection's own status over time). Powers the VA-facing History page.
 */
export async function getConnectionTrend(
  connectionId: string,
  period: KpiPeriod,
  weekStartDay: number,
  periods = 6,
  anchor?: Date,
): Promise<ConnectionTrendPoint[]> {
  const latest = currentPeriodStart(period, anchor, weekStartDay);
  const starts: Date[] = [];
  let cursor = latest;
  for (let i = 0; i < periods; i++) {
    starts.unshift(cursor);
    cursor = stepBack(cursor, period);
  }

  return Promise.all(
    starts.map(async (periodStart) => {
      const rows = await prisma.performanceSummary.findMany({
        where: { connectionId, period, periodStart },
        select: { status: true },
      });
      const status = rows.length > 0 ? rollupStatus(rows.map((r) => r.status)) : null;
      return { periodStart, status };
    }),
  );
}
