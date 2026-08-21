"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

export type ConnectionWeekKpiRow = {
  kpiDefinitionId: string;
  name: string;
  targetValue: number;
  actualValue: number | null;
  status: PerformanceStatus;
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
 * Legacy's `openConnWeekDetail()` popup (Performance Summary row click) —
 * every applicable KPI for the connection's Weekly period, joined against
 * whatever PerformanceSummary rows exist for that specific week (there are
 * none at all if the VA never submitted, same gap the "No submission
 * received" banner surfaces). Mirrors the applicable-KPI computation in
 * getKpiConfigDetail (department/service match, KpiConfig override, and
 * isApplicable opt-out).
 */
export async function getConnectionWeekDetail(
  connectionId: string,
  periodStart: string,
): Promise<ConnectionWeekDetail> {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: { vaUser: true, team: { include: { teamLeader: true } } },
  });
  if (!connection) throw new Error("Connection not found.");

  const periodStartDate = new Date(periodStart);

  const [configs, applicableKpis, summaries, interventions] = await Promise.all([
    prisma.kpiConfig.findMany({
      where: { connectionId },
    }),
    prisma.kpiDefinition.findMany({
      where: {
        period: KpiPeriod.WEEKLY,
        departmentId: connection.departmentId,
        OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
      },
      orderBy: { name: "asc" },
    }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period: KpiPeriod.WEEKLY, periodStart: periodStartDate },
    }),
    prisma.intervention.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const configByKpi = new Map(configs.map((c) => [c.kpiDefinitionId, c]));
  const summaryByKpi = new Map(summaries.map((s) => [s.kpiDefinitionId, s]));

  const kpiRows: ConnectionWeekKpiRow[] = applicableKpis
    .filter((kpi) => configByKpi.get(kpi.id)?.isApplicable ?? true)
    .map((kpi) => {
      const config = configByKpi.get(kpi.id);
      const summary = summaryByKpi.get(kpi.id);
      return {
        kpiDefinitionId: kpi.id,
        name: kpi.name,
        targetValue: config?.targetValue ?? kpi.targetValue,
        actualValue: summary?.actualValue ?? null,
        status: summary?.status ?? PerformanceStatus.NO_DATA,
      };
    });

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
