"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage KPI config.");
  }
  return session;
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
  await prisma.kpiConfig.delete({ where: { id } });
  revalidatePath("/dashboard/connections/kpi-config");
}
