"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import { recomputePerformanceSummary } from "@/lib/performance";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { KpiPeriod } from "@/generated/prisma/enums";

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
    select: { id: true },
  });
  if (!connection) {
    throw new Error("Connection not found or not in your scope.");
  }
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
  values: { kpiName: string; value: number | null; noData: boolean }[];
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
      kpiName: r.kpiDefinition.name,
      value: r.value,
      noData: r.noData,
    })),
  }));
}

/** Moves a submission to a different period/date — e.g. a VA submitted
 * against the wrong week. Recomputes the aggregate for both the period it's
 * leaving and the one it's landing on, since PerformanceSummary is a sum
 * over every submission in a period, not just this one. */
export async function updateSubmissionPeriod(formData: FormData) {
  const session = await requireSubmissionEditor();
  const submissionId = String(formData.get("submissionId") ?? "");
  const periodRaw = String(formData.get("period") ?? "");
  const dateRaw = String(formData.get("date") ?? "");

  if (
    !submissionId ||
    !Object.values(KpiPeriod).includes(periodRaw as KpiPeriod) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
  ) {
    throw new Error("Missing submission, period, or date.");
  }
  const period = periodRaw as KpiPeriod;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { records: true },
  });
  if (!submission) {
    throw new Error("Submission not found.");
  }
  await assertConnectionInScope(submission.connectionId, session);

  const weekStartDay = await getWeekStartDay();
  const newPeriodStart = currentPeriodStart(period, parseAnchorDate(dateRaw), weekStartDay);
  const kpiDefinitionIds = submission.records.map((r) => r.kpiDefinitionId);
  const { connectionId, period: oldPeriod, periodStart: oldPeriodStart } = submission;

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submissionId },
      data: { period, periodStart: newPeriodStart },
    });

    // Old period's aggregate loses this submission's values...
    await recomputePerformanceSummary(tx, {
      connectionId,
      period: oldPeriod,
      periodStart: oldPeriodStart,
      kpiDefinitionIds,
    });
    // ...the new period's aggregate picks them up (no-op if unchanged).
    await recomputePerformanceSummary(tx, {
      connectionId,
      period,
      periodStart: newPeriodStart,
      kpiDefinitionIds,
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
  await assertConnectionInScope(submission.connectionId, session);

  const kpiDefinitionIds = submission.records.map((r) => r.kpiDefinitionId);
  const { connectionId, period, periodStart } = submission;

  await prisma.$transaction(async (tx) => {
    await tx.submissionRecord.deleteMany({ where: { submissionId } });
    await tx.submission.delete({ where: { id: submissionId } });
    await recomputePerformanceSummary(tx, { connectionId, period, periodStart, kpiDefinitionIds });
  });

  revalidateAffectedPages();
}
