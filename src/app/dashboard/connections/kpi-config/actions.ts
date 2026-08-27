"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import { logActivity } from "@/lib/activity-log";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";

// Editing KPI config is open to ADMIN, DM (Manager), the DM-equivalent
// OPS_MANAGER, and OM (Team Leader) — matching the KPI Library's editor
// roles (kpi-library/actions.ts) — each locked to the connections they can
// already see via connectionScopeWhere (DM/OPS_MANAGER: own department, OM:
// own team's connections), same "lock to session, ignore what the client
// claims" pattern as connections/actions.ts's requireConnectionCreator.
// Uses the real signed-in session (auth()), not requireSession()'s
// view-as-aware one, so an admin previewing another role can't accidentally
// perform a write as that role.
async function requireKpiConfigEditor(): Promise<ScopingSession> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER" && role !== "OM") {
    throw new Error("You don't have permission to manage KPI config.");
  }
  return {
    id: session!.user.id,
    role,
    departmentId: session!.user.departmentId,
    teamId: session!.user.teamId,
  };
}

export type KpiConfigPeriodInfo = {
  kpiDefinitionId: string;
  configId: string | null; // null = not yet configured, showing the KPI Library default
  targetValue: number;
  defaultTargetValue: number;
};

// One row per (name, cluster) pair, merging the Weekly and Monthly
// KpiDefinition rows a single legacy KPI maps to (same name/cluster,
// different period) into the columns the UI shows side by side.
// Deviation/critical/applicable/notes are edited as one shared value across
// both periods (see updateKpiConfig), even though they're stored per-period
// underneath.
export type KpiConfigGroupRow = {
  // Legacy's KPI_Master keys applicability off ServiceID alone, never
  // Cluster (see KPIConfig.js's `k.ServiceID === serviceId` filter — no
  // cluster check), so two KPIs can legitimately share a name AND a
  // service (e.g. "ACoS" defined once for the "Amazon PPC" cluster and
  // again for "Walmart PPC") and both apply to the same connection. Ported
  // as-is from legacy; cluster is shown here so the two don't read as an
  // accidental duplicate.
  key: string;
  name: string;
  cluster: string;
  unit: string | null;
  direction: KpiDirection;
  weekly: KpiConfigPeriodInfo | null;
  monthly: KpiConfigPeriodInfo | null;
  deviationThresholdPct: number;
  criticalThresholdPct: number;
  isApplicable: boolean;
  notes: string | null;
  hasOverride: boolean;
};

// Lazily loaded when a row's modal opens, rather than preloading every
// connection's config detail up front (this system has ~11k KpiConfig
// rows total — sending all of it to the browser on page load just in
// case a row gets clicked isn't worth it when the master table only
// needs a per-connection has-config flag).
//
// Viewing is open to every role (matching the read-only view the old
// per-connection page gave non-admins) — only the mutating actions below
// are admin-gated. Since a non-admin can now legitimately call this, it's
// scoped the same way every other connectionId-keyed query in the app is
// (connectionScopeWhere), not just gated by role.
export async function getKpiConfigDetail(connectionId: string) {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
  });
  if (!connection) throw new Error("Connection not found.");

  const [configs, applicableKpis] = await Promise.all([
    prisma.kpiConfig.findMany({
      where: { connectionId },
      include: { kpiDefinition: true },
      orderBy: [{ kpiDefinition: { name: "asc" } }, { kpiDefinition: { cluster: "asc" } }, { kpiDefinition: { period: "asc" } }],
    }),
    prisma.kpiDefinition.findMany({
      where: {
        departmentId: connection.departmentId,
        OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
      },
      orderBy: [{ name: "asc" }, { cluster: "asc" }, { period: "asc" }],
    }),
  ]);

  const configByDefId = new Map(configs.map((c) => [c.kpiDefinitionId, c]));

  // Group by (name, cluster) so a KPI's Weekly and Monthly KpiDefinition
  // rows land in one KpiConfigGroupRow with side-by-side target columns,
  // in the same order applicableKpis was fetched in (name, cluster, period).
  const groups = new Map<string, KpiConfigGroupRow>();
  for (const def of applicableKpis) {
    const key = `${def.name}::${def.cluster}`;
    const config = configByDefId.get(def.id) ?? null;
    const periodInfo: KpiConfigPeriodInfo = {
      kpiDefinitionId: def.id,
      configId: config?.id ?? null,
      targetValue: config?.targetValue ?? def.targetValue,
      defaultTargetValue: def.targetValue,
    };

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: def.name,
        cluster: def.cluster,
        unit: def.unit,
        direction: def.direction,
        weekly: null,
        monthly: null,
        deviationThresholdPct: config?.deviationThresholdPct ?? def.deviationThresholdPct,
        criticalThresholdPct: config?.criticalThresholdPct ?? def.criticalThresholdPct,
        isApplicable: config?.isApplicable ?? true,
        notes: config?.notes ?? null,
        hasOverride: false,
      };
      groups.set(key, group);
    }
    if (config) {
      // Deviation/critical/applicable/notes are shared across both periods
      // in the UI — prefer whichever period already has an override so an
      // existing customization isn't masked by the other period's default.
      group.deviationThresholdPct = config.deviationThresholdPct ?? group.deviationThresholdPct;
      group.criticalThresholdPct = config.criticalThresholdPct ?? group.criticalThresholdPct;
      group.isApplicable = config.isApplicable;
      group.notes = config.notes ?? group.notes;
      group.hasOverride = true;
    }
    if (def.period === KpiPeriod.WEEKLY) group.weekly = periodInfo;
    else group.monthly = periodInfo;
  }

  return {
    missingCount: applicableKpis.length - configs.length,
    rows: Array.from(groups.values()),
  };
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === "") return null;
  return Number(raw);
}

// Generates one KpiConfig row per applicable KpiDefinition for a connection,
// copying the master defaults — mirrors legacy generateKPIConfig()/
// initKPIConfig(). Skips KPIs that already have a config row.
export async function initKpiConfig(formData: FormData) {
  const session = await requireKpiConfigEditor();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...connectionScopeWhere(session) },
  });
  if (!connection) throw new Error("Connection not found.");

  const applicable = await prisma.kpiDefinition.findMany({
    where: {
      departmentId: connection.departmentId,
      OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
    },
  });

  const existing = await prisma.kpiConfig.findMany({
    where: { connectionId },
    select: { kpiDefinitionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.kpiDefinitionId));
  const toCreate = applicable.filter((k) => !existingIds.has(k.id));

  if (toCreate.length > 0) {
    await prisma.kpiConfig.createMany({
      data: toCreate.map((k) => ({
        connectionId,
        kpiDefinitionId: k.id,
        updatedById: session.id,
      })),
    });
  }
  revalidatePath("/dashboard/connections/kpi-config");
  revalidatePath("/dashboard");
}

// Upserts up to two KpiConfig rows (one per period) for a single KPI group
// in one submit — the redesigned editor edits Weekly and Monthly targets
// side by side but treats Deviation/At Risk Max/Applicable/Notes as one
// shared value synced to both periods, even though each is stored on its
// own KpiConfig row underneath. Logs one KpiConfigHistory entry per changed
// field per row — mirrors legacy updateKPIConfig(), merged across periods.
export async function updateKpiConfig(formData: FormData) {
  const session = await requireKpiConfigEditor();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  const deviationThresholdPct = numberOrNull(formData, "deviationThresholdPct");
  const criticalThresholdPct = numberOrNull(formData, "criticalThresholdPct");
  const isApplicable = formData.get("isApplicable") === "on";
  const notesRaw = formData.get("notes");
  const notes = notesRaw === null || notesRaw === "" ? null : String(notesRaw);

  const periods: { kpiDefinitionId: string; targetValue: number | null }[] = [];
  const weeklyDefId = formData.get("weeklyKpiDefinitionId");
  if (weeklyDefId) {
    periods.push({
      kpiDefinitionId: String(weeklyDefId),
      targetValue: numberOrNull(formData, "weeklyTargetValue"),
    });
  }
  const monthlyDefId = formData.get("monthlyKpiDefinitionId");
  if (monthlyDefId) {
    periods.push({
      kpiDefinitionId: String(monthlyDefId),
      targetValue: numberOrNull(formData, "monthlyTargetValue"),
    });
  }
  if (periods.length === 0) throw new Error("Missing KPI definition id.");

  const [connection, existingConfigs, kpiDefs] = await Promise.all([
    prisma.connection.findFirst({
      where: { id: connectionId, ...connectionScopeWhere(session) },
      select: { clientName: true, departmentId: true },
    }),
    prisma.kpiConfig.findMany({
      where: { connectionId, kpiDefinitionId: { in: periods.map((p) => p.kpiDefinitionId) } },
    }),
    prisma.kpiDefinition.findMany({
      where: { id: { in: periods.map((p) => p.kpiDefinitionId) } },
      select: { id: true, name: true, period: true },
    }),
  ]);
  if (!connection) throw new Error("Connection not found.");
  const existingByDefId = new Map(existingConfigs.map((c) => [c.kpiDefinitionId, c]));
  const kpiDefById = new Map(kpiDefs.map((d) => [d.id, d]));

  type RowData = { targetValue: number | null; deviationThresholdPct: number | null; criticalThresholdPct: number | null; isApplicable: boolean; notes: string | null };
  const rowsToProcess: {
    p: (typeof periods)[number];
    existing: (typeof existingConfigs)[number] | undefined;
    entityLabel: string;
    data: RowData;
  }[] = [];
  for (const p of periods) {
    const existing = existingByDefId.get(p.kpiDefinitionId);
    const kpiDef = kpiDefById.get(p.kpiDefinitionId);
    const entityLabel = kpiDef && connection ? `${kpiDef.name} (${kpiDef.period}) — ${connection.clientName}` : p.kpiDefinitionId;
    const data: RowData = {
      targetValue: p.targetValue,
      deviationThresholdPct,
      criticalThresholdPct,
      isApplicable,
      notes,
    };
    rowsToProcess.push({ p, existing, entityLabel, data });
  }

  const hasWork = rowsToProcess.some(({ existing, data }) => {
    if (!existing) return true;
    return (
      existing.targetValue !== data.targetValue ||
      existing.deviationThresholdPct !== data.deviationThresholdPct ||
      existing.criticalThresholdPct !== data.criticalThresholdPct ||
      existing.isApplicable !== data.isApplicable ||
      existing.notes !== data.notes
    );
  });

  if (hasWork) {
    await prisma.$transaction(async (tx) => {
      for (const { p, existing, entityLabel, data } of rowsToProcess) {
        if (!existing) {
          const created = await tx.kpiConfig.create({
            data: {
              connectionId,
              kpiDefinitionId: p.kpiDefinitionId,
              updatedById: session.id,
              ...data,
            },
          });
          await logActivity(tx, {
            actor: { id: session.id, role: session.role },
            action: "CREATE",
            entityType: "KpiConfig",
            entityId: created.id,
            entityLabel,
            summary: `Created KPI config override for ${entityLabel}`,
            departmentId: connection?.departmentId ?? null,
          });
          continue;
        }

        const fields: [string, number | boolean | string | null, number | boolean | string | null][] = [
          ["targetValue", existing.targetValue, data.targetValue],
          ["deviationThresholdPct", existing.deviationThresholdPct, data.deviationThresholdPct],
          ["criticalThresholdPct", existing.criticalThresholdPct, data.criticalThresholdPct],
          ["isApplicable", existing.isApplicable, data.isApplicable],
          ["notes", existing.notes, data.notes],
        ];
        const changed = fields.filter(([, oldV, newV]) => oldV !== newV);
        if (changed.length === 0) continue;

        await tx.kpiConfig.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 }, updatedById: session.id },
        });
        await tx.kpiConfigHistory.createMany({
          data: changed.map(([fieldChanged, oldValue, newValue]) => ({
            kpiConfigId: existing.id,
            fieldChanged,
            oldValue: oldValue === null ? null : String(oldValue),
            newValue: newValue === null ? null : String(newValue),
            changedById: session.id,
          })),
        });
        await logActivity(tx, {
          actor: { id: session.id, role: session.role },
          action: "UPDATE",
          entityType: "KpiConfig",
          entityId: existing.id,
          entityLabel,
          summary: `Edited KPI config for ${entityLabel} — ${changed.map(([f]) => f).join(", ")}`,
          changes: changed.map(([field, oldValue, newValue]) => ({
            field,
            oldValue: oldValue === null ? null : String(oldValue),
            newValue: newValue === null ? null : String(newValue),
          })),
          departmentId: connection?.departmentId ?? null,
        });
      }
    });
  }
  revalidatePath("/dashboard/connections/kpi-config");
}

// Wipes this connection's overrides and regenerates fresh ones from the
// current KpiDefinition defaults — mirrors legacy resetToDefaults()
// (deleteKPIConfig + initKPIConfig back-to-back). Unlike initKpiConfig,
// this replaces every row rather than only filling in missing ones.
export async function resetKpiConfig(formData: FormData) {
  const session = await requireKpiConfigEditor();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...connectionScopeWhere(session) },
  });
  if (!connection) throw new Error("Connection not found.");

  const applicable = await prisma.kpiDefinition.findMany({
    where: {
      departmentId: connection.departmentId,
      OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.kpiConfigHistory.deleteMany({ where: { kpiConfig: { connectionId } } });
    await tx.kpiConfig.deleteMany({ where: { connectionId } });
    await tx.kpiConfig.createMany({
      data: applicable.map((k) => ({
        connectionId,
        kpiDefinitionId: k.id,
        updatedById: session.id,
      })),
    });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role },
      action: "DELETE",
      entityType: "KpiConfig",
      entityId: connectionId,
      entityLabel: connection.clientName,
      summary: `Reset all KPI config overrides to defaults for ${connection.clientName}`,
      departmentId: connection.departmentId,
    });
  });
  revalidatePath("/dashboard/connections/kpi-config");
  revalidatePath("/dashboard");
}
