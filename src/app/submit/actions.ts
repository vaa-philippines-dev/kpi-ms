"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { computeStatus } from "@/lib/performance";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { isWithinSubmissionWindow, formatManilaWindow } from "@/lib/submission-window";
import { KpiPeriod } from "@/generated/prisma/enums";

export async function createSubmission(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Sign in required.");
  }

  const connectionId = String(formData.get("connectionId") ?? "");
  const period = String(formData.get("period") ?? "") as KpiPeriod;

  if (!connectionId || !Object.values(KpiPeriod).includes(period)) {
    throw new Error("Missing connection or period.");
  }

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  });

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: {
      department: {
        include: {
          kpiDefinitions: {
            where: { period },
            include: {
              kpiConfigs: { where: { connectionId } },
            },
          },
        },
      },
    },
  });
  if (!connection) {
    throw new Error("Connection not found.");
  }

  // VAs are subject to their department's submission window (spreads
  // traffic across the day); managers submitting on a VA's behalf are not.
  if (
    session.user.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    )
  ) {
    throw new Error(
      `Submissions for ${connection.department.name} are only accepted between ${formatManilaWindow(
        connection.department.submissionWindowStart!,
        connection.department.submissionWindowEnd!,
      )}. Please come back during that window.`,
    );
  }

  const kpisWithConfig = connection.department.kpiDefinitions
    .map((kpi) => ({ kpi, config: kpi.kpiConfigs[0] }))
    .filter(({ config }) => config?.isApplicable ?? true);

  const values: { kpiDefinitionId: string; value: number | null; noData: boolean }[] = [];
  const rawPayload: Record<string, number | string> = {};
  for (const { kpi } of kpisWithConfig) {
    const noData = formData.get(`kpi_${kpi.id}_nodata`) === "1";
    if (noData) {
      values.push({ kpiDefinitionId: kpi.id, value: null, noData: true });
      rawPayload[kpi.name] = "No data available";
      continue;
    }
    const raw = formData.get(`kpi_${kpi.id}`);
    const value = Number(raw);
    if (raw === null || raw === "" || Number.isNaN(value)) {
      throw new Error(`Missing value for ${kpi.name}.`);
    }
    values.push({ kpiDefinitionId: kpi.id, value, noData: false });
    rawPayload[kpi.name] = value;
  }

  if (values.length === 0) {
    throw new Error("No KPIs to submit for this period.");
  }

  const weekStartDay = await getWeekStartDay();

  const periodStart = currentPeriodStart(period, undefined, weekStartDay);

  if (session.user.role === "VA") {
    const alreadySubmitted = await prisma.performanceSummary.findFirst({
      where: { connectionId, periodStart },
    });
    if (alreadySubmitted) {
      throw new Error(
        "This period has already been submitted. Contact your Team Leader or Manager to correct it.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.submission.create({
      data: {
        connectionId,
        period,
        periodStart,
        rawPayload,
        records: {
          create: values.map((v) => ({
            kpiDefinitionId: v.kpiDefinitionId,
            value: v.value,
            noData: v.noData,
          })),
        },
      },
    });

    // Actual = sum of every submitted value for this KPI/connection/period —
    // mirrors the legacy "normalize then summarize into one row" workflow,
    // since a period can receive more than one submission. Records marked
    // "no data available" are excluded; if every record for a KPI is
    // no-data, the aggregate comes back null and computeStatus reports
    // NO_DATA, same as if nothing were submitted at all.
    for (const { kpi, config } of kpisWithConfig) {
      const total = await tx.submissionRecord.aggregate({
        where: {
          kpiDefinitionId: kpi.id,
          noData: false,
          submission: { connectionId, periodStart },
        },
        _sum: { value: true },
      });
      const actualValue = total._sum.value ?? null;
      const targetValue = config?.targetValue ?? kpi.targetValue;
      const deviationThresholdPct =
        config?.deviationThresholdPct ?? kpi.deviationThresholdPct;
      const criticalThresholdPct =
        config?.criticalThresholdPct ?? kpi.criticalThresholdPct;
      const status = computeStatus(
        kpi.direction,
        targetValue,
        actualValue,
        deviationThresholdPct,
        criticalThresholdPct,
      );
      const pct =
        actualValue !== null && targetValue !== 0
          ? (actualValue / targetValue) * 100
          : null;

      await tx.performanceSummary.upsert({
        where: {
          connectionId_kpiDefinitionId_periodStart: {
            connectionId,
            kpiDefinitionId: kpi.id,
            periodStart,
          },
        },
        create: {
          connectionId,
          kpiDefinitionId: kpi.id,
          period,
          periodStart,
          actualValue,
          targetValue,
          pct,
          status,
        },
        update: {
          actualValue,
          targetValue,
          pct,
          status,
        },
      });
    }
  });

  redirect(
    `/submit?success=1&connectionId=${connectionId}&periodStart=${periodStart.toISOString()}`,
  );
}
