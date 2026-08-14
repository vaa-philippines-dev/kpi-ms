"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage the KPI Library.");
  }
}

function parseKpiForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  const direction = String(formData.get("direction") ?? "") as KpiDirection;
  const period = String(formData.get("period") ?? "") as KpiPeriod;
  const targetValue = Number(formData.get("targetValue"));
  const deviationThresholdPct = Number(
    formData.get("deviationThresholdPct") ?? 99,
  );

  if (
    !name ||
    !departmentId ||
    !Object.values(KpiDirection).includes(direction) ||
    !Object.values(KpiPeriod).includes(period) ||
    Number.isNaN(targetValue) ||
    Number.isNaN(deviationThresholdPct)
  ) {
    throw new Error("Missing or invalid KPI fields.");
  }

  return {
    name,
    departmentId,
    direction,
    period,
    targetValue,
    deviationThresholdPct,
  };
}

export async function createKpiDefinition(formData: FormData) {
  await requireAdmin();
  const data = parseKpiForm(formData);
  await prisma.kpiDefinition.create({ data });
  revalidatePath("/dashboard/kpi-library");
}

export async function updateKpiDefinition(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing KPI id.");
  const data = parseKpiForm(formData);
  await prisma.kpiDefinition.update({ where: { id }, data });
  revalidatePath("/dashboard/kpi-library");
}

export async function deleteKpiDefinition(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.kpiDefinition.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a KPI that already has submissions recorded against it.");
  }
  revalidatePath("/dashboard/kpi-library");
}
