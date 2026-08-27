import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay, getInterventionTypes } from "@/lib/settings";
import { getPerformanceTrend } from "@/lib/trend";
import { getLongRunningConnections } from "@/lib/long-running";
import { rollupStatus, excludeInapplicablePairs, loadInapplicableKpiPairs } from "@/lib/performance";
import { UnassignedVasPanel } from "@/components/unassigned-vas-panel";
import { DepartmentBreakdownTable, type DeptConnectionRow } from "./department-breakdown-table";
import { DashboardStatCards } from "./dashboard-stat-cards";
import { TeamLeaderOverview } from "./team-leader-overview";
import { CsOverview } from "./cs-overview";
import { VaOverview } from "./va-overview";
import { MyConnectionsSubmitPanel } from "./my-connections-submit-panel";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

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
          userId={session.id}
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
        <CsOverview userId={session.id} scope={scope} weeklyStart={weeklyStart} />
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
    interventionTypes,
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
      include: { connection: { include: { department: true, vaUser: true } } },
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
    getInterventionTypes(),
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
  // Drop any summary for a KPI since marked not-applicable for its
  // connection — its PerformanceSummary row isn't cleaned up when that
  // happens, so it would otherwise still drag down the connection's rollup.
  const inapplicablePairs = await loadInapplicableKpiPairs(scope);
  const applicableSummaries = excludeInapplicablePairs(summaries, inapplicablePairs);

  const byConnection = new Map<
    string,
    { connection: (typeof summaries)[number]["connection"]; statuses: PerformanceStatus[] }
  >();
  for (const s of applicableSummaries) {
    const existing = byConnection.get(s.connectionId);
    if (existing) existing.statuses.push(s.status);
    else byConnection.set(s.connectionId, { connection: s.connection, statuses: [s.status] });
  }
  // Per-department VA list backing the Department Breakdown table's
  // click-to-drill-down modal below.
  const connectionsByDept = new Map<string, DeptConnectionRow[]>();
  for (const [connectionId, { connection, statuses }] of byConnection) {
    const rolled = rollupStatus(statuses);
    const deptName = connection.department.name;
    counts[rolled]++;
    if (!byDepartment.has(deptName)) {
      byDepartment.set(deptName, emptyCounts());
    }
    byDepartment.get(deptName)![rolled]++;

    if (!connectionsByDept.has(deptName)) connectionsByDept.set(deptName, []);
    connectionsByDept.get(deptName)!.push({
      connectionId,
      clientName: connection.clientName,
      vaName: connection.vaUser.name ?? connection.vaUser.email,
      status: rolled,
    });
  }
  // Flat, cross-department list backing the top stat tiles' drill-down —
  // clicking "Critical" should show every critical connection, not just one
  // department's, unlike the per-department table below.
  const allConnectionRows = [...connectionsByDept.values()].flat();

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
          <DashboardStatCards
            totalConnections={totalConnections}
            counts={counts}
            connectionRows={allConnectionRows}
            periodStart={selectedPeriodStart.toISOString()}
            period={selectedPeriod}
            interventionTypes={interventionTypes}
          />

          <MyConnectionsSubmitPanel userId={session.id} weeklyStart={weeklyStart} />

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
            <DepartmentBreakdownTable
              rows={[...byDepartment.entries()].map(([name, c]) => ({
                name,
                onTarget: c[PerformanceStatus.ON_TARGET],
                atRisk: c[PerformanceStatus.AT_RISK],
                critical: c[PerformanceStatus.CRITICAL],
              }))}
              connectionsByDept={Object.fromEntries(connectionsByDept)}
              periodStart={selectedPeriodStart.toISOString()}
              period={selectedPeriod}
              // This branch is only reached by ADMIN/DM/OPS_MANAGER — OM,
              // SERVICE_MANAGER, and VA all return their own dashboard above.
              isManager
              interventionTypes={interventionTypes}
            />
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
