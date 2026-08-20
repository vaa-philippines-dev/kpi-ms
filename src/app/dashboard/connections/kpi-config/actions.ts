"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { KpiPeriod } from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage KPI config.");
  }
  return session;
}

export type KpiConfigDetailRow = {
  id: string | null; // null = not yet configured, showing the KPI Library default
  kpiDefinitionId: string;
  name: string;
  // A single legacy KPI maps to up to two KpiDefinition rows here — one for
  // its Weekly target, one for its Monthly target (same name, different
  // period) — so this must be shown or the two rows look like duplicates.
  period: KpiPeriod;
  // Legacy's KPI_Master keys applicability off ServiceID alone, never
  // Cluster (see KPIConfig.js's `k.ServiceID === serviceId` filter — no
  // cluster check), so two KPIs can legitimately share a name AND a
  // service (e.g. "ACoS" defined once for the "Amazon PPC" cluster and
  // again for "Walmart PPC") and both apply to the same connection. Ported
  // as-is from legacy; cluster is shown here so the two don't read as an
  // accidental duplicate.
  cluster: string;
  targetValue: number;
  deviationThresholdPct: number;
  criticalThresholdPct: number;
  isApplicable: boolean;
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

  const configuredIds = new Set(configs.map((c) => c.kpiDefinitionId));
  const rows: KpiConfigDetailRow[] = [
    ...configs.map((c) => ({
      id: c.id,
      kpiDefinitionId: c.kpiDefinitionId,
      name: c.kpiDefinition.name,
      period: c.kpiDefinition.period,
      cluster: c.kpiDefinition.cluster,
      targetValue: c.targetValue ?? c.kpiDefinition.targetValue,
      deviationThresholdPct:
        c.deviationThresholdPct ?? c.kpiDefinition.deviationThresholdPct,
      criticalThresholdPct:
        c.criticalThresholdPct ?? c.kpiDefinition.criticalThresholdPct,
      isApplicable: c.isApplicable,
    })),
    ...applicableKpis
      .filter((k) => !configuredIds.has(k.id))
      .map((k) => ({
        id: null,
        kpiDefinitionId: k.id,
        name: k.name,
        period: k.period,
        cluster: k.cluster,
        targetValue: k.targetValue,
        deviationThresholdPct: k.deviationThresholdPct,
        criticalThresholdPct: k.criticalThresholdPct,
        isApplicable: true,
      })),
  ];

  return {
    missingCount: applicableKpis.length - configs.length,
    rows,
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
  const session = await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
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
        updatedById: session!.user!.id,
      })),
    });
  }
  revalidatePath("/dashboard/connections/kpi-config");
  revalidatePath("/dashboard");
}

// Updates one KpiConfig row's overrides, logging one KpiConfigHistory entry
// per changed field — mirrors legacy updateKPIConfig().
export async function updateKpiConfig(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing config id.");

  const targetValue = numberOrNull(formData, "targetValue");
  const deviationThresholdPct = numberOrNull(formData, "deviationThresholdPct");
  const criticalThresholdPct = numberOrNull(formData, "criticalThresholdPct");
  const isApplicable = formData.get("isApplicable") === "on";

  const existing = await prisma.kpiConfig.findUnique({ where: { id } });
  if (!existing) throw new Error("Config not found.");

  const fields: [string, number | boolean | null, number | boolean | null][] = [
    ["targetValue", existing.targetValue, targetValue],
    [
      "deviationThresholdPct",
      existing.deviationThresholdPct,
      deviationThresholdPct,
    ],
    ["criticalThresholdPct", existing.criticalThresholdPct, criticalThresholdPct],
    ["isApplicable", existing.isApplicable, isApplicable],
  ];
  const changed = fields.filter(([, oldV, newV]) => oldV !== newV);

  if (changed.length > 0) {
    await prisma.$transaction([
      prisma.kpiConfig.update({
        where: { id },
        data: {
          targetValue,
          deviationThresholdPct,
          criticalThresholdPct,
          isApplicable,
          version: { increment: 1 },
          updatedById: session!.user!.id,
        },
      }),
      prisma.kpiConfigHistory.createMany({
        data: changed.map(([fieldChanged, oldValue, newValue]) => ({
          kpiConfigId: id,
          fieldChanged,
          oldValue: oldValue === null ? null : String(oldValue),
          newValue: newValue === null ? null : String(newValue),
          changedById: session!.user!.id,
        })),
      }),
    ]);
  }
  revalidatePath("/dashboard/connections/kpi-config");
}

export async function deleteKpiConfig(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // KpiConfigHistory.kpiConfigId is ON DELETE RESTRICT, so any config that
  // was ever edited (and therefore has history rows) must have those
  // deleted first, in the same transaction, or this throws a foreign key
  // violation.
  await prisma.$transaction([
    prisma.kpiConfigHistory.deleteMany({ where: { kpiConfigId: id } }),
    prisma.kpiConfig.delete({ where: { id } }),
  ]);
  revalidatePath("/dashboard/connections/kpi-config");
}

// Wipes this connection's overrides and regenerates fresh ones from the
// current KpiDefinition defaults — mirrors legacy resetToDefaults()
// (deleteKPIConfig + initKPIConfig back-to-back). Unlike initKpiConfig,
// this replaces every row rather than only filling in missing ones.
export async function resetKpiConfig(formData: FormData) {
  const session = await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection id.");

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) throw new Error("Connection not found.");

  const applicable = await prisma.kpiDefinition.findMany({
    where: {
      departmentId: connection.departmentId,
      OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
    },
  });

  await prisma.$transaction([
    prisma.kpiConfigHistory.deleteMany({ where: { kpiConfig: { connectionId } } }),
    prisma.kpiConfig.deleteMany({ where: { connectionId } }),
    prisma.kpiConfig.createMany({
      data: applicable.map((k) => ({
        connectionId,
        kpiDefinitionId: k.id,
        updatedById: session!.user!.id,
      })),
    }),
  ]);
  revalidatePath("/dashboard/connections/kpi-config");
  revalidatePath("/dashboard");
}
