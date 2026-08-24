"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { KpiDirection, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

export type ConnectionWeekKpiRow = {
  kpiDefinitionId: string;
  name: string;
  unit: string | null;
  direction: KpiDirection;
  targetValue: number;
  // Department/master default target — shown as "Benchmark: X" only when it
  // differs from this connection's configured targetValue (legacy's
  // AppSettings.html connection-detail popup).
  benchmarkValue: number | null;
  actualValue: number | null;
  status: PerformanceStatus;
};

const STATUS_SEVERITY: Record<PerformanceStatus, number> = {
  [PerformanceStatus.CRITICAL]: 0,
  [PerformanceStatus.AT_RISK]: 1,
  [PerformanceStatus.ON_TARGET]: 2,
  [PerformanceStatus.NO_DATA]: 3,
};

export type ConnectionWeekInterventionRow = {
  id: string;
  createdAtLabel: string;
  type: string;
  description: string;
  actionTaken: string | null;
};

export type ConnectionWeekDetail = {
  connectionId: string;
  clientName: string;
  shortCode: string | null;
  status: string;
  vaName: string;
  startDate: string | null;
  teamName: string | null;
  teamLeaderName: string | null;
  periodStart: string;
  hasSubmission: boolean;
  kpiRows: ConnectionWeekKpiRow[];
  interventions: ConnectionWeekInterventionRow[];
};

/**
 * Legacy's connection-detail popup (AppSettings.html's `openConnWeekDetail`,
 * the one with the Dir column and Benchmark subtitle) — when the week was
 * actually submitted, it shows only the KPIs present in that submission,
 * not the department/service's full KPI catalog; the full catalog (filtered
 * by KpiConfig.isApplicable) is a fallback for weeks with nothing submitted
 * yet. Showing the full catalog unconditionally — the previous bug here —
 * made every already-submitted week look padded with dozens of unrelated
 * "No Data" KPIs, since isApplicable is TRUE for nearly every KPI/connection
 * pair on both legacy and this system (never used as a real per-connection
 * filter in practice).
 */
export async function getConnectionWeekDetail(
  connectionId: string,
  periodStart: string,
  period: KpiPeriod = KpiPeriod.WEEKLY,
): Promise<ConnectionWeekDetail> {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: { vaUser: true, team: { include: { teamLeader: true } } },
  });
  if (!connection) throw new Error("Connection not found.");

  const periodStartDate = new Date(periodStart);

  const [configs, summaries, interventions] = await Promise.all([
    prisma.kpiConfig.findMany({
      where: { connectionId },
    }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period, periodStart: periodStartDate },
      include: { kpiDefinition: true },
    }),
    prisma.intervention.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const configByKpi = new Map(configs.map((c) => [c.kpiDefinitionId, c]));

  const benchmarkFor = (kpiDefinitionId: string, targetValue: number, masterTarget: number) => {
    const config = configByKpi.get(kpiDefinitionId);
    return config?.targetValue != null && config.targetValue !== masterTarget ? masterTarget : null;
  };

  let kpiRows: ConnectionWeekKpiRow[];
  if (summaries.length > 0) {
    kpiRows = summaries.map((s) => ({
      kpiDefinitionId: s.kpiDefinitionId,
      name: s.kpiDefinition.name,
      unit: s.kpiDefinition.unit,
      direction: s.kpiDefinition.direction,
      targetValue: s.targetValue,
      benchmarkValue: benchmarkFor(s.kpiDefinitionId, s.targetValue, s.kpiDefinition.targetValue),
      actualValue: s.actualValue,
      status: s.status,
    }));
  } else {
    const applicableKpis = await prisma.kpiDefinition.findMany({
      where: {
        period,
        departmentId: connection.departmentId,
        OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
      },
      orderBy: { name: "asc" },
    });
    kpiRows = applicableKpis
      .filter((kpi) => configByKpi.get(kpi.id)?.isApplicable ?? true)
      .map((kpi) => {
        const config = configByKpi.get(kpi.id);
        const targetValue = config?.targetValue ?? kpi.targetValue;
        return {
          kpiDefinitionId: kpi.id,
          name: kpi.name,
          unit: kpi.unit,
          direction: kpi.direction,
          targetValue,
          benchmarkValue: benchmarkFor(kpi.id, targetValue, kpi.targetValue),
          actualValue: null,
          status: PerformanceStatus.NO_DATA,
        };
      });
  }
  kpiRows.sort((a, b) => STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status]);

  return {
    connectionId: connection.id,
    clientName: connection.clientName,
    shortCode: connection.shortCode,
    status: connection.status,
    vaName: connection.vaUser.name ?? connection.vaUser.email,
    startDate: (connection.startDate ?? connection.createdAt).toISOString(),
    teamName: connection.team?.name ?? null,
    teamLeaderName: connection.team?.teamLeader?.name ?? connection.team?.teamLeader?.email ?? null,
    periodStart: periodStartDate.toISOString(),
    hasSubmission: summaries.length > 0,
    kpiRows,
    interventions: interventions.map((iv) => ({
      id: iv.id,
      createdAtLabel: iv.createdAt.toLocaleDateString(),
      type: iv.type,
      description: iv.description,
      actionTaken: iv.actionTaken,
    })),
  };
}
