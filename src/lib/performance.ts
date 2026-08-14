import { KpiDirection, PerformanceStatus } from "@/generated/prisma/enums";

/**
 * actual/target as a percentage, flipped for "lower is better" KPIs so a
 * smaller actual value still scores above 100%. Division-by-zero edges
 * (zero target or zero actual) are capped rather than left as
 * Infinity/NaN, since those aren't safely representable end-to-end.
 */
export function computePct(
  direction: KpiDirection,
  targetValue: number,
  actualValue: number,
): number {
  const [numerator, denominator] =
    direction === KpiDirection.HIGHER_IS_BETTER
      ? [actualValue, targetValue]
      : [targetValue, actualValue];

  if (denominator === 0) {
    if (numerator === 0) return 100;
    return numerator > 0 ? 1000 : 0;
  }
  return (numerator / denominator) * 100;
}

export function computeStatus(
  pct: number,
  deviationThresholdPct: number,
): PerformanceStatus {
  if (pct >= 100) return PerformanceStatus.ON_TARGET;
  if (pct >= deviationThresholdPct) return PerformanceStatus.AT_RISK;
  return PerformanceStatus.CRITICAL;
}
