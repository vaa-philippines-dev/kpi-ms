import { prisma } from "@/lib/prisma";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

/**
 * Which of `connectionIds` count as "submitted" for each of `periodStarts`,
 * keyed `${connectionId}:${periodStart.getTime()}` (see submittedKey).
 *
 * A connection counts when it has either:
 *  - a real Submission row for that period, or
 *  - a PerformanceSummary row whose status isn't NO_DATA.
 *
 * PerformanceSummary alone isn't trustworthy: its rows are never deleted —
 * recomputePerformanceSummary falls back to NO_DATA when a submission is
 * deleted or moved to another period — so a deleted submission used to
 * leave behind rows that still read as "submitted" (e.g. a TL deleting a
 * VA's weekly submission showed that VA at 100% in the Team Members panel
 * while the tracker table right next to it said Pending). Submission alone
 * isn't enough either: legacy bulk imports wrote straight into
 * PerformanceSummary and never created a Submission row (see
 * lib/submission-trend.ts). Checking Submission OR a non-NO_DATA summary
 * covers both — and a live submission whose KPIs were all marked "no data"
 * still counts, via its Submission row.
 */
export async function getSubmittedKeys(
  connectionIds: string[],
  period: KpiPeriod,
  periodStarts: Date[],
): Promise<Set<string>> {
  if (connectionIds.length === 0 || periodStarts.length === 0) return new Set();
  const where = {
    period,
    periodStart: { in: periodStarts },
    connectionId: { in: connectionIds },
  };
  const [submissions, summaries] = await Promise.all([
    prisma.submission.findMany({
      where,
      select: { connectionId: true, periodStart: true },
    }),
    prisma.performanceSummary.groupBy({
      by: ["connectionId", "periodStart"],
      where: { ...where, status: { not: PerformanceStatus.NO_DATA } },
    }),
  ]);
  const keys = new Set<string>();
  for (const s of [...submissions, ...summaries]) {
    keys.add(submittedKey(s.connectionId, s.periodStart));
  }
  return keys;
}

export function submittedKey(connectionId: string, periodStart: Date): string {
  return `${connectionId}:${periodStart.getTime()}`;
}

/** Single-period form of getSubmittedKeys — returns bare connection ids. */
export async function getSubmittedConnectionIds(
  connectionIds: string[],
  period: KpiPeriod,
  periodStart: Date,
): Promise<Set<string>> {
  const keys = await getSubmittedKeys(connectionIds, period, [periodStart]);
  return new Set(connectionIds.filter((id) => keys.has(submittedKey(id, periodStart))));
}
