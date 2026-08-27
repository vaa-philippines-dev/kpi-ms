import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { rollupStatus, excludeInapplicablePairs, loadInapplicableKpiPairs } from "@/lib/performance";
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
 * Overview" chart, which counts one rolled-up status per *connection* per
 * period (legacy's summary sheet stores exactly one row per connection-week,
 * with a single already-computed Status field).
 *
 * PerformanceSummary here instead stores one row per *KPI* per
 * connection-week, so counting rows directly (the previous approach) double-
 * (or triple-, or quadruple-) counts every connection with more than one
 * weekly KPI, inflating totals well past legacy's connection-count and
 * skewing the on-target/at-risk/critical mix. Rolling each connection's rows
 * up to one worst-case status first (via rollupStatus, the same helper the
 * Performance Summary table and every other per-connection status display in
 * this app already uses) restores an apples-to-apples count.
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

  // Loaded once up front (not depending on periodStart) rather than inside
  // the per-period map below.
  const inapplicablePairs = await loadInapplicableKpiPairs(scope);

  return Promise.all(
    starts.map(async (periodStart) => {
      const rows = await prisma.performanceSummary.findMany({
        where: { connection: scope, period, periodStart },
        select: { connectionId: true, kpiDefinitionId: true, status: true },
      });
      const applicableRows = excludeInapplicablePairs(rows, inapplicablePairs);
      const byConnection = new Map<string, PerformanceStatus[]>();
      for (const r of applicableRows) {
        const statuses = byConnection.get(r.connectionId);
        if (statuses) statuses.push(r.status);
        else byConnection.set(r.connectionId, [r.status]);
      }
      const point: TrendPoint = {
        periodStart,
        onTarget: 0,
        atRisk: 0,
        critical: 0,
        noData: 0,
      };
      for (const statuses of byConnection.values()) {
        const rolled = rollupStatus(statuses);
        if (rolled === PerformanceStatus.ON_TARGET) point.onTarget++;
        else if (rolled === PerformanceStatus.AT_RISK) point.atRisk++;
        else if (rolled === PerformanceStatus.CRITICAL) point.critical++;
        else point.noData++;
      }
      return point;
    }),
  );
}
