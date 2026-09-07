import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { rollupStatus, excludeInapplicablePairs, loadInapplicableKpiPairs } from "@/lib/performance";
import { addDays, addMonths, currentPeriodStart, isPlausiblePeriodDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";

export const SUBMISSIONS_SHEET_HEADERS = [
  "RecordID",
  "Connection ID",
  "Customer ID",
  "Account ID",
  "VA Name",
  "KPIType",
  "PeriodDate",
  "Status",
  "InterventionDetails",
];

// Same labels as components/status-badge.tsx's STATUS_LABEL, duplicated here
// rather than imported so this server-only module never pulls in a .tsx
// component just for a string map.
const STATUS_LABEL: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.NO_DATA]: "No Data",
};

function formatPeriodDate(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

function periodWindowEnd(period: KpiPeriod, periodStart: Date): Date {
  return period === KpiPeriod.WEEKLY ? addDays(periodStart, 7) : addMonths(periodStart, 1);
}

/**
 * One row per connection × period × periodStart that has ever recorded a
 * PerformanceSummary, rolled up to a single overall status (same rule as the
 * VA KPI Sheet/Submissions pages) plus any interventions logged for that
 * connection within that period's window. Customer ID/Account ID are left
 * blank — no data source for them yet (see dashboard/customers, which is
 * itself still a placeholder).
 *
 * `periodFilter` narrows to just WEEKLY or just MONTHLY rows; omitted (or
 * undefined) includes both, sorted together by date.
 *
 * `anchor`, when given, narrows further to one specific week/month instance
 * — the same "any date in the target week/month" resolution the Submissions
 * edit modal and every period-nav page already use (currentPeriodStart).
 * Omitted (the default) includes every period ever recorded, matching this
 * feature's original "export everything" design.
 *
 * A handful of existing PerformanceSummary rows carry a garbage periodStart
 * (years like 1996, 2002, 2031 — see lib/period.ts's isPlausiblePeriodDate
 * for how new ones are now prevented) from a since-fixed date-input bug;
 * those are silently dropped here rather than shown in a sheet meant to be
 * shared outside the app.
 */
export async function buildSubmissionsSheetRows(
  periodFilter?: KpiPeriod,
  anchor?: Date,
): Promise<(string | number)[][]> {
  let periodWhere: Prisma.PerformanceSummaryWhereInput | undefined = periodFilter
    ? { period: periodFilter }
    : undefined;

  if (anchor) {
    const weekStartDay = await getWeekStartDay();
    const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
    const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);
    const instances: Prisma.PerformanceSummaryWhereInput[] = [];
    if (periodFilter !== KpiPeriod.MONTHLY) {
      instances.push({ period: KpiPeriod.WEEKLY, periodStart: weeklyStart });
    }
    if (periodFilter !== KpiPeriod.WEEKLY) {
      instances.push({ period: KpiPeriod.MONTHLY, periodStart: monthlyStart });
    }
    periodWhere = { OR: instances };
  }

  const [connections, rawSummaries, interventions, inapplicablePairs] = await Promise.all([
    prisma.connection.findMany({
      select: {
        id: true,
        shortCode: true,
        vaUser: { select: { name: true, email: true } },
      },
    }),
    prisma.performanceSummary.findMany({
      where: periodWhere,
      select: { connectionId: true, kpiDefinitionId: true, period: true, periodStart: true, status: true },
    }),
    prisma.intervention.findMany({
      select: { connectionId: true, type: true, description: true, createdAt: true },
    }),
    loadInapplicableKpiPairs({}),
  ]);

  const summaries = excludeInapplicablePairs(rawSummaries, inapplicablePairs).filter((s) =>
    isPlausiblePeriodDate(s.periodStart),
  );
  const connectionById = new Map(connections.map((c) => [c.id, c]));

  const groups = new Map<
    string,
    { connectionId: string; period: KpiPeriod; periodStart: Date; statuses: PerformanceStatus[] }
  >();
  for (const s of summaries) {
    const key = `${s.connectionId}:${s.period}:${s.periodStart.toISOString()}`;
    let group = groups.get(key);
    if (!group) {
      group = { connectionId: s.connectionId, period: s.period, periodStart: s.periodStart, statuses: [] };
      groups.set(key, group);
    }
    group.statuses.push(s.status);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const byDate = a.periodStart.getTime() - b.periodStart.getTime();
    if (byDate !== 0) return byDate;
    const aCode = connectionById.get(a.connectionId)?.shortCode ?? "";
    const bCode = connectionById.get(b.connectionId)?.shortCode ?? "";
    return aCode.localeCompare(bCode);
  });

  return sortedGroups.map((group, i) => {
    const connection = connectionById.get(group.connectionId);
    const windowEnd = periodWindowEnd(group.period, group.periodStart);
    const interventionDetails = interventions
      .filter(
        (iv) =>
          iv.connectionId === group.connectionId &&
          iv.createdAt >= group.periodStart &&
          iv.createdAt < windowEnd,
      )
      .map((iv) => `${iv.type}: ${iv.description}`)
      .join("; ");

    return [
      `WS-${String(i + 1).padStart(6, "0")}`,
      connection?.shortCode ?? "",
      "",
      "",
      connection?.vaUser.name ?? connection?.vaUser.email ?? "",
      group.period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly",
      formatPeriodDate(group.periodStart),
      STATUS_LABEL[rollupStatus(group.statuses)],
      interventionDetails,
    ];
  });
}
