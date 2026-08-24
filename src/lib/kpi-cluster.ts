import { prisma } from "@/lib/prisma";
import { KpiPeriod } from "@/generated/prisma/enums";

export type ClusterSummary = {
  cluster: string;
  kpiCount: number;
  submittedCount: number;
};

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
export async function getKpiClusters({
  departmentId,
  period,
  connectionId,
  periodStart,
}: {
  departmentId: string;
  period: KpiPeriod;
  connectionId: string;
  periodStart: Date;
}): Promise<ClusterSummary[]> {
  const kpiDefinitions = await prisma.kpiDefinition.findMany({
    where: { departmentId, period },
    select: {
      id: true,
      cluster: true,
      kpiConfigs: { where: { connectionId }, select: { isApplicable: true } },
    },
  });

  const applicable = kpiDefinitions.filter(
    (kpi) => (kpi.kpiConfigs[0]?.isApplicable ?? true),
  );
  if (applicable.length === 0) return [];

  const submitted = await prisma.performanceSummary.findMany({
    where: {
      connectionId,
      periodStart,
      kpiDefinitionId: { in: applicable.map((kpi) => kpi.id) },
    },
    select: { kpiDefinitionId: true },
  });
  const submittedIds = new Set(submitted.map((s) => s.kpiDefinitionId));

  const byCluster = new Map<string, { total: number; done: number }>();
  for (const kpi of applicable) {
    const entry = byCluster.get(kpi.cluster) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (submittedIds.has(kpi.id)) entry.done += 1;
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
