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
  // Whether THIS specific KPI has an actual SubmissionRecord for this
  // period — as opposed to `status` being NO_DATA because a submission
  // explicitly marked it "no data available". Lets the UI tell "nothing
  // submitted yet" apart from "submitted, and there's genuinely no data".
  submitted: boolean;
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
 * the one with the Dir column and Benchmark subtitle). Always shows the
 * department/service's full applicable KPI catalog (filtered by
 * KpiConfig.isApplicable), each row flagged with whether IT SPECIFICALLY has
 * been submitted this period — not just whether the connection has *any*
 * submission this period. A connection's KPIs are usually submitted one
 * cluster (e.g. "Tiktok Shop", "Instagram") at a time, so a connection-wide
 * "has this period been submitted" flag falsely marks every other
 * not-yet-submitted cluster as done the moment any one cluster is
 * submitted — see `hasSubmission` below, which now requires every
 * applicable KPI to be submitted, not just one.
 *
 * "Submitted" is read off actual SubmissionRecord rows, not off
 * PerformanceSummary presence — PerformanceSummary rows are never deleted
 * (recomputePerformanceSummary falls them back to NO_DATA instead) and can
 * in principle exist without ever having had a Submission behind them (e.g.
 * a direct legacy-sync write), so their mere existence doesn't reliably
 * prove a submission happened. Same reasoning as lib/connection-trend.ts and
 * commit 2d9cd9d's fix for the submissions tracker — just scoped per-KPI
 * here instead of per-connection.
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

  const [configs, applicableKpis, summaries, submittedRecords, interventions] = await Promise.all([
    prisma.kpiConfig.findMany({
      where: { connectionId },
    }),
    prisma.kpiDefinition.findMany({
      where: {
        period,
        departmentId: connection.departmentId,
        OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
      },
      orderBy: { name: "asc" },
    }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period, periodStart: periodStartDate },
    }),
    prisma.submissionRecord.findMany({
      where: { submission: { connectionId, period, periodStart: periodStartDate } },
      select: { kpiDefinitionId: true },
    }),
    prisma.intervention.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const configByKpi = new Map(configs.map((c) => [c.kpiDefinitionId, c]));
  const summaryByKpi = new Map(summaries.map((s) => [s.kpiDefinitionId, s]));
  const submittedKpiIds = new Set(submittedRecords.map((r) => r.kpiDefinitionId));

  const benchmarkFor = (kpiDefinitionId: string, targetValue: number, masterTarget: number) => {
    const config = configByKpi.get(kpiDefinitionId);
    return config?.targetValue != null && config.targetValue !== masterTarget ? masterTarget : null;
  };

  const applicable = applicableKpis.filter((kpi) => configByKpi.get(kpi.id)?.isApplicable ?? true);

  const kpiRows: ConnectionWeekKpiRow[] = applicable.map((kpi) => {
    const config = configByKpi.get(kpi.id);
    const targetValue = config?.targetValue ?? kpi.targetValue;
    const summary = summaryByKpi.get(kpi.id);
    const submitted = submittedKpiIds.has(kpi.id);
    return {
      kpiDefinitionId: kpi.id,
      name: kpi.name,
      unit: kpi.unit,
      direction: kpi.direction,
      targetValue: summary?.targetValue ?? targetValue,
      benchmarkValue: benchmarkFor(kpi.id, summary?.targetValue ?? targetValue, kpi.targetValue),
      actualValue: submitted ? (summary?.actualValue ?? null) : null,
      status: submitted ? (summary?.status ?? PerformanceStatus.NO_DATA) : PerformanceStatus.NO_DATA,
      submitted,
    };
  });
  // Not-yet-submitted rows sink below every real status (including a
  // genuine "submitted, no data" NO_DATA), so an incomplete cluster reads
  // as clearly outstanding rather than blending in with the rest.
  kpiRows.sort((a, b) => {
    const rankA = a.submitted ? STATUS_SEVERITY[a.status] : 4;
    const rankB = b.submitted ? STATUS_SEVERITY[b.status] : 4;
    return rankA - rankB;
  });

  const hasSubmission = applicable.length > 0 && applicable.every((kpi) => submittedKpiIds.has(kpi.id));

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
    hasSubmission,
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
