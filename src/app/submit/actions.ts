"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod } from "@/generated/prisma/enums";

export async function createSubmission(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  const period = String(formData.get("period") ?? "") as KpiPeriod;

  if (!connectionId || !Object.values(KpiPeriod).includes(period)) {
    throw new Error("Missing connection or period.");
  }

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: {
      department: { include: { kpiDefinitions: { where: { period } } } },
    },
  });
  if (!connection) {
    throw new Error("Connection not found.");
  }

  const values: { kpiDefinitionId: string; value: number }[] = [];
  const rawPayload: Record<string, number> = {};
  for (const kpi of connection.department.kpiDefinitions) {
    const raw = formData.get(`kpi_${kpi.id}`);
    const value = Number(raw);
    if (raw === null || raw === "" || Number.isNaN(value)) {
      throw new Error(`Missing value for ${kpi.name}.`);
    }
    values.push({ kpiDefinitionId: kpi.id, value });
    rawPayload[kpi.name] = value;
  }

  if (values.length === 0) {
    throw new Error("No KPIs to submit for this period.");
  }

  const periodStart = currentPeriodStart(period);

  await prisma.submission.create({
    data: {
      connectionId,
      period,
      periodStart,
      rawPayload,
      records: {
        create: values.map((v) => ({
          kpiDefinitionId: v.kpiDefinitionId,
          value: v.value,
        })),
      },
    },
  });

  redirect("/submit?success=1");
}
