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

// Stricter than requireManager above — force-delete wipes real submission/
// performance history irreversibly, so unlike every other KPI Library
// action (create/edit/safe-delete), DM/Ops Manager/OM don't get it.
async function requireAdmin(): Promise<ScopingSession> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only Admins can force-delete a KPI along with its history.");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
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

function parseKpiForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const cluster = String(formData.get("cluster") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  // No services selected means the KPI applies to every connection in the
  // department; one or more selected scopes it to connections tagged into
  // any of those services (see kpi-config/actions.ts and lib/alerts.ts,
  // which both filter on this via kpiApplicabilityOR/kpiAppliesToServices).
  // The first selected service becomes the primary `serviceId` (kept for
  // display/back-compat), the rest become KpiDefinitionService rows.
  const serviceIds = [...new Set(formData.getAll("serviceIds").map(String).filter(Boolean))];
  const serviceId = serviceIds[0] ?? null;
  const additionalServiceIds = serviceIds.slice(1);
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
    additionalServiceIds,
    direction,
    period,
    unit,
    targetValue,
    deviationThresholdPct,
    criticalThresholdPct,
    thresholdUnit,
  };
}

async function assertServicesBelongToDepartment(serviceIds: string[], departmentId: string) {
  if (serviceIds.length === 0) return;
  const count = await prisma.service.count({ where: { id: { in: serviceIds }, departmentId } });
  if (count !== serviceIds.length) {
    throw new Error("One or more selected services do not belong to the selected department.");
  }
}

export async function createKpiDefinition(formData: FormData) {
  const session = await requireManager();
  const { additionalServiceIds, ...data } = parseKpiForm(formData);
  await assertDepartmentAccess(session, data.departmentId);
  await assertServicesBelongToDepartment(
    data.serviceId ? [data.serviceId, ...additionalServiceIds] : additionalServiceIds,
    data.departmentId,
  );
  const kpi = await prisma.kpiDefinition.create({
    data: {
      ...data,
      additionalServices: { create: additionalServiceIds.map((serviceId) => ({ serviceId })) },
    },
  });
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
  const { additionalServiceIds, ...data } = parseKpiForm(formData);
  // Check both the KPI's current department and the one it's being moved
  // to — a manager can't edit their way into or out of another department.
  await findAccessibleKpi(session, id);
  await assertDepartmentAccess(session, data.departmentId);
  await assertServicesBelongToDepartment(
    data.serviceId ? [data.serviceId, ...additionalServiceIds] : additionalServiceIds,
    data.departmentId,
  );
  const before = await prisma.kpiDefinition.findUniqueOrThrow({
    where: { id },
    include: { additionalServices: { select: { serviceId: true } } },
  });
  const beforeServiceIds = [before.serviceId, ...before.additionalServices.map((s) => s.serviceId)].filter(
    (v): v is string => v !== null,
  );
  const newServiceIds = data.serviceId ? [data.serviceId, ...additionalServiceIds] : [];
  const toRemove = beforeServiceIds.filter((s) => !newServiceIds.includes(s));
  const toAdd = additionalServiceIds.filter((s) => !beforeServiceIds.includes(s));

  const kpi = await prisma.$transaction(async (tx) => {
    const updated = await tx.kpiDefinition.update({ where: { id }, data });
    if (toRemove.length > 0) {
      await tx.kpiDefinitionService.deleteMany({
        where: { kpiDefinitionId: id, serviceId: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.kpiDefinitionService.createMany({
        data: toAdd.map((serviceId) => ({ kpiDefinitionId: id, serviceId })),
        skipDuplicates: true,
      });
    }
    return updated;
  });
  const changes = diffFields(
    { ...before, serviceIds: beforeServiceIds.slice().sort().join(",") },
    { ...data, serviceIds: newServiceIds.slice().sort().join(",") },
    [
      "name",
      "cluster",
      "departmentId",
      "serviceId",
      "serviceIds",
      "direction",
      "period",
      "unit",
      "targetValue",
      "deviationThresholdPct",
      "criticalThresholdPct",
      "thresholdUnit",
    ],
  );
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

// Returns `{ error }` instead of throwing for every expected failure mode
// (blocked by history, missing/inaccessible KPI, role check) — Next.js
// redacts a thrown Server Action Error's message in production and, for
// this particular call path, was surfacing the redacted throw as an
// uncaught client-side crash (minified React #441) instead of the friendly
// message DeleteKpiControl expects to key off of. Returning keeps the exact
// message intact and never crosses the server/client boundary as a throw.
export async function deleteKpiDefinition(
  formData: FormData,
): Promise<{ error: string } | undefined> {
  try {
    const session = await requireManager();
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const existing = await findAccessibleKpi(session, id);
    const kpi = await prisma.kpiDefinition.findUnique({ where: { id } });
    try {
      await prisma.kpiDefinition.delete({ where: { id } });
    } catch {
      return { error: "Can't delete a KPI that already has submissions recorded against it." };
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
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// Admin-only (see requireAdmin above) — wipes every SubmissionRecord/
// SubmissionDraft/PerformanceSummary/KpiConfig(+History) row referencing
// this KpiDefinition first (none of those relations cascade at the DB
// level, so the plain delete above always fails once any exist), then the
// KpiDefinition itself, all in one transaction. Irreversible: the UI only
// offers this after the safe delete above has already been rejected, and
// gates it behind retyping the KPI's name.
// See the comment on deleteKpiDefinition above — same "return, never throw"
// fix, for the same reason. This is the path a role-check rejection
// (non-Admin hitting the button some other way) or any transaction failure
// would otherwise crash the client on.
export async function forceDeleteKpiDefinition(
  formData: FormData,
): Promise<{ error: string } | undefined> {
  try {
    const session = await requireAdmin();
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
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
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
