import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { KpiDirection, KpiPeriod, PerformanceStatus, ThresholdUnit } from "@/generated/prisma/enums";

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
 *
 * NO_DATA means "nothing was submitted" (actualValue is null) — it must
 * never fire just because a real submitted value happens to make deviation
 * un-expressible as a percentage (a zero targetValue, e.g. a KPI whose
 * master target was never configured past its default). `underperforming`
 * is checked before computeDeviationPct is even called, so a zero target
 * that's actually being met (or exceeded, in the good direction) reports
 * ON_TARGET; only an unmet zero target falls back to CRITICAL instead of
 * a percentage it can't compute.
 *
 * `thresholdUnit` PERCENT (the historical, only-supported mode) evaluates
 * deviationThresholdPct/criticalThresholdPct as %-of-target deviation, as
 * above. VALUE instead treats them as raw floor/ceiling values on the
 * target's own scale — e.g. for a higher-is-better KPI, "actual must stay
 * at or above this number" — which is what admins actually want to type for
 * a non-percent-unit KPI like ROAS, rather than mentally converting to a
 * deviation percentage themselves.
 */
export function computeStatus(
  direction: KpiDirection,
  targetValue: number,
  actualValue: number | null,
  deviationThresholdPct: number,
  criticalThresholdPct: number,
  thresholdUnit: ThresholdUnit = ThresholdUnit.PERCENT,
): PerformanceStatus {
  if (actualValue === null) return PerformanceStatus.NO_DATA;

  const underperforming =
    direction === KpiDirection.HIGHER_IS_BETTER
      ? actualValue < targetValue
      : actualValue > targetValue;

  if (!underperforming) return PerformanceStatus.ON_TARGET;

  if (thresholdUnit === ThresholdUnit.VALUE) {
    const meetsDeviationFloor =
      direction === KpiDirection.HIGHER_IS_BETTER
        ? actualValue >= deviationThresholdPct
        : actualValue <= deviationThresholdPct;
    if (meetsDeviationFloor) return PerformanceStatus.ON_TARGET;
    const meetsCriticalFloor =
      direction === KpiDirection.HIGHER_IS_BETTER
        ? actualValue >= criticalThresholdPct
        : actualValue <= criticalThresholdPct;
    return meetsCriticalFloor ? PerformanceStatus.AT_RISK : PerformanceStatus.CRITICAL;
  }

  const dev = computeDeviationPct(targetValue, actualValue);
  if (dev === null) return PerformanceStatus.CRITICAL;
  if (dev <= deviationThresholdPct) return PerformanceStatus.ON_TARGET;
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
 * PerformanceSummary rows are never deleted or corrected when a KPI is
 * later marked not-applicable for a connection (KpiConfig.isApplicable =
 * false) — recomputePerformanceSummary only ever touches KPIs still
 * present on the submission form, which already excludes N/A ones. So a
 * KPI that was measured (and, say, missed target) before being marked N/A
 * leaves a stale CRITICAL/AT_RISK row sitting in the current period that
 * would otherwise still drag down rollupStatus. Every caller that rolls up
 * raw PerformanceSummary rows into one connection status must filter with
 * this first. Use this single-connection form (a plain Set of
 * kpiDefinitionIds) when the summaries are already scoped to one
 * connection; use `excludeInapplicablePairs` + `loadInapplicableKpiPairs`
 * when rolling up many connections' summaries at once.
 */
export function excludeInapplicable<T extends { kpiDefinitionId: string }>(
  summaries: T[],
  inapplicableKpiIds: Set<string>,
): T[] {
  if (inapplicableKpiIds.size === 0) return summaries;
  return summaries.filter((s) => !inapplicableKpiIds.has(s.kpiDefinitionId));
}

/** Multi-connection counterpart of `excludeInapplicable` — see its doc. */
export function excludeInapplicablePairs<T extends { connectionId: string; kpiDefinitionId: string }>(
  summaries: T[],
  inapplicablePairs: Set<string>,
): T[] {
  if (inapplicablePairs.size === 0) return summaries;
  return summaries.filter((s) => !inapplicablePairs.has(`${s.connectionId}:${s.kpiDefinitionId}`));
}

/**
 * Loads the `${connectionId}:${kpiDefinitionId}` keys `excludeInapplicablePairs`
 * needs, for every not-applicable KpiConfig row on a connection matching
 * `scope` — the same Prisma.ConnectionWhereInput already used to scope the
 * PerformanceSummary query being filtered. Pass `{ id: connectionId }` when
 * scoping to a single connection.
 */
export async function loadInapplicableKpiPairs(
  scope: Prisma.ConnectionWhereInput,
): Promise<Set<string>> {
  const rows = await prisma.kpiConfig.findMany({
    where: { connection: scope, isApplicable: false },
    select: { connectionId: true, kpiDefinitionId: true },
  });
  return new Set(rows.map((r) => `${r.connectionId}:${r.kpiDefinitionId}`));
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

  // Independent of one another, so both run before any per-KPI processing —
  // and the sums are one grouped query rather than one aggregate() per KPI.
  // Submitting every area at once (the "view all clusters" form) can pass
  // 50+ KPI ids here; doing that many sequential round trips inside one
  // transaction risked blowing Prisma's 5s interactive-transaction timeout.
  const [kpis, sums] = await Promise.all([
    tx.kpiDefinition.findMany({
      where: { id: { in: kpiDefinitionIds } },
      include: { kpiConfigs: { where: { connectionId } } },
    }),
    tx.submissionRecord.groupBy({
      by: ["kpiDefinitionId"],
      where: {
        kpiDefinitionId: { in: kpiDefinitionIds },
        noData: false,
        submission: { connectionId, periodStart },
      },
      _sum: { value: true },
    }),
  ]);
  const actualByKpiId = new Map(sums.map((s) => [s.kpiDefinitionId, s._sum.value ?? null]));

  // Firing one upsert per KPI — even concurrently via Promise.all — still
  // serializes on the transaction's single DB connection, so it doesn't
  // actually save round trips over a plain loop (confirmed: still ~75
  // round trips for a 75-KPI "view all clusters" batch, still ~5.2s, still
  // blowing the timeout). A single multi-row `INSERT ... ON CONFLICT DO
  // UPDATE` is the only way to make this one round trip regardless of how
  // many KPIs are being recomputed.
  const rows = kpis.map((kpi) => {
    const config = kpi.kpiConfigs[0];
    const actualValue = actualByKpiId.get(kpi.id) ?? null;
    const targetValue = config?.targetValue ?? kpi.targetValue;
    const deviationThresholdPct = config?.deviationThresholdPct ?? kpi.deviationThresholdPct;
    const criticalThresholdPct = config?.criticalThresholdPct ?? kpi.criticalThresholdPct;
    const status = computeStatus(
      kpi.direction,
      targetValue,
      actualValue,
      deviationThresholdPct,
      criticalThresholdPct,
      kpi.thresholdUnit,
    );
    const pct =
      actualValue !== null && targetValue !== 0 ? (actualValue / targetValue) * 100 : null;

    // `id` would normally come from Prisma's own cuid default, which only
    // applies through the normal query builder — a raw INSERT has to supply
    // it itself. Not used as a foreign key anywhere, so the different
    // format (uuid vs. the app's usual cuid) is cosmetic only.
    return Prisma.sql`(${randomUUID()}, ${connectionId}, ${kpi.id}, ${period}::"KpiPeriod", ${periodStart}, ${actualValue}, ${targetValue}, ${pct}, ${status}::"PerformanceStatus", now())`;
  });

  await tx.$executeRaw`
    INSERT INTO "PerformanceSummary"
      (id, "connectionId", "kpiDefinitionId", period, "periodStart", "actualValue", "targetValue", pct, status, "updatedAt")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("connectionId", "kpiDefinitionId", "periodStart")
    DO UPDATE SET
      "actualValue" = EXCLUDED."actualValue",
      "targetValue" = EXCLUDED."targetValue",
      pct = EXCLUDED.pct,
      status = EXCLUDED.status,
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}
