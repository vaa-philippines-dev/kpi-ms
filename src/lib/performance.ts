import type { Prisma } from "@/generated/prisma/client";
import { KpiDirection, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

/**
 * Absolute deviation of actual from target, as a percentage. Null when the
 * status can't be computed (no actual submitted, or target is zero — can't
 * express deviation as a percentage of nothing).
 */
export function computeDeviationPct(
  targetValue: number,
  actualValue: number | null,
): number | null {
  if (actualValue === null || targetValue === 0) return null;
  return (Math.abs(actualValue - targetValue) / targetValue) * 100;
}

/**
 * Ported from the legacy Apps Script `calcStatus()`. Overshooting a target
 * is never penalized — only underperforming in the direction that matters
 * triggers At Risk / Critical, gated by two independent thresholds.
 */
export function computeStatus(
  direction: KpiDirection,
  targetValue: number,
  actualValue: number | null,
  deviationThresholdPct: number,
  criticalThresholdPct: number,
): PerformanceStatus {
  const dev = computeDeviationPct(targetValue, actualValue);
  if (dev === null || actualValue === null) return PerformanceStatus.NO_DATA;

  const underperforming =
    direction === KpiDirection.HIGHER_IS_BETTER
      ? actualValue < targetValue
      : actualValue > targetValue;

  if (!underperforming || dev <= deviationThresholdPct) {
    return PerformanceStatus.ON_TARGET;
  }
  if (dev <= criticalThresholdPct) return PerformanceStatus.AT_RISK;
  return PerformanceStatus.CRITICAL;
}

const STATUS_RANK: Record<PerformanceStatus, number> = {
  [PerformanceStatus.NO_DATA]: -1,
  [PerformanceStatus.ON_TARGET]: 0,
  [PerformanceStatus.AT_RISK]: 1,
  [PerformanceStatus.CRITICAL]: 2,
};

/**
 * Worst-case status across a set of KPI results for one connection+period.
 * NO_DATA only surfaces when every result is NO_DATA; otherwise NO_DATA
 * entries are excluded rather than counted as a negative signal.
 */
export function rollupStatus(statuses: PerformanceStatus[]): PerformanceStatus {
  const withData = statuses.filter((s) => s !== PerformanceStatus.NO_DATA);
  if (withData.length === 0) return PerformanceStatus.NO_DATA;
  return withData.reduce((worst, s) =>
    STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst,
  );
}

/**
 * Recomputes and upserts PerformanceSummary for one connection/period/KPI
 * set, by re-summing whatever SubmissionRecords currently exist for that
 * connection+periodStart — the same "actual = sum of every submitted value"
 * rule createSubmission uses. Never deletes a PerformanceSummary row, even
 * when the recomputed actual comes back null (no submissions left); it just
 * updates it to NO_DATA, same as if nothing had ever been submitted.
 *
 * Callers: createSubmission (original write), and — for correcting a
 * wrongly-dated submission — updateSubmissionPeriod/deleteSubmission in
 * dashboard/submissions/actions.ts, which call this once for the OLD
 * periodStart (to drop the moved/removed values from that period's
 * aggregate) and, when moving, once more for the NEW periodStart.
 */
export async function recomputePerformanceSummary(
  tx: Prisma.TransactionClient,
  params: {
    connectionId: string;
    period: KpiPeriod;
    periodStart: Date;
    kpiDefinitionIds: string[];
  },
): Promise<void> {
  const { connectionId, period, periodStart, kpiDefinitionIds } = params;
  if (kpiDefinitionIds.length === 0) return;

  const kpis = await tx.kpiDefinition.findMany({
    where: { id: { in: kpiDefinitionIds } },
    include: { kpiConfigs: { where: { connectionId } } },
  });

  for (const kpi of kpis) {
    const config = kpi.kpiConfigs[0];
    const total = await tx.submissionRecord.aggregate({
      where: {
        kpiDefinitionId: kpi.id,
        noData: false,
        submission: { connectionId, periodStart },
      },
      _sum: { value: true },
    });
    const actualValue = total._sum.value ?? null;
    const targetValue = config?.targetValue ?? kpi.targetValue;
    const deviationThresholdPct = config?.deviationThresholdPct ?? kpi.deviationThresholdPct;
    const criticalThresholdPct = config?.criticalThresholdPct ?? kpi.criticalThresholdPct;
    const status = computeStatus(
      kpi.direction,
      targetValue,
      actualValue,
      deviationThresholdPct,
      criticalThresholdPct,
    );
    const pct =
      actualValue !== null && targetValue !== 0 ? (actualValue / targetValue) * 100 : null;

    await tx.performanceSummary.upsert({
      where: {
        connectionId_kpiDefinitionId_periodStart: {
          connectionId,
          kpiDefinitionId: kpi.id,
          periodStart,
        },
      },
      create: {
        connectionId,
        kpiDefinitionId: kpi.id,
        period,
        periodStart,
        actualValue,
        targetValue,
        pct,
        status,
      },
      update: {
        actualValue,
        targetValue,
        pct,
        status,
      },
    });
  }
}
