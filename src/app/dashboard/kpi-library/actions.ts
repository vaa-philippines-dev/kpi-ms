"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessDepartment, type ScopingSession } from "@/lib/connection-scope";
import { logActivity, diffFields } from "@/lib/activity-log";
import { KpiDirection, KpiPeriod, ThresholdUnit } from "@/generated/prisma/enums";

async function requireManager(): Promise<ScopingSession> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER" && role !== "OM") {
    throw new Error("Only Admins, DMs, Ops Managers, or OMs can manage the KPI Library.");
  }
  return {
    id: session!.user!.id,
    role,
    departmentId: session!.user!.departmentId,
    teamId: session!.user!.teamId,
  };
}

async function assertDepartmentAccess(session: ScopingSession, departmentId: string) {
  if (!canAccessDepartment(session, departmentId)) {
    throw new Error("You can only manage KPIs in your own department.");
  }
}

async function findAccessibleKpi(session: ScopingSession, id: string) {
  const existing = await prisma.kpiDefinition.findUnique({
    where: { id },
    select: { departmentId: true },
  });
  if (!existing || !canAccessDepartment(session, existing.departmentId)) {
    throw new Error("KPI not found.");
  }
  return existing;
}

function numberOrDefault(formData: FormData, key: string, fallback: number) {
  const raw = formData.get(key);
  if (raw === null || raw === "") return fallback;
  return Number(raw);
}

function optionalId(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "");
  return value === "" ? null : value;
}

function parseKpiForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const cluster = String(formData.get("cluster") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  // Optional — null means the KPI applies to every connection in the
  // department; set, it scopes the KPI to connections in that service only
  // (see kpi-config/actions.ts and lib/alerts.ts, which both filter on this).
  const serviceId = optionalId(formData, "serviceId");
  const direction = String(formData.get("direction") ?? "") as KpiDirection;
  const period = String(formData.get("period") ?? "") as KpiPeriod;
  // Display format for targetValue/actualValue — "Number" (2 decimals),
  // "%", a custom string, or null for none. See lib/kpi-format.ts.
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const targetValue = Number(formData.get("targetValue"));
  const deviationThresholdPct = numberOrDefault(
    formData,
    "deviationThresholdPct",
    10,
  );
  const criticalThresholdPct = numberOrDefault(
    formData,
    "criticalThresholdPct",
    25,
  );
  const thresholdUnit = (String(formData.get("thresholdUnit") ?? "") ||
    ThresholdUnit.PERCENT) as ThresholdUnit;

  if (
    !name ||
    !cluster ||
    !departmentId ||
    !Object.values(KpiDirection).includes(direction) ||
    !Object.values(KpiPeriod).includes(period) ||
    !Object.values(ThresholdUnit).includes(thresholdUnit) ||
    Number.isNaN(targetValue) ||
    Number.isNaN(deviationThresholdPct) ||
    Number.isNaN(criticalThresholdPct)
  ) {
    throw new Error("Missing or invalid KPI fields.");
  }

  return {
    name,
    cluster,
    departmentId,
    serviceId,
    direction,
    period,
    unit,
    targetValue,
    deviationThresholdPct,
    criticalThresholdPct,
    thresholdUnit,
  };
}

export async function createKpiDefinition(formData: FormData) {
  const session = await requireManager();
  const data = parseKpiForm(formData);
  await assertDepartmentAccess(session, data.departmentId);
  const kpi = await prisma.kpiDefinition.create({ data });
  await logActivity(prisma, {
    actor: session,
    action: "CREATE",
    entityType: "KpiDefinition",
    entityId: kpi.id,
    entityLabel: `${kpi.name} (${kpi.cluster}, ${kpi.period})`,
    summary: `Created KPI "${kpi.name}" in ${kpi.cluster}`,
    departmentId: kpi.departmentId,
  });
  revalidatePath("/dashboard/kpi-library");
}

export async function updateKpiDefinition(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing KPI id.");
  const data = parseKpiForm(formData);
  // Check both the KPI's current department and the one it's being moved
  // to — a manager can't edit their way into or out of another department.
  await findAccessibleKpi(session, id);
  await assertDepartmentAccess(session, data.departmentId);
  const before = await prisma.kpiDefinition.findUniqueOrThrow({ where: { id } });
  const kpi = await prisma.kpiDefinition.update({ where: { id }, data });
  const changes = diffFields(before, data, [
    "name",
    "cluster",
    "departmentId",
    "serviceId",
    "direction",
    "period",
    "unit",
    "targetValue",
    "deviationThresholdPct",
    "criticalThresholdPct",
    "thresholdUnit",
  ]);
  if (changes.length > 0) {
    await logActivity(prisma, {
      actor: session,
      action: "UPDATE",
      entityType: "KpiDefinition",
      entityId: kpi.id,
      entityLabel: `${kpi.name} (${kpi.cluster}, ${kpi.period})`,
      summary: `Edited KPI "${kpi.name}" — ${changes.map((c) => c.field).join(", ")}`,
      changes,
      departmentId: kpi.departmentId,
    });
  }
  revalidatePath("/dashboard/kpi-library");
}

export async function deleteKpiDefinition(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await findAccessibleKpi(session, id);
  const kpi = await prisma.kpiDefinition.findUnique({ where: { id } });
  try {
    await prisma.kpiDefinition.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a KPI that already has submissions recorded against it.");
  }
  await logActivity(prisma, {
    actor: session,
    action: "DELETE",
    entityType: "KpiDefinition",
    entityId: id,
    entityLabel: kpi ? `${kpi.name} (${kpi.cluster}, ${kpi.period})` : id,
    summary: `Deleted KPI "${kpi?.name ?? id}"`,
    departmentId: existing.departmentId,
  });
  revalidatePath("/dashboard/kpi-library");
}

// Same access rules as deleteKpiDefinition, but for the case a manager
// wants the KPI gone regardless of the history attached to it — wipes every
// SubmissionRecord/SubmissionDraft/PerformanceSummary/KpiConfig(+History)
// row referencing this KpiDefinition first (none of those relations cascade
// at the DB level, so the plain delete above always fails once any exist),
// then the KpiDefinition itself, all in one transaction. Irreversible: the
// UI only offers this after the safe delete above has already been
// rejected, and gates it behind retyping the KPI's name.
export async function forceDeleteKpiDefinition(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const existing = await findAccessibleKpi(session, id);
  const kpi = await prisma.kpiDefinition.findUnique({ where: { id } });

  const counts = await prisma.$transaction(async (tx) => {
    // Sequential, and in this order specifically: KpiConfigHistory rows
    // must go before the KpiConfig rows they reference (its own FK target),
    // and that lookup joins through KpiConfig while it still exists.
    // PerformanceSummary/SubmissionRecord/SubmissionDraft have no such
    // ordering constraint between each other, but keeping everything
    // sequential inside one transaction avoids relying on that being safe.
    const historyCount = await tx.kpiConfigHistory.deleteMany({
      where: { kpiConfig: { kpiDefinitionId: id } },
    });
    const configCount = await tx.kpiConfig.deleteMany({ where: { kpiDefinitionId: id } });
    const summaryCount = await tx.performanceSummary.deleteMany({ where: { kpiDefinitionId: id } });
    const submissionCount = await tx.submissionRecord.deleteMany({ where: { kpiDefinitionId: id } });
    const draftCount = await tx.submissionDraft.deleteMany({ where: { kpiDefinitionId: id } });
    await tx.kpiDefinition.delete({ where: { id } });
    return {
      history: historyCount.count,
      configs: configCount.count,
      summaries: summaryCount.count,
      submissions: submissionCount.count,
      drafts: draftCount.count,
    };
  });

  await logActivity(prisma, {
    actor: session,
    action: "DELETE",
    entityType: "KpiDefinition",
    entityId: id,
    entityLabel: kpi ? `${kpi.name} (${kpi.cluster}, ${kpi.period})` : id,
    summary:
      `Force-deleted KPI "${kpi?.name ?? id}" along with ${counts.submissions} submission(s), ` +
      `${counts.summaries} performance summary row(s), ${counts.configs} config override(s), ` +
      `and ${counts.drafts} in-progress draft(s)`,
    departmentId: existing.departmentId,
  });
  revalidatePath("/dashboard/kpi-library");
}

// Lightweight move used by the By Cluster view's drag-and-drop — reassigns
// only the `cluster` field instead of round-tripping the full KPI form.
export async function moveKpiCluster(id: string, cluster: string) {
  const session = await requireManager();
  const trimmed = cluster.trim();
  if (!id || !trimmed) {
    throw new Error("Missing KPI id or cluster name.");
  }
  const existing = await findAccessibleKpi(session, id);
  const before = await prisma.kpiDefinition.findUnique({ where: { id } });
  const kpi = await prisma.kpiDefinition.update({ where: { id }, data: { cluster: trimmed } });
  if (before && before.cluster !== trimmed) {
    await logActivity(prisma, {
      actor: session,
      action: "UPDATE",
      entityType: "KpiDefinition",
      entityId: kpi.id,
      entityLabel: `${kpi.name} (${kpi.cluster}, ${kpi.period})`,
      summary: `Moved KPI "${kpi.name}" to cluster "${trimmed}"`,
      changes: [{ field: "cluster", oldValue: before.cluster, newValue: trimmed }],
      departmentId: existing.departmentId,
    });
  }
  revalidatePath("/dashboard/kpi-library");
}
