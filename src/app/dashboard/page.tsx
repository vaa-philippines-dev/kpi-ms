import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Link2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getPerformanceTrend } from "@/lib/trend";
import { getLongRunningConnections } from "@/lib/long-running";
import { rollupStatus } from "@/lib/performance";
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

/** "7Y 11M" — compact form for the Long-Running Connections duration pill. */
function formatDurationCompact(days: number): string {
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years}Y ${months}M`;
}

export default async function DashboardOverviewPage(
  props: PageProps<"/dashboard">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );
  // Global topbar Weekly/Monthly toggle (see components/period-nav.tsx) —
  // the admin/DM tiles and department table below must show ONE period's
  // counts, not both blended together (previously always OR'd weekly +
  // monthly regardless of this toggle, so a connection's monthly report
  // from three weeks ago kept inflating the current week's tiles).
  const selectedPeriod: KpiPeriod =
    searchParams.period === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const selectedPeriodStart = currentPeriodStart(selectedPeriod, anchor, weekStartDay);

  // Team Leaders (OM) get legacy's dedicated dashboard — tabbed connection
  // cards + KPI drill-down, team-scoped trend, submission tracker — instead
  // of the cross-department tiles/long-running view below, which doesn't
  // make sense once `scope` is narrowed to a single team.
  if (session.role === "OM") {
    return (
      <>
        <PageHeader title="Dashboard" description="Your team's KPI performance." />
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
        <PageHeader title="Dashboard" description="System-wide KPI performance." />
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
        <PageHeader title="Dashboard" description="Your connections and this week's submissions." />
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
        period: selectedPeriod,
        periodStart: selectedPeriodStart,
      },
      include: { connection: { include: { department: true } } },
    }),
    getPerformanceTrend(scope, selectedPeriod, weekStartDay, 6, anchor),
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

  // Roll each connection's KPIs (weekly + monthly combined, same convention
  // as dashboard/performance's connectionRows) up to one worst-case status
  // before tallying — summaries has one row per KPI per connection, so
  // counting rows directly (the previous approach) multiplied every
  // connection with more than one weekly/monthly KPI, inflating On
  // Target/At Risk/Critical well past the Active Connections count above
  // them (e.g. 1,343 status-tile total against only 644 active connections).
  const byConnection = new Map<
    string,
    { deptName: string; statuses: PerformanceStatus[] }
  >();
  for (const s of summaries) {
    const existing = byConnection.get(s.connectionId);
    if (existing) existing.statuses.push(s.status);
    else
      byConnection.set(s.connectionId, {
        deptName: s.connection.department.name,
        statuses: [s.status],
      });
  }
  for (const { deptName, statuses } of byConnection.values()) {
    const rolled = rollupStatus(statuses);
    counts[rolled]++;
    if (!byDepartment.has(deptName)) {
      byDepartment.set(deptName, emptyCounts());
    }
    byDepartment.get(deptName)![rolled]++;
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Weekly / monthly performance across all departments."
      />

      {totalConnections === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="space-y-8">
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
              <p className="mb-4 text-xs text-muted">
                Last 6 {selectedPeriod === KpiPeriod.MONTHLY ? "months" : "weeks"}
              </p>
              <PerformanceTrendChart points={trend} />
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Long-Running Connections</h2>
                  <p className="text-xs text-muted">Active 180+ days</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
                    <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                    {longRunning.length} ACCOUNTS
                  </span>
                  <Link
                    href="/dashboard/connections"
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-hover"
                  >
                    View All
                  </Link>
                </div>
              </div>

              {longRunning.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  No connections have crossed 180 days yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-medium tracking-wide text-muted uppercase">
                      <th className="pb-2 text-left">Client</th>
                      <th className="pb-2 text-left">VA</th>
                      <th className="pb-2 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {longRunning.slice(0, 5).map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-2 font-medium">{c.clientName}</td>
                        <td className="py-2.5 pr-2 text-muted">{c.vaName}</td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
                            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                            {formatDurationCompact(c.daysActive)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
