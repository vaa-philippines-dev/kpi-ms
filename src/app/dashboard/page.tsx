import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Link2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { PeriodNav } from "@/components/period-nav";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getPerformanceTrend } from "@/lib/trend";
import { getLongRunningConnections } from "@/lib/long-running";
import { UnassignedVasPanel } from "@/components/unassigned-vas-panel";
import { TeamLeaderOverview } from "./team-leader-overview";
import { CsOverview } from "./cs-overview";
import { VaOverview } from "./va-overview";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

const STATUS_TILES = [
  {
    status: PerformanceStatus.ON_TARGET,
    label: "On Target",
    icon: CheckCircle2,
    style: "border-success/30 text-success",
  },
  {
    status: PerformanceStatus.AT_RISK,
    label: "At Risk",
    icon: AlertTriangle,
    style: "border-warning/30 text-warning",
  },
  {
    status: PerformanceStatus.CRITICAL,
    label: "Critical",
    icon: XCircle,
    style: "border-danger/30 text-danger",
  },
] as const;

export default async function DashboardOverviewPage(
  props: PageProps<"/dashboard">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );
  const navPeriod: KpiPeriod =
    searchParams.period === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  // Team Leaders (OM) get legacy's dedicated dashboard — tabbed connection
  // cards + KPI drill-down, team-scoped trend, submission tracker — instead
  // of the cross-department tiles/long-running view below, which doesn't
  // make sense once `scope` is narrowed to a single team.
  if (session.role === "OM") {
    return (
      <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <PageHeader title="Dashboard" description="Your team's KPI performance." className="mb-0" />
          <PeriodNav anchor={weeklyStart} period={navPeriod} weekStartDay={weekStartDay} basePath="/dashboard" />
        </div>
        <TeamLeaderOverview
          scope={scope}
          weeklyStart={weeklyStart}
          weekStartDay={weekStartDay}
          anchor={anchor}
        />
      </>
    );
  }

  // CS Specialists (SERVICE_MANAGER) get legacy's dedicated dashboard —
  // system-wide stat cards + a flat connection-status table with a
  // click-to-open KPI drill-down — instead of the department-breakdown
  // view below, which legacy's CS dashboard doesn't have.
  if (session.role === "SERVICE_MANAGER") {
    return (
      <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <PageHeader title="Dashboard" description="System-wide KPI performance." className="mb-0" />
          <PeriodNav anchor={weeklyStart} period={navPeriod} weekStartDay={weekStartDay} basePath="/dashboard" />
        </div>
        <CsOverview scope={scope} weeklyStart={weeklyStart} />
      </>
    );
  }

  // VAs get legacy's dedicated dashboard — Total/Active/Pending stat cards
  // and a card grid of their own connections with a Submit Report action —
  // instead of the system-wide tiles/trend/long-running view below, which
  // isn't meaningful once `scope` is narrowed to just their own connections.
  if (session.role === "VA") {
    return (
      <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <PageHeader title="Dashboard" description="Your connections and this week's submissions." className="mb-0" />
          <PeriodNav anchor={weeklyStart} period={navPeriod} weekStartDay={weekStartDay} basePath="/dashboard" />
        </div>
        <VaOverview scope={scope} weeklyStart={weeklyStart} />
      </>
    );
  }

  const isAdmin = session.role === "ADMIN";

  // "Needs attention" counts (missing KPI config, unsubmitted, critical) now
  // live in the topbar bell, so this page only computes the status rollup,
  // the system-wide trend, and the long-running list — mirrors legacy's
  // dashboard stat cards + "Performance Overview" chart + "Long-Running
  // Connections" card (AppDashboards.html).
  const [
    totalConnections,
    summaries,
    trend,
    longRunning,
    unassignedVAs,
    unassignedTotal,
    teams,
  ] = await Promise.all([
    prisma.connection.count({
      where: { ...scope, status: ConnectionStatus.ACTIVE },
    }),
    prisma.performanceSummary.findMany({
      where: {
        connection: scope,
        OR: [
          { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
          { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
        ],
      },
      include: { connection: { include: { department: true } } },
    }),
    getPerformanceTrend(scope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
    getLongRunningConnections(scope),
    // Admin's "Unassigned Virtual Assistants" card — legacy's
    // getUnassignedVAs(). Fetched unconditionally since it's a cheap, small
    // query; only rendered when isAdmin.
    prisma.user.findMany({
      where: { role: "VA", isActive: true, teamId: null },
      include: { department: true },
      orderBy: { name: "asc" },
      take: 10,
    }),
    prisma.user.count({ where: { role: "VA", isActive: true, teamId: null } }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const emptyCounts = () => ({
    [PerformanceStatus.ON_TARGET]: 0,
    [PerformanceStatus.AT_RISK]: 0,
    [PerformanceStatus.CRITICAL]: 0,
    [PerformanceStatus.NO_DATA]: 0,
  });
  const counts = emptyCounts();
  const byDepartment = new Map<string, typeof counts>();

  for (const s of summaries) {
    counts[s.status]++;
    const deptName = s.connection.department.name;
    if (!byDepartment.has(deptName)) {
      byDepartment.set(deptName, emptyCounts());
    }
    byDepartment.get(deptName)![s.status]++;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Overview"
          description="Weekly / monthly performance across all departments."
          className="mb-0"
        />
        <PeriodNav
          anchor={weeklyStart}
          period={navPeriod}
          weekStartDay={weekStartDay}
          basePath="/dashboard"
        />
      </div>

      {totalConnections === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="max-w-5xl space-y-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <Link2 className="size-5 text-muted" />
              <div className="mt-3 text-3xl font-semibold">{totalConnections}</div>
              <div className="mt-1 text-sm text-muted">Active Connections</div>
            </div>
            {STATUS_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.status}
                  className={`rounded-xl border bg-surface p-4 ${tile.style}`}
                >
                  <Icon className="size-5" />
                  <div className="mt-3 text-3xl font-semibold">
                    {counts[tile.status]}
                  </div>
                  <div className="mt-1 text-sm">{tile.label}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="text-sm font-semibold">Performance Overview</h2>
              <p className="mb-4 text-xs text-muted">Last 6 weeks</p>
              <PerformanceTrendChart points={trend} />
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Long-Running Connections</h2>
                  <p className="text-xs text-muted">Active 180+ days</p>
                </div>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  {longRunning.length} accounts
                </span>
              </div>

              {longRunning.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  No connections have crossed 180 days yet.
                </p>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {longRunning.slice(0, 5).map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.clientName}</p>
                          <p className="truncate text-xs text-muted">{c.vaName}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {c.daysActive}d
                        </span>
                      </li>
                    ))}
                  </ul>
                  {longRunning.length > 5 && (
                    <Link
                      href="/dashboard/connections"
                      className="mt-3 inline-block text-xs text-accent hover:underline"
                    >
                      View all {longRunning.length} →
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {summaries.length === 0 ? (
            <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <Th>Department</Th>
                  <Th>On Target</Th>
                  <Th>At Risk</Th>
                  <Th>Critical</Th>
                </tr>
              </TableHead>
              <tbody>
                {[...byDepartment.entries()].map(([dept, c]) => (
                  <Tr key={dept}>
                    <Td>{dept}</Td>
                    <Td className="text-success">
                      {c[PerformanceStatus.ON_TARGET]}
                    </Td>
                    <Td className="text-warning">
                      {c[PerformanceStatus.AT_RISK]}
                    </Td>
                    <Td className="text-danger">
                      {c[PerformanceStatus.CRITICAL]}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}

          {isAdmin && (
            <UnassignedVasPanel
              vas={unassignedVAs}
              totalCount={unassignedTotal}
              teams={teams}
            />
          )}
        </div>
      )}
    </>
  );
}
