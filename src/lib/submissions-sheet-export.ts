import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { rollupStatus, excludeInapplicablePairs, loadInapplicableKpiPairs } from "@/lib/performance";
import { addDays, addMonths, currentPeriodStart, isPlausiblePeriodDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";

export const SUBMISSIONS_SHEET_HEADERS = [
  "RecordID",
  "Connection ID",
  "CMS Connection ID",
  "Customer Name",
  "Account Name",
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
 * connection within that period's window. Customer Name is the connection's
 * clientName; Account Name is its secondaryName (an internal account alias,
 * null for connections that don't have one) — neither is a real Customer/
 * Account ID, which don't exist anywhere in this app yet (see
 * dashboard/customers, which is itself still a placeholder). CMS Connection
 * ID is externalCmsId, the real CONN_xxxxxxxxxxxx id the CMS itself
 * recognizes — blank for the ~98% of connections that came from the legacy
 * KPI system rather than the CMS and so were never assigned one (Connection
 * ID/shortCode still shows those in their legacy CON_XXXXXX form).
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
  // Narrowest possible window covering every instance requested, so a
  // single-week/month export doesn't also pull interventions from every
  // other period the connection has ever had one logged in.
  let interventionWindow: Prisma.DateTimeFilter<never> | undefined;

  if (anchor) {
    const weekStartDay = await getWeekStartDay();
    const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
    const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);
    const instances: Prisma.PerformanceSummaryWhereInput[] = [];
    const windowStarts: Date[] = [];
    const windowEnds: Date[] = [];
    if (periodFilter !== KpiPeriod.MONTHLY) {
      instances.push({ period: KpiPeriod.WEEKLY, periodStart: weeklyStart });
      windowStarts.push(weeklyStart);
      windowEnds.push(periodWindowEnd(KpiPeriod.WEEKLY, weeklyStart));
    }
    if (periodFilter !== KpiPeriod.WEEKLY) {
      instances.push({ period: KpiPeriod.MONTHLY, periodStart: monthlyStart });
      windowStarts.push(monthlyStart);
      windowEnds.push(periodWindowEnd(KpiPeriod.MONTHLY, monthlyStart));
    }
    periodWhere = { OR: instances };
    interventionWindow = {
      gte: new Date(Math.min(...windowStarts.map((d) => d.getTime()))),
      lt: new Date(Math.max(...windowEnds.map((d) => d.getTime()))),
    };
  }

  // Connection and Intervention are fetched *after* summaries, scoped down
  // to only the connections that actually have a matching row — this used
  // to pull all ~850 connections and every intervention ever logged (across
  // the whole company) on every single call, regardless of how narrow
  // `periodFilter`/`anchor` made the actual export. That unscoped pair of
  // full-table reads, run repeatedly while this feature was being built and
  // tested, was a confirmed contributor to a Supabase egress spike
  // (2026-09-07) — see the Activity Log page for the other one.
  const [rawSummaries, inapplicablePairs] = await Promise.all([
    prisma.performanceSummary.findMany({
      where: periodWhere,
      select: { connectionId: true, kpiDefinitionId: true, period: true, periodStart: true, status: true },
    }),
    loadInapplicableKpiPairs({}),
  ]);

  const summaries = excludeInapplicablePairs(rawSummaries, inapplicablePairs).filter((s) =>
    isPlausiblePeriodDate(s.periodStart),
  );
  const connectionIds = [...new Set(summaries.map((s) => s.connectionId))];

  const [connections, interventions] = await Promise.all([
    prisma.connection.findMany({
      where: { id: { in: connectionIds } },
      select: {
        id: true,
        shortCode: true,
        externalCmsId: true,
        clientName: true,
        secondaryName: true,
        vaUser: { select: { name: true, email: true } },
      },
    }),
    prisma.intervention.findMany({
      where: {
        connectionId: { in: connectionIds },
        ...(interventionWindow ? { createdAt: interventionWindow } : {}),
      },
      select: { connectionId: true, type: true, description: true, createdAt: true },
    }),
  ]);
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
      connection?.externalCmsId ?? "",
      connection?.clientName ?? "",
      connection?.secondaryName ?? "",
      connection?.vaUser.name ?? connection?.vaUser.email ?? "",
      group.period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly",
      formatPeriodDate(group.periodStart),
      STATUS_LABEL[rollupStatus(group.statuses)],
      interventionDetails,
    ];
  });
}
