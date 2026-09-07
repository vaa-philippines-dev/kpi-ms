import { prisma } from "@/lib/prisma";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { rollupStatus, excludeInapplicablePairs, loadInapplicableKpiPairs } from "@/lib/performance";
import { addDays, addMonths } from "@/lib/period";

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
 */
export async function buildSubmissionsSheetRows(): Promise<(string | number)[][]> {
  const [connections, rawSummaries, interventions, inapplicablePairs] = await Promise.all([
    prisma.connection.findMany({
      select: {
        id: true,
        shortCode: true,
        vaUser: { select: { name: true, email: true } },
      },
    }),
    prisma.performanceSummary.findMany({
      select: { connectionId: true, kpiDefinitionId: true, period: true, periodStart: true, status: true },
    }),
    prisma.intervention.findMany({
      select: { connectionId: true, type: true, description: true, createdAt: true },
    }),
    loadInapplicableKpiPairs({}),
  ]);

  const summaries = excludeInapplicablePairs(rawSummaries, inapplicablePairs);
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
