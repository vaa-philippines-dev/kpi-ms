import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type TrendPoint = {
  periodStart: Date;
  onTarget: number;
  atRisk: number;
  critical: number;
  noData: number;
};

/** One week/month back from `periodStart`, for stepping the trend window. */
function stepBack(periodStart: Date, period: KpiPeriod): Date {
  if (period === KpiPeriod.WEEKLY) {
    return new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1),
  );
}

/**
 * System-wide status counts for the last `periods` weeks/months, oldest
 * first — mirrors legacy's getSystemPerformanceTrend() "Performance
 * Overview" chart. One indexed groupBy per period rather than one big scan,
 * since this runs on every Overview render.
 */
export async function getPerformanceTrend(
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  weekStartDay: number,
  periods = 6,
  anchor?: Date,
): Promise<TrendPoint[]> {
  const latest = currentPeriodStart(period, anchor, weekStartDay);
  const starts: Date[] = [];
  let cursor = latest;
  for (let i = 0; i < periods; i++) {
    starts.unshift(cursor);
    cursor = stepBack(cursor, period);
  }

  return Promise.all(
    starts.map(async (periodStart) => {
      const rows = await prisma.performanceSummary.groupBy({
        by: ["status"],
        where: { connection: scope, period, periodStart },
        _count: true,
      });
      const point: TrendPoint = {
        periodStart,
        onTarget: 0,
        atRisk: 0,
        critical: 0,
        noData: 0,
      };
      for (const r of rows) {
        if (r.status === PerformanceStatus.ON_TARGET) point.onTarget = r._count;
        else if (r.status === PerformanceStatus.AT_RISK) point.atRisk = r._count;
        else if (r.status === PerformanceStatus.CRITICAL) point.critical = r._count;
        else point.noData = r._count;
      }
      return point;
    }),
  );
}
