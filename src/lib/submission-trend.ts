import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod, ConnectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type SubmissionTrendPoint = {
  periodStart: Date;
  submitted: number;
  total: number;
  pending: number;
  ratePct: number;
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
 * Submission-rate trend for the last `periods` weeks/months, oldest first —
 * mirrors legacy's getSubmissionTrendData(). Simplified vs. legacy: a
 * connection counts toward a period's total if it already existed by that
 * period's start and isn't currently paused, rather than reconstructing
 * historical status-as-of-that-week from ConnectionStatusEvent.
 */
export async function getSubmissionTrend(
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  weekStartDay: number,
  periods = 6,
  anchor?: Date,
): Promise<SubmissionTrendPoint[]> {
  const latest = currentPeriodStart(period, anchor, weekStartDay);
  const starts: Date[] = [];
  let cursor = latest;
  for (let i = 0; i < periods; i++) {
    starts.unshift(cursor);
    cursor = stepBack(cursor, period);
  }

  return Promise.all(
    starts.map(async (periodStart) => {
      const countable = await prisma.connection.findMany({
        where: {
          ...scope,
          createdAt: { lte: periodStart },
          status: { not: ConnectionStatus.PAUSED },
        },
        select: { id: true },
      });
      const total = countable.length;
      if (total === 0) {
        return { periodStart, submitted: 0, total: 0, pending: 0, ratePct: 0 };
      }
      const submittedGroups = await prisma.submission.groupBy({
        by: ["connectionId"],
        where: {
          period,
          periodStart,
          connectionId: { in: countable.map((c) => c.id) },
        },
      });
      const submitted = submittedGroups.length;
      return {
        periodStart,
        submitted,
        total,
        pending: total - submitted,
        ratePct: Math.round((submitted / total) * 100),
      };
    }),
  );
}
