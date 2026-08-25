"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";

async function requireManager() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER" && role !== "OM") {
    throw new Error("Only Admins, DMs, Ops Managers, or OMs can manage the KPI Library.");
  }
  return session;
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

  if (
    !name ||
    !cluster ||
    !departmentId ||
    !Object.values(KpiDirection).includes(direction) ||
    !Object.values(KpiPeriod).includes(period) ||
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
    targetValue,
    deviationThresholdPct,
    criticalThresholdPct,
  };
}

export async function createKpiDefinition(formData: FormData) {
  await requireManager();
  const data = parseKpiForm(formData);
  await prisma.kpiDefinition.create({ data });
  revalidatePath("/dashboard/kpi-library");
}

export async function updateKpiDefinition(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing KPI id.");
  const data = parseKpiForm(formData);
  await prisma.kpiDefinition.update({ where: { id }, data });
  revalidatePath("/dashboard/kpi-library");
}

export async function deleteKpiDefinition(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.kpiDefinition.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a KPI that already has submissions recorded against it.");
  }
  revalidatePath("/dashboard/kpi-library");
}

// Lightweight move used by the By Cluster view's drag-and-drop — reassigns
// only the `cluster` field instead of round-tripping the full KPI form.
export async function moveKpiCluster(id: string, cluster: string) {
  await requireManager();
  const trimmed = cluster.trim();
  if (!id || !trimmed) {
    throw new Error("Missing KPI id or cluster name.");
  }
  await prisma.kpiDefinition.update({ where: { id }, data: { cluster: trimmed } });
  revalidatePath("/dashboard/kpi-library");
}
