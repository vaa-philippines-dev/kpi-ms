import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
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

/**
 * One connection's rolled-up status for the last `periods` weeks/months,
 * oldest first, alongside the actual per-KPI values behind that status — the
 * per-connection counterpart to lib/trend.ts's system-wide getPerformanceTrend
 * (which counts connections per status, not one connection's own status over
 * time). Powers the VA-facing History page.
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
  const latest = currentPeriodStart(period, anchor, weekStartDay);
  const starts: Date[] = [];
  let cursor = latest;
  for (let i = 0; i < periods; i++) {
    starts.unshift(cursor);
    cursor = stepBack(cursor, period);
  }

  // Two batched queries covering every period at once, rather than the old
  // per-period round trips — same "one grouped query beats N sequential
  // ones" fix as recomputePerformanceSummary.
  const [submissions, rawSummaries, inapplicableConfigs] = await Promise.all([
    prisma.submission.findMany({
      where: { connectionId, period, periodStart: { in: starts } },
      select: { periodStart: true },
    }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period, periodStart: { in: starts } },
      include: { kpiDefinition: true },
    }),
    // Not-applicable KPIs still have PerformanceSummary rows sitting around
    // from before they were marked N/A (see excludeInapplicable's doc) —
    // filtered out below so they don't drag down this connection's status.
    prisma.kpiConfig.findMany({
      where: { connectionId, isApplicable: false },
      select: { kpiDefinitionId: true },
    }),
  ]);
  const inapplicableKpiIds = new Set(inapplicableConfigs.map((c) => c.kpiDefinitionId));
  const summaries = excludeInapplicable(rawSummaries, inapplicableKpiIds);

  const submittedPeriods = new Set(submissions.map((s) => s.periodStart.getTime()));
  const summariesByPeriod = new Map<number, typeof summaries>();
  for (const s of summaries) {
    const key = s.periodStart.getTime();
    const list = summariesByPeriod.get(key);
    if (list) list.push(s);
    else summariesByPeriod.set(key, [s]);
  }

  return starts.map((periodStart) => {
    const hasSubmission = submittedPeriods.has(periodStart.getTime());
    const rows = summariesByPeriod.get(periodStart.getTime()) ?? [];
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
  });
}
