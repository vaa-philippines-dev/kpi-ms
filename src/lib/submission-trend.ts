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
 * period's start and is currently ACTIVE, rather than reconstructing
 * historical status-as-of-that-week from ConnectionStatusEvent. Legacy's own
 * getSubmissionTrendData/getSubmissionStatusList filter the same way (current
 * Status === 'active', not merely "not paused") — an ended (END_OF_CONTRACT/
 * END_OF_PROJECT) or not-yet-started (PENDING) connection was never expected
 * to submit and shouldn't inflate the denominator.
 *
 * "Submitted" is measured by a PerformanceSummary row existing for the
 * period, not a Submission row. The legacy data migration bulk-imports
 * historical performance data straight into PerformanceSummary and never
 * creates Submission rows for it (see legacy-sync/performance-sync.ts) — so
 * checking Submission here read as 0% for every period, real data or not,
 * since fewer than a handful of Submission rows exist system-wide pre-launch.
 * PerformanceSummary is populated by both paths (live submissions upsert it
 * in the same transaction as their Submission row — see submit/actions.ts),
 * so it's the one signal that actually means "we have data for this period."
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
      // Real business start date, not row-creation time — every legacy-
      // migrated connection's createdAt is stamped at whatever moment the
      // reference sync last ran, not when it actually began. Filtering on
      // createdAt alone excluded virtually every migrated connection from
      // every week before the most recent sync, collapsing `total` to ~0
      // and flattening the whole trend to 0% until the most recent couple
      // of weeks. startDate carries the real date; fall back to createdAt
      // only for the rare row where startDate is genuinely unknown.
      // AND'd as separate objects, not spread — `scope` itself carries an
      // OR (e.g. an OM's team-leader-or-own-connections clause); merging a
      // second top-level `OR:` key in via spread would silently clobber it
      // instead of combining, leaking every connection past that role's
      // actual visibility scope.
      const countable = await prisma.connection.findMany({
        where: {
          AND: [
            scope,
            { status: ConnectionStatus.ACTIVE },
            {
              OR: [
                { startDate: { lte: periodStart } },
                { startDate: null, createdAt: { lte: periodStart } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      const total = countable.length;
      if (total === 0) {
        return { periodStart, submitted: 0, total: 0, pending: 0, ratePct: 0 };
      }
      const submittedGroups = await prisma.performanceSummary.groupBy({
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
