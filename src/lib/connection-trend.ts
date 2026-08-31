import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { rollupStatus, excludeInapplicablePairs } from "@/lib/performance";
import { KpiDirection, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

export type ConnectionTrendKpiRow = {
  kpiDefinitionId: string;
  name: string;
  unit: string | null;
  direction: KpiDirection;
  targetValue: number;
  actualValue: number | null;
  status: PerformanceStatus;
};

export type ConnectionTrendPoint = {
  periodStart: Date;
  /** Null = no Submission exists for this period at all (nothing submitted),
   *  distinct from NO_DATA (something was submitted but explicitly marked
   *  as having no data). */
  status: PerformanceStatus | null;
  /** The actual per-KPI values behind `status` — empty when nothing was
   *  submitted for this period. */
  kpiRows: ConnectionTrendKpiRow[];
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

/** The `periods` period-starts ending at the current one, oldest first. */
function periodStarts(
  period: KpiPeriod,
  weekStartDay: number,
  periods: number,
  anchor?: Date,
): Date[] {
  const starts: Date[] = [];
  let cursor = currentPeriodStart(period, anchor, weekStartDay);
  for (let i = 0; i < periods; i++) {
    starts.unshift(cursor);
    cursor = stepBack(cursor, period);
  }
  return starts;
}

/**
 * Many connections' status trends in a fixed three queries, whatever the
 * connection count — the batched counterpart to getConnectionTrend below,
 * and the form every multi-connection caller should use.
 *
 * Calling the single-connection version in a `Promise.all(connections.map(…))`
 * fans out to 3 queries *per connection*, which is what the VA dashboard
 * (dashboard/va-overview.tsx) and History page used to do on every render —
 * a VA with eight active connections opened 24 round trips just to draw
 * their status sparklines, on the page every VA lands on at sign-in. Same
 * "one grouped query beats N sequential ones" fix already applied inside
 * this function for periods, and in lib/trend.ts and
 * recomputePerformanceSummary.
 *
 * Returns a Map keyed by connectionId; every id passed in gets an entry,
 * with an all-null-status series if it has no data at all.
 */
export async function getConnectionTrendBatch(
  connectionIds: string[],
  period: KpiPeriod,
  weekStartDay: number,
  periods = 6,
  anchor?: Date,
): Promise<Map<string, ConnectionTrendPoint[]>> {
  const starts = periodStarts(period, weekStartDay, periods, anchor);
  if (connectionIds.length === 0) return new Map();

  const where = { connectionId: { in: connectionIds }, period, periodStart: { in: starts } };
  const [submissions, rawSummaries, inapplicableConfigs] = await Promise.all([
    prisma.submission.findMany({
      where,
      select: { connectionId: true, periodStart: true },
    }),
    prisma.performanceSummary.findMany({
      where,
      include: { kpiDefinition: true },
    }),
    // Not-applicable KPIs still have PerformanceSummary rows sitting around
    // from before they were marked N/A (see excludeInapplicablePairs' doc) —
    // filtered out below so they don't drag down a connection's status.
    prisma.kpiConfig.findMany({
      where: { connectionId: { in: connectionIds }, isApplicable: false },
      select: { connectionId: true, kpiDefinitionId: true },
    }),
  ]);

  const inapplicablePairs = new Set(
    inapplicableConfigs.map((c) => `${c.connectionId}:${c.kpiDefinitionId}`),
  );
  const summaries = excludeInapplicablePairs(rawSummaries, inapplicablePairs);

  // `${connectionId}:${periodStart}` for both, so a period is looked up in
  // one step rather than nesting a map per connection.
  const submittedKeys = new Set(
    submissions.map((s) => `${s.connectionId}:${s.periodStart.getTime()}`),
  );
  const summariesByKey = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const key = `${s.connectionId}:${s.periodStart.getTime()}`;
    const list = summariesByKey.get(key);
    if (list) list.push(s);
    else summariesByKey.set(key, [s]);
  }

  const byConnection = new Map<string, ConnectionTrendPoint[]>();
  for (const connectionId of connectionIds) {
    byConnection.set(
      connectionId,
      starts.map((periodStart) => {
        const key = `${connectionId}:${periodStart.getTime()}`;
        const hasSubmission = submittedKeys.has(key);
        const rows = summariesByKey.get(key) ?? [];
        const status = hasSubmission ? rollupStatus(rows.map((r) => r.status)) : null;
        const kpiRows: ConnectionTrendKpiRow[] = hasSubmission
          ? rows
              .map((r) => ({
                kpiDefinitionId: r.kpiDefinitionId,
                name: r.kpiDefinition.name,
                unit: r.kpiDefinition.unit,
                direction: r.kpiDefinition.direction,
                targetValue: r.targetValue,
                actualValue: r.actualValue,
                status: r.status,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : [];
        return { periodStart, status, kpiRows };
      }),
    );
  }
  return byConnection;
}

/**
 * One connection's rolled-up status for the last `periods` weeks/months,
 * oldest first, alongside the actual per-KPI values behind that status — the
 * per-connection counterpart to lib/trend.ts's system-wide getPerformanceTrend
 * (which counts connections per status, not one connection's own status over
 * time).
 *
 * Fetching several connections? Use getConnectionTrendBatch instead — this
 * costs three queries per call, so mapping it over a list multiplies them.
 *
 * "Submitted" is read off the Submission table directly rather than off
 * PerformanceSummary presence — PerformanceSummary rows are never deleted
 * (recomputePerformanceSummary falls them back to NO_DATA instead), so their
 * mere existence doesn't reliably say whether a period was actually
 * submitted. Same fix as dashboard/performance/actions.ts's
 * getConnectionWeekDetail and commit 2d9cd9d's fix for the submissions
 * tracker.
 */
export async function getConnectionTrend(
  connectionId: string,
  period: KpiPeriod,
  weekStartDay: number,
  periods = 6,
  anchor?: Date,
): Promise<ConnectionTrendPoint[]> {
  const byConnection = await getConnectionTrendBatch(
    [connectionId],
    period,
    weekStartDay,
    periods,
    anchor,
  );
  return byConnection.get(connectionId) ?? [];
}
