import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { SubmissionTrendChart } from "@/components/submission-trend-chart";
import { DeptTeamSummaryPanel } from "@/components/dept-team-summary-panel";
import { PerformanceStatCards } from "@/components/performance-stat-cards";
import { PerformanceFilterBar } from "@/components/performance-filter-bar";
import {
  PerformanceSummaryTabs,
  type ConnectionSummaryRow,
  type ClientSummaryRow,
} from "@/components/performance-summary-tabs";
import { currentPeriodStart, parseAnchorDate, daysSince } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getPerformanceTrend } from "@/lib/trend";
import { getSubmissionTrend } from "@/lib/submission-trend";
import {
  getDepartmentSubmissionSummary,
  getTeamSubmissionSummary,
} from "@/lib/dept-team-summary";
import { getInterventionTypes } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import {
  ConnectionStatus,
  ConnectionType,
  KpiPeriod,
  PerformanceStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

function rateStyle(pct: number): string {
  if (pct >= 80) return "border-success/30 text-success";
  if (pct >= 60) return "border-warning/30 text-warning";
  return "border-danger/30 text-danger";
}

export default async function PerformancePage(
  props: PageProps<"/dashboard/performance">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );
  const deptFilter =
    typeof searchParams.dept === "string" && searchParams.dept ? searchParams.dept : undefined;
  const teamFilter =
    typeof searchParams.team === "string" && searchParams.team ? searchParams.team : undefined;
  const typeFilter =
    typeof searchParams.type === "string" && searchParams.type
      ? (searchParams.type as ConnectionType)
      : undefined;
  const statusFilter =
    typeof searchParams.status === "string" && searchParams.status
      ? (searchParams.status as PerformanceStatus)
      : undefined;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  const isManager =
    session.role === "ADMIN" || session.role === "DM" || session.role === "OM";

  // Team/type narrow every widget the same way; department is split out
  // separately below because getDepartmentSubmissionSummary already breaks
  // its rows out per-department and would otherwise have a fixed dept.id
  // clobbered by spreading a dept filter into its own per-row scope.
  const teamTypeScope: Prisma.ConnectionWhereInput = {
    ...(teamFilter ? { teamId: teamFilter } : {}),
    ...(typeFilter ? { connectionType: typeFilter } : {}),
  };
  const attrScope: Prisma.ConnectionWhereInput = {
    ...teamTypeScope,
    ...(deptFilter ? { departmentId: deptFilter } : {}),
  };

  const [
    totalConnections,
    summaries,
    weeklyApplicableConfigs,
    filterDepartments,
    filterTeams,
    interventionTypes,
  ] = await Promise.all([
      // ACTIVE only, matching dashboard/page.tsx's "Active Connections" tile
      // and the legacy Performance page's Total card — a paused/ended/
      // not-yet-started connection was never expected to submit or carry a
      // status this period, so counting it here inflated Total well past
      // legacy's number (838 = every status in scope vs legacy's 642 active
      // ones) and made the stat cards below it (which already roll each
      // connection's KPIs up to one status) look padded against it.
      prisma.connection.count({
        where: { AND: [scope, attrScope, { status: ConnectionStatus.ACTIVE }] },
      }),
      prisma.performanceSummary.findMany({
        where: {
          connection: { AND: [scope, attrScope] },
          OR: [
            { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
            { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
          ],
        },
        include: {
          connection: { include: { department: true, vaUser: true, team: true } },
          kpiDefinition: true,
        },
      }),
      // Connections that owe a weekly submission this period — used below to
      // stop a connection's already-known MONTHLY figure from masking a
      // missing WEEKLY one (e.g. a connection with both a weekly and monthly
      // "Account Health Rating" KPI, whose monthly figure was already
      // computed earlier this month, showed as On Target for a week it had
      // not yet submitted anything for).
      prisma.kpiConfig.findMany({
        where: {
          isApplicable: true,
          kpiDefinition: { period: KpiPeriod.WEEKLY },
          connection: { AND: [scope, attrScope] },
        },
        select: { connectionId: true },
      }),
      // Options for the filter bar — every department/team with at least one
      // connection visible to this session, regardless of the other filters
      // currently applied, so switching one filter never hides the ability
      // to pick another combination.
      prisma.department.findMany({
        where: { connections: { some: scope } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.team.findMany({
        where: { connections: { some: scope } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getInterventionTypes(),
    ]);

  const weeklyApplicable = new Set(weeklyApplicableConfigs.map((c) => c.connectionId));

  // Roll each connection's KPIs for the period up to one worst-case status —
  // the Performance Summary table (and its stat cards) are per-connection,
  // not per-KPI, mirroring legacy's Performance Analytics table. A connection
  // that owes a weekly submission only ever rolls up its WEEKLY rows here —
  // its MONTHLY row (computed from whatever it submitted earlier in the
  // month) doesn't count as "this week"'s status. Connections with no
  // applicable weekly KPI at all keep using their MONTHLY row, same as before.
  const byConnection = new Map<
    string,
    { connection: (typeof summaries)[number]["connection"]; statuses: PerformanceStatus[] }
  >();
  for (const s of summaries) {
    if (weeklyApplicable.has(s.connectionId) && s.period !== KpiPeriod.WEEKLY) continue;
    const existing = byConnection.get(s.connectionId);
    if (existing) {
      existing.statuses.push(s.status);
    } else {
      byConnection.set(s.connectionId, { connection: s.connection, statuses: [s.status] });
    }
  }

  const connectionRows: ConnectionSummaryRow[] = [...byConnection.values()].map(
    ({ connection, statuses }) => ({
      connectionId: connection.id,
      clientName: connection.clientName,
      vaName: connection.vaUser.name ?? connection.vaUser.email,
      departmentName: connection.department.name,
      teamName: connection.team?.name ?? null,
      connectionType: connection.connectionType,
      status: rollupStatus(statuses),
      durationDays: daysSince(connection.startDate ?? connection.createdAt),
      isFlagged: connection.isFlagged,
    }),
  );

  const byClient = new Map<string, ConnectionSummaryRow[]>();
  for (const row of connectionRows) {
    const rows = byClient.get(row.clientName);
    if (rows) rows.push(row);
    else byClient.set(row.clientName, [row]);
  }
  const allClientRows: ClientSummaryRow[] = [...byClient.entries()].map(
    ([clientName, rows]) => ({
      clientName,
      connectionCount: rows.length,
      departmentNames: [...new Set(rows.map((r) => r.departmentName))].join(", "),
      status: rollupStatus(rows.map((r) => r.status)),
      isFlagged: rows.some((r) => r.isFlagged),
    }),
  );

  // Status can't be pushed into the Prisma queries above — it's a rolled-up
  // value computed from this period's rows, not a stored column — so it's
  // applied here instead, then carried into every other widget below as an
  // `id IN (...)` scope over the connections that matched.
  const filteredConnectionRows = statusFilter
    ? connectionRows.filter((r) => r.status === statusFilter)
    : connectionRows;
  const clientRows = statusFilter
    ? allClientRows.filter((r) => r.status === statusFilter)
    : allClientRows;

  // Composed via AND (not a flat spread) so a same-named field in attrScope
  // (e.g. a `?dept=` picked from the URL) can never silently override a
  // same-named field session `scope` uses to enforce visibility (e.g. a DM's
  // fixed departmentId) — both conditions always apply together.
  const finalScope: Prisma.ConnectionWhereInput = {
    AND: [
      scope,
      attrScope,
      ...(statusFilter
        ? [{ id: { in: filteredConnectionRows.map((r) => r.connectionId) } }]
        : []),
    ],
  };
  const deptSummaryExtraScope: Prisma.ConnectionWhereInput = {
    AND: [
      scope,
      teamTypeScope,
      ...(statusFilter
        ? [{ id: { in: filteredConnectionRows.map((r) => r.connectionId) } }]
        : []),
    ],
  };

  const [performanceTrend, submissionTrend, sideRows] = await Promise.all([
    // Both trend charts always run on a trailing 6-week window — mirrors
    // the existing convention on /dashboard (getPerformanceTrend usage),
    // independent of the week/month toggle above for the current period.
    getPerformanceTrend(finalScope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
    getSubmissionTrend(finalScope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
    session.role === "ADMIN"
      ? getDepartmentSubmissionSummary(
          KpiPeriod.WEEKLY,
          weeklyStart,
          deptSummaryExtraScope,
          deptFilter ? [deptFilter] : undefined,
        )
      : getTeamSubmissionSummary(finalScope, KpiPeriod.WEEKLY, weeklyStart),
  ]);

  const latestSubmission = submissionTrend[submissionTrend.length - 1];
  const hasActiveFilters = Boolean(deptFilter || teamFilter || typeFilter || statusFilter);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Performance Analytics"
          description="Submission and status trends, and per-connection performance for the current week/month."
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/kpi-library"
            className="rounded-lg border border-surface-border px-3 py-2 text-xs font-medium transition hover:bg-surface-hover"
          >
            View KPI Performance
          </Link>
          <Link
            href="/dashboard/reports/weekly-interventions"
            className="rounded-lg border border-surface-border px-3 py-2 text-xs font-medium transition hover:bg-surface-hover"
          >
            View Interventions for This Week
          </Link>
        </div>
      </div>

      <PerformanceFilterBar departments={filterDepartments} teams={filterTeams} />

      {totalConnections === 0 ? (
        <ComingSoon
          note={
            hasActiveFilters
              ? "No connections match the current filters."
              : "No connections visible to your account yet."
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-surface-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Submission Trend</h2>
                <p className="mb-4 text-xs text-muted">Submitted vs Pending</p>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className={`rounded-lg border p-3 ${rateStyle(latestSubmission.ratePct)}`}>
                    <div className="text-2xl font-semibold">{latestSubmission.ratePct}%</div>
                    <div className="mt-0.5 text-xs">Submission Rate</div>
                  </div>
                  <div className="rounded-lg border border-surface-border p-3">
                    <div className="text-2xl font-semibold">{latestSubmission.pending}</div>
                    <div className="mt-0.5 text-xs text-muted">No Submissions</div>
                  </div>
                </div>
                <SubmissionTrendChart points={submissionTrend} />
              </div>

              <div className="rounded-xl border border-surface-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Performance Trend</h2>
                <p className="mb-4 text-xs text-muted">On Target / At Risk / Critical</p>
                <PerformanceStatCards
                  totalConnections={totalConnections}
                  connectionRows={filteredConnectionRows}
                  weeklyStart={weeklyStart.toISOString()}
                  isManager={isManager}
                  interventionTypes={interventionTypes}
                />
                <PerformanceTrendChart points={performanceTrend} />
              </div>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Performance Summary</h2>
                {summaries.length > 0 && (
                  <a
                    href="/api/export/performance"
                    className="text-xs text-accent hover:underline"
                  >
                    Export CSV →
                  </a>
                )}
              </div>
              {filteredConnectionRows.length === 0 ? (
                <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
              ) : (
                <PerformanceSummaryTabs
                  connectionRows={filteredConnectionRows}
                  clientRows={clientRows}
                  weeklyStart={weeklyStart.toISOString()}
                  isManager={isManager}
                  interventionTypes={interventionTypes}
                />
              )}
            </div>
          </div>

          <DeptTeamSummaryPanel
            title={session.role === "ADMIN" ? "Department Summary" : "Team Summary"}
            rows={sideRows}
            // Team Report (now /dashboard/reports/team-submissions) is
            // Admin/Manager-only, same as legacy's button — DM is this
            // app's Manager equivalent (lib/connection-scope.ts).
            showTeamReportLink={session.role === "DM"}
          />
        </div>
      )}
    </>
  );
}
