import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { PeriodNav } from "@/components/period-nav";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { SubmissionTrendChart } from "@/components/submission-trend-chart";
import { DeptTeamSummaryPanel } from "@/components/dept-team-summary-panel";
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
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
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

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  const [totalConnections, summaries, performanceTrend, submissionTrend, sideRows] =
    await Promise.all([
      prisma.connection.count({ where: scope }),
      prisma.performanceSummary.findMany({
        where: {
          connection: scope,
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
      // Both trend charts always run on a trailing 6-week window — mirrors
      // the existing convention on /dashboard (getPerformanceTrend usage),
      // independent of the week/month toggle above for the current period.
      getPerformanceTrend(scope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
      getSubmissionTrend(scope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
      session.role === "ADMIN"
        ? getDepartmentSubmissionSummary(KpiPeriod.WEEKLY, weeklyStart)
        : getTeamSubmissionSummary(scope, KpiPeriod.WEEKLY, weeklyStart),
    ]);

  // Roll each connection's KPIs for the period up to one worst-case status —
  // the Performance Summary table (and its stat cards) are per-connection,
  // not per-KPI, mirroring legacy's Performance Analytics table.
  const byConnection = new Map<
    string,
    { connection: (typeof summaries)[number]["connection"]; statuses: PerformanceStatus[] }
  >();
  for (const s of summaries) {
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
      durationDays: daysSince(connection.createdAt),
      isFlagged: connection.isFlagged,
    }),
  );

  const byClient = new Map<string, ConnectionSummaryRow[]>();
  for (const row of connectionRows) {
    const rows = byClient.get(row.clientName);
    if (rows) rows.push(row);
    else byClient.set(row.clientName, [row]);
  }
  const clientRows: ClientSummaryRow[] = [...byClient.entries()].map(
    ([clientName, rows]) => ({
      clientName,
      connectionCount: rows.length,
      departmentNames: [...new Set(rows.map((r) => r.departmentName))].join(", "),
      status: rollupStatus(rows.map((r) => r.status)),
      isFlagged: rows.some((r) => r.isFlagged),
    }),
  );

  const perfCounts = { onTarget: 0, atRisk: 0, critical: 0 };
  for (const row of connectionRows) {
    if (row.status === PerformanceStatus.ON_TARGET) perfCounts.onTarget++;
    else if (row.status === PerformanceStatus.AT_RISK) perfCounts.atRisk++;
    else if (row.status === PerformanceStatus.CRITICAL) perfCounts.critical++;
  }

  const latestSubmission = submissionTrend[submissionTrend.length - 1];

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
          <PeriodNav anchor={weeklyStart} weekStartDay={weekStartDay} basePath="/dashboard/performance" />
        </div>
      </div>

      {totalConnections === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
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
                <div className="mb-4 grid grid-cols-4 gap-2">
                  <div className="rounded-lg border border-surface-border p-3">
                    <div className="text-2xl font-semibold">{totalConnections}</div>
                    <div className="mt-0.5 text-xs text-muted">Total</div>
                  </div>
                  <div className="rounded-lg border border-success/30 p-3 text-success">
                    <div className="text-2xl font-semibold">{perfCounts.onTarget}</div>
                    <div className="mt-0.5 text-xs">On Target</div>
                  </div>
                  <div className="rounded-lg border border-warning/30 p-3 text-warning">
                    <div className="text-2xl font-semibold">{perfCounts.atRisk}</div>
                    <div className="mt-0.5 text-xs">At Risk</div>
                  </div>
                  <div className="rounded-lg border border-danger/30 p-3 text-danger">
                    <div className="text-2xl font-semibold">{perfCounts.critical}</div>
                    <div className="mt-0.5 text-xs">Critical</div>
                  </div>
                </div>
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
              {connectionRows.length === 0 ? (
                <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
              ) : (
                <PerformanceSummaryTabs connectionRows={connectionRows} clientRows={clientRows} />
              )}
            </div>
          </div>

          <DeptTeamSummaryPanel
            title={session.role === "ADMIN" ? "Department Summary" : "Team Summary"}
            rows={sideRows}
            showTeamReportLink={session.role !== "ADMIN"}
          />
        </div>
      )}
    </>
  );
}
