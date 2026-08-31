"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import { recomputePerformanceSummary } from "@/lib/performance";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { logActivity } from "@/lib/activity-log";
import { KpiDirection, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

// "Change a VA's wrongly-submitted date" — Admin, DM, the DM-equivalent
// OPS_MANAGER, and OM (Team Leader) can all correct/remove a submission,
// each still scoped to their own connectionScopeWhere() visibility below.
const SUBMISSION_EDITOR_ROLES = ["ADMIN", "DM", "OPS_MANAGER", "OM"];

async function requireSubmissionEditor(): Promise<ScopingSession> {
  const session = await requireSession();
  if (!SUBMISSION_EDITOR_ROLES.includes(session.role)) {
    throw new Error("Only Admins, DMs, Ops Managers, or Team Leaders can edit submissions.");
  }
  return session;
}

async function assertConnectionInScope(connectionId: string, session: ScopingSession) {
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    select: { id: true, clientName: true, departmentId: true },
  });
  if (!connection) {
    throw new Error("Connection not found or not in your scope.");
  }
  return connection;
}

function revalidateAffectedPages() {
  revalidatePath("/dashboard/submissions");
  revalidatePath("/dashboard/reports/va-kpi-sheet");
  revalidatePath("/dashboard/performance");
}

export type SubmissionRow = {
  id: string;
  period: KpiPeriod;
  periodStart: string;
  submittedAt: string;
  values: { recordId: string; kpiDefinitionId: string; kpiName: string; value: number | null; noData: boolean }[];
};

/** Read-only, scope-checked — mirrors getConnectionPerformance's pattern in
 * connections/actions.ts (fetched on-demand when the edit modal opens). */
export async function getSubmissionsForConnection(
  connectionId: string,
): Promise<SubmissionRow[]> {
  const session = await requireSubmissionEditor();
  await assertConnectionInScope(connectionId, session);

  const submissions = await prisma.submission.findMany({
    where: { connectionId },
    orderBy: { submittedAt: "desc" },
    take: 20,
    include: { records: { include: { kpiDefinition: true } } },
  });

  return submissions.map((s) => ({
    id: s.id,
    period: s.period,
    periodStart: s.periodStart.toISOString(),
    submittedAt: s.submittedAt.toISOString(),
    values: s.records.map((r) => ({
      recordId: r.id,
      kpiDefinitionId: r.kpiDefinitionId,
      kpiName: r.kpiDefinition.name,
      value: r.value,
      noData: r.noData,
    })),
  }));
}

export type ConnectionPeriodKpiRow = {
  kpiDefinitionId: string;
  name: string;
  unit: string | null;
  direction: KpiDirection;
  targetValue: number;
  actualValue: number | null;
  status: PerformanceStatus;
  // True when nothing was submitted for this KPI this period — distinct
  // from a genuine PerformanceStatus.NO_DATA that could in principle be
  // computed from a real (zero-valued) submission.
  missing: boolean;
};

export type ConnectionPeriodDetail = {
  connectionId: string;
  clientName: string;
  vaName: string;
  departmentName: string;
  teamName: string | null;
  period: KpiPeriod;
  periodStart: string;
  kpiRows: ConnectionPeriodKpiRow[];
  missingCount: number;
  totalCount: number;
  submissions: SubmissionRow[];
};

// Missing KPIs surface first (that's the actionable part), then worst
// performance status first — NO_DATA sorts last here since by this point
// it only means "has data but nothing to flag", the opposite of `missing`.
const DETAIL_STATUS_SEVERITY: Record<PerformanceStatus, number> = {
  [PerformanceStatus.CRITICAL]: 0,
  [PerformanceStatus.AT_RISK]: 1,
  [PerformanceStatus.ON_TARGET]: 2,
  [PerformanceStatus.NO_DATA]: 3,
};

/**
 * Backs the "view actual data" popup on the Current Period Status tracker —
 * clicking a VA there previously only opened the raw edit/delete log
 * (SubmissionEditModal), with no way to see what was actually submitted
 * against target, or which of the connection's KPIs never came in at all.
 * Read-only aside from the edit/delete actions already exposed elsewhere in
 * this file; scoped to exactly the row's period/periodStart, not the
 * connection's full history.
 */
export async function getConnectionPeriodDetail(
  connectionId: string,
  period: KpiPeriod,
  periodStart: string,
): Promise<ConnectionPeriodDetail> {
  const session = await requireSubmissionEditor();
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: { vaUser: { include: { team: true } }, department: true },
  });
  if (!connection) {
    throw new Error("Connection not found or not in your scope.");
  }

  const periodStartDate = new Date(periodStart);

  const [configs, summaries, applicableKpis, submissions] = await Promise.all([
    prisma.kpiConfig.findMany({ where: { connectionId } }),
    prisma.performanceSummary.findMany({
      where: { connectionId, period, periodStart: periodStartDate },
      include: { kpiDefinition: true },
    }),
    prisma.kpiDefinition.findMany({
      where: {
        period,
        departmentId: connection.departmentId,
        OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
      },
      orderBy: { name: "asc" },
    }),
    prisma.submission.findMany({
      where: { connectionId, period, periodStart: periodStartDate },
      orderBy: { submittedAt: "desc" },
      include: { records: { include: { kpiDefinition: true } } },
    }),
  ]);

  const configByKpi = new Map(configs.map((c) => [c.kpiDefinitionId, c]));
  const summaryByKpi = new Map(summaries.map((s) => [s.kpiDefinitionId, s]));
  // Ground truth for "missing" is an actual SubmissionRecord, not a null
  // PerformanceSummary.actualValue — a KPI a VA explicitly marked "no data
  // available" also ends up with a null actualValue, and would otherwise be
  // indistinguishable here from one nobody has touched at all.
  const submittedKpiIds = new Set(submissions.flatMap((s) => s.records.map((r) => r.kpiDefinitionId)));

  const kpiRows: ConnectionPeriodKpiRow[] = applicableKpis
    .filter((kpi) => configByKpi.get(kpi.id)?.isApplicable ?? true)
    .map((kpi) => {
      const summary = summaryByKpi.get(kpi.id);
      const config = configByKpi.get(kpi.id);
      const missing = !submittedKpiIds.has(kpi.id);
      return {
        kpiDefinitionId: kpi.id,
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        targetValue: summary?.targetValue ?? config?.targetValue ?? kpi.targetValue,
        actualValue: summary?.actualValue ?? null,
        status: summary?.status ?? PerformanceStatus.NO_DATA,
        missing,
      };
    })
    .sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? -1 : 1;
      return DETAIL_STATUS_SEVERITY[a.status] - DETAIL_STATUS_SEVERITY[b.status];
    });

  return {
    connectionId: connection.id,
    clientName: connection.clientName,
    vaName: connection.vaUser.name ?? connection.vaUser.email,
    departmentName: connection.department.name,
    // Blank when the VA's home team is outside this connection's own
    // department (hybrid VA) — see submissions/page.tsx's trackerRows for
    // the same rule applied to the tracker table this modal opens from.
    teamName:
      connection.vaUser.team?.departmentId === connection.departmentId
        ? (connection.vaUser.team?.name ?? null)
        : null,
    period,
    periodStart: periodStartDate.toISOString(),
    kpiRows,
    missingCount: kpiRows.filter((r) => r.missing).length,
    totalCount: kpiRows.length,
    submissions: submissions.map((s) => ({
      id: s.id,
      period: s.period,
      periodStart: s.periodStart.toISOString(),
      submittedAt: s.submittedAt.toISOString(),
      values: s.records.map((r) => ({
        recordId: r.id,
        kpiDefinitionId: r.kpiDefinitionId,
        kpiName: r.kpiDefinition.name,
        value: r.value,
        noData: r.noData,
      })),
    })),
  };
}

export type SubmissionRecordEdit = { recordId: string; value: number | null; noData: boolean };

/** Moves a submission to a different period/date (e.g. a VA submitted
 * against the wrong week) and/or corrects the actual value(s) a VA
 * submitted for one or more of its KPIs — e.g. a typo'd number. Both are
 * optional and independent; either can be applied alone. Recomputes the
 * aggregate for whichever period(s) end up holding this submission's
 * values, since PerformanceSummary is a sum over every submission in a
 * period, not just this one. */
export async function updateSubmission(formData: FormData) {
  const session = await requireSubmissionEditor();
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) {
    throw new Error("Missing submission id.");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { records: true },
  });
  if (!submission) {
    throw new Error("Submission not found.");
  }
  const connection = await assertConnectionInScope(submission.connectionId, session);

  const periodRaw = formData.get("period");
  const dateRaw = formData.get("date");
  let newPeriod = submission.period;
  let newPeriodStart = submission.periodStart;
  if (typeof periodRaw === "string" && periodRaw && typeof dateRaw === "string" && dateRaw) {
    if (!Object.values(KpiPeriod).includes(periodRaw as KpiPeriod) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      throw new Error("Invalid period or date.");
    }
    const weekStartDay = await getWeekStartDay();
    newPeriod = periodRaw as KpiPeriod;
    newPeriodStart = currentPeriodStart(newPeriod, parseAnchorDate(dateRaw), weekStartDay);
  }

  const recordsRaw = formData.get("records");
  let recordEdits: SubmissionRecordEdit[] = [];
  if (typeof recordsRaw === "string" && recordsRaw) {
    try {
      recordEdits = JSON.parse(recordsRaw);
    } catch {
      throw new Error("Invalid record edits.");
    }
    const validRecordIds = new Set(submission.records.map((r) => r.id));
    for (const edit of recordEdits) {
      if (!validRecordIds.has(edit.recordId)) {
        throw new Error("Record does not belong to this submission.");
      }
    }
  }

  const periodChanged =
    newPeriod !== submission.period || newPeriodStart.getTime() !== submission.periodStart.getTime();
  if (!periodChanged && recordEdits.length === 0) {
    return;
  }

  const { connectionId, period: oldPeriod, periodStart: oldPeriodStart } = submission;
  const kpiDefinitionIds = submission.records.map((r) => r.kpiDefinitionId);

  await prisma.$transaction(async (tx) => {
    if (periodChanged) {
      await tx.submission.update({
        where: { id: submissionId },
        data: { period: newPeriod, periodStart: newPeriodStart },
      });
    }
    for (const edit of recordEdits) {
      await tx.submissionRecord.update({
        where: { id: edit.recordId },
        data: { value: edit.noData ? null : edit.value, noData: edit.noData },
      });
    }

    if (periodChanged) {
      // Old period's aggregate loses this submission's values...
      await recomputePerformanceSummary(tx, {
        connectionId,
        period: oldPeriod,
        periodStart: oldPeriodStart,
        kpiDefinitionIds,
      });
    }
    // ...the (possibly same) period's aggregate picks up the current values.
    await recomputePerformanceSummary(tx, {
      connectionId,
      period: newPeriod,
      periodStart: newPeriodStart,
      kpiDefinitionIds,
    });

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    if (periodChanged) {
      changes.push({ field: "period", oldValue: oldPeriod, newValue: newPeriod });
      changes.push({
        field: "periodStart",
        oldValue: oldPeriodStart.toISOString(),
        newValue: newPeriodStart.toISOString(),
      });
    }
    if (recordEdits.length > 0) {
      changes.push({ field: "records", oldValue: null, newValue: JSON.stringify(recordEdits) });
    }
    const summaryParts: string[] = [];
    if (periodChanged) {
      summaryParts.push(
        `moved from ${oldPeriodStart.toISOString().slice(0, 10)} (${oldPeriod}) to ${newPeriodStart.toISOString().slice(0, 10)} (${newPeriod})`,
      );
    }
    if (recordEdits.length > 0) {
      summaryParts.push(`edited ${recordEdits.length} KPI value${recordEdits.length === 1 ? "" : "s"}`);
    }
    await logActivity(tx, {
      actor: session,
      action: "UPDATE",
      entityType: "Submission",
      entityId: submissionId,
      entityLabel: connection.clientName,
      summary: `Updated a submission for "${connection.clientName}" — ${summaryParts.join(", ")}`,
      changes,
      departmentId: connection.departmentId,
    });
  });

  revalidateAffectedPages();
}

/** Deletes a wrongly-submitted submission entirely and recomputes the
 * aggregate it fed — never deletes the PerformanceSummary row itself, just
 * recomputes it, which naturally falls back to NO_DATA if nothing else
 * remains for that connection/KPI/period. */
export async function deleteSubmission(formData: FormData) {
  const session = await requireSubmissionEditor();
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) {
    throw new Error("Missing submission id.");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { records: true },
  });
  if (!submission) return;
  const connection = await assertConnectionInScope(submission.connectionId, session);

  const kpiDefinitionIds = submission.records.map((r) => r.kpiDefinitionId);
  const { connectionId, period, periodStart } = submission;

  await prisma.$transaction(async (tx) => {
    await tx.submissionRecord.deleteMany({ where: { submissionId } });
    await tx.submission.delete({ where: { id: submissionId } });
    await recomputePerformanceSummary(tx, { connectionId, period, periodStart, kpiDefinitionIds });
    await logActivity(tx, {
      actor: session,
      action: "DELETE",
      entityType: "Submission",
      entityId: submissionId,
      entityLabel: connection.clientName,
      summary: `Deleted a ${period.toLowerCase()} submission for "${connection.clientName}" (${periodStart.toISOString().slice(0, 10)})`,
      departmentId: connection.departmentId,
    });
  });

  revalidateAffectedPages();
}
