import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";

export type ClusterSummary = {
  cluster: string;
  kpiCount: number;
  submittedCount: number;
};

export type SubmittableKpi = {
  id: string;
  name: string;
  cluster: string;
  targetValue: number;
  direction: KpiDirection;
  configTargetValue: number | null;
  alreadySubmitted: boolean;
};

export type KpiClusterGroup = { cluster: string; kpis: SubmittableKpi[] };

/**
 * One department+period's applicable KPIs for a connection, each flagged
 * with whether it already has a PerformanceSummary row for `periodStart` —
 * the shared query behind both getKpiClusters (aggregate counts, for the
 * cluster picker) and getSubmittableKpis (flat per-KPI list, for the
 * all-clusters form).
 */
async function loadApplicableKpis({
  departmentId,
  period,
  connectionId,
  periodStart,
}: {
  departmentId: string;
  period: KpiPeriod;
  connectionId: string;
  periodStart: Date;
}): Promise<SubmittableKpi[]> {
  // Independent of one another (the submitted-ids lookup doesn't actually
  // need the KPI id list — connectionId+period+periodStart alone already
  // pins it to this connection's rows for this exact period), so they run
  // in parallel rather than as two serial round trips to the DB.
  const [kpiDefinitions, submitted] = await Promise.all([
    prisma.kpiDefinition.findMany({
      where: { departmentId, period },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        cluster: true,
        targetValue: true,
        direction: true,
        kpiConfigs: {
          where: { connectionId },
          select: { isApplicable: true, targetValue: true },
        },
      },
    }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period, periodStart },
      select: { kpiDefinitionId: true },
    }),
  ]);

  const applicable = kpiDefinitions.filter((kpi) => kpi.kpiConfigs[0]?.isApplicable ?? true);
  if (applicable.length === 0) return [];

  const submittedIds = new Set(submitted.map((s) => s.kpiDefinitionId));

  return applicable.map((kpi) => ({
    id: kpi.id,
    name: kpi.name,
    cluster: kpi.cluster,
    targetValue: kpi.targetValue,
    direction: kpi.direction,
    configTargetValue: kpi.kpiConfigs[0]?.targetValue ?? null,
    alreadySubmitted: submittedIds.has(kpi.id),
  }));
}

/**
 * Groups a department's KPIs (for one period) by their free-text `cluster`
 * field — e.g. Social Media's KPIs cluster into Facebook/Instagram/Pinterest/
 * etc. Used to let a VA pick one cluster at a time instead of scrolling a
 * flat list of every KPI the department has.
 *
 * `submittedCount` mirrors the isApplicable + already-submitted logic the
 * submission pages already apply per-KPI, so a cluster whose KPIs are all
 * done can be marked complete without a second query.
 */
export async function getKpiClusters(args: {
  departmentId: string;
  period: KpiPeriod;
  connectionId: string;
  periodStart: Date;
}): Promise<ClusterSummary[]> {
  const kpis = await loadApplicableKpis(args);

  const byCluster = new Map<string, { total: number; done: number }>();
  for (const kpi of kpis) {
    const entry = byCluster.get(kpi.cluster) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (kpi.alreadySubmitted) entry.done += 1;
    byCluster.set(kpi.cluster, entry);
  }

  return [...byCluster.entries()]
    .map(([cluster, { total, done }]) => ({
      cluster,
      kpiCount: total,
      submittedCount: done,
    }))
    .sort((a, b) => a.cluster.localeCompare(b.cluster));
}

/**
 * Same underlying KPI set as getKpiClusters, but as a flat per-KPI list
 * grouped by cluster rather than aggregate counts — feeds the "view all
 * clusters" form, which renders every area's fields on one page instead of
 * one area at a time. `excludeSubmitted` drops KPIs that already have a
 * PerformanceSummary row (VAs can't resubmit a finalized KPI; managers
 * correcting a period pass `excludeSubmitted: false` to see everything).
 */
export async function getSubmittableKpis(
  args: {
    departmentId: string;
    period: KpiPeriod;
    connectionId: string;
    periodStart: Date;
  },
  { excludeSubmitted = false }: { excludeSubmitted?: boolean } = {},
): Promise<KpiClusterGroup[]> {
  const kpis = await loadApplicableKpis(args);
  const filtered = excludeSubmitted ? kpis.filter((kpi) => !kpi.alreadySubmitted) : kpis;

  const byCluster = new Map<string, SubmittableKpi[]>();
  for (const kpi of filtered) {
    const list = byCluster.get(kpi.cluster) ?? [];
    list.push(kpi);
    byCluster.set(kpi.cluster, list);
  }

  return [...byCluster.entries()]
    .map(([cluster, clusterKpis]) => ({ cluster, kpis: clusterKpis }))
    .sort((a, b) => a.cluster.localeCompare(b.cluster));
}

/**
 * Groups any list of items with a `kpiDefinition.cluster` field (e.g.
 * PerformanceSummary rows) by that cluster, sorted by cluster name. Used on
 * the success screen — a period can accumulate submissions from more than
 * one cluster, and several clusters share KPI names (e.g. Facebook and
 * Instagram both have an "Engagement Rate"), so a flat list reads as
 * duplicates unless it's broken out by cluster.
 */
export function groupByCluster<T extends { kpiDefinition: { cluster: string } }>(
  items: T[],
): { cluster: string; items: T[] }[] {
  const byCluster = new Map<string, T[]>();
  for (const item of items) {
    const cluster = item.kpiDefinition.cluster;
    const list = byCluster.get(cluster) ?? [];
    list.push(item);
    byCluster.set(cluster, list);
  }
  return [...byCluster.entries()]
    .map(([cluster, clusterItems]) => ({ cluster, items: clusterItems }))
    .sort((a, b) => a.cluster.localeCompare(b.cluster));
}
