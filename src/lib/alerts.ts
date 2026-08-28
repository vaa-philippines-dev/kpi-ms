import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type Alert = {
  id: string;
  count: number;
  label: string;
  href: string;
  tone: "danger" | "warning";
};

/**
 * Connections missing at least one applicable KPI's config row — not just
 * connections with zero config rows. Requires loading each connection's
 * configured-KPI ids plus the KPI Library once (a few hundred rows), rather
 * than a single COUNT, but that's the actual definition legacy's
 * getManagerNotifications() used.
 */
async function countMissingKpiConfig(scope: Prisma.ConnectionWhereInput) {
  const [connections, kpiDefs] = await Promise.all([
    prisma.connection.findMany({
      where: { ...scope, status: "ACTIVE" },
      select: {
        departmentId: true,
        serviceId: true,
        kpiConfigs: { select: { kpiDefinitionId: true } },
      },
    }),
    prisma.kpiDefinition.findMany({
      select: { id: true, departmentId: true, serviceId: true },
    }),
  ]);

  return connections.filter((c) => {
    const applicable = kpiDefs.filter(
      (k) =>
        k.departmentId === c.departmentId &&
        (k.serviceId === null || k.serviceId === c.serviceId),
    );
    const configuredIds = new Set(c.kpiConfigs.map((k) => k.kpiDefinitionId));
    return applicable.some((k) => !configuredIds.has(k.id));
  }).length;
}

/**
 * The handful of "something needs your attention" counts surfaced in the
 * topbar bell. Mostly plain `count` queries — the one exception is
 * `countMissingKpiConfig`, which needs each connection's configured-KPI ids
 * to detect partial configuration, not just a zero-config connection, and
 * ends up pulling every KpiConfig row for every active connection in scope
 * to do it. That's cheap once, but this whole function used to re-run on
 * every dashboard navigation (DashboardTopbar renders it in the layout, on
 * every page) — for a system with ~800+ active connections that meant
 * ~10,000 rows re-fetched per click, which showed up as the single largest
 * contributor to this project's Supabase egress. Wrapped in a 5-minute
 * cache below since a "needs attention" badge doesn't need to be
 * second-fresh — see getAlerts.
 */
async function computeAlerts(
  scope: Prisma.ConnectionWhereInput,
  role: string,
): Promise<Alert[]> {
  const isManager = ["ADMIN", "EXECUTIVE", "DM", "OPS_MANAGER", "OM"].includes(role);
  const isAdmin = role === "ADMIN" || role === "EXECUTIVE";
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);
  const currentPeriods = [
    { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
    { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
  ];

  const [critical, atRisk, notSubmitted, missingConfig, unassignedVAs] = await Promise.all([
    prisma.performanceSummary.count({
      where: {
        connection: scope,
        status: PerformanceStatus.CRITICAL,
        OR: currentPeriods,
      },
    }),
    prisma.performanceSummary.count({
      where: {
        connection: scope,
        status: PerformanceStatus.AT_RISK,
        OR: currentPeriods,
      },
    }),
    prisma.connection.count({
      where: {
        ...scope,
        status: "ACTIVE",
        performanceSummaries: {
          none: { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
        },
      },
    }),
    // A plain `kpiConfigs: { none: {} }` count only catches connections with
    // ZERO config rows — it misses a connection that has some KPIs
    // configured but not all of its applicable ones, which still needs
    // attention. Mirrors the original getManagerNotifications() check.
    isManager ? countMissingKpiConfig(scope) : Promise.resolve(0),
    // Mirrors legacy's "N VA(s) not in a team" notification (Users.js) — the
    // count backing the Overview page's Unassigned Virtual Assistants panel.
    isAdmin
      ? prisma.user.count({ where: { role: "VA", isActive: true, teamId: null } })
      : Promise.resolve(0),
  ]);

  const alerts: Alert[] = [
    {
      id: "critical",
      count: critical,
      label: "KPIs critical this period",
      href: "/dashboard/performance",
      tone: "danger" as const,
    },
    {
      id: "at-risk",
      count: atRisk,
      label: "KPIs at risk this period",
      href: "/dashboard/performance",
      tone: "warning" as const,
    },
    {
      id: "not-submitted",
      count: notSubmitted,
      label: "connections haven't submitted this week",
      href: "/dashboard/submissions",
      tone: "warning" as const,
    },
    {
      id: "missing-config",
      count: missingConfig,
      label: "connections have unconfigured KPIs",
      href: "/dashboard/connections",
      tone: "warning" as const,
    },
    {
      id: "unassigned-vas",
      count: unassignedVAs,
      label: unassignedVAs === 1 ? "VA is not in a team" : "VAs are not in a team",
      href: "/dashboard",
      tone: "warning" as const,
    },
  ];

  return alerts.filter((a) => a.count > 0);
}

/**
 * Cached wrapper around computeAlerts — see its doc for why. Keyed on
 * `scope`/`role` (unstable_cache includes its arguments in the cache key
 * automatically), so each distinct department/team/role combination gets
 * its own 5-minute-fresh count rather than sharing one global value.
 */
export const getAlerts = unstable_cache(computeAlerts, ["dashboard-alerts"], {
  revalidate: 300,
});
