import { KpiDirection, PerformanceStatus } from "@/generated/prisma/enums";

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
