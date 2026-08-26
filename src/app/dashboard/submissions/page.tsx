import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Sparkline } from "@/components/sparkline";
import { DeptTeamSummaryPanel } from "@/components/dept-team-summary-panel";
import {
  SubmissionTrackerTable,
  type SubmissionTrackerRow,
} from "@/components/submission-tracker-table";
import {
  RecentSubmissionsTable,
  type RecentSubmissionRow,
} from "@/components/recent-submissions-table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import {
  getDepartmentSubmissionSummary,
  getTeamSubmissionSummary,
} from "@/lib/dept-team-summary";
import { KpiPeriod, UserRole } from "@/generated/prisma/enums";

const TREND_WEEKS = 8;

function rateStyle(pct: number): string {
  if (pct >= 80) return "border-success/30 text-success";
  if (pct >= 50) return "border-warning/30 text-warning";
  return "border-danger/30 text-danger";
}

export default async function SubmissionsPage(
  props: PageProps<"/dashboard/submissions">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );
  // Mirrors PeriodNav's own reading of ?period= — same page, same toggle.
  const selectedPeriod: KpiPeriod =
    typeof searchParams.period === "string" && searchParams.period === "monthly"
      ? KpiPeriod.MONTHLY
      : KpiPeriod.WEEKLY;
  const isMonthly = selectedPeriod === KpiPeriod.MONTHLY;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);
  const selectedPeriodStart = isMonthly ? monthlyStart : weeklyStart;
  const trendStart = new Date(
    weeklyStart.getTime() - (TREND_WEEKS - 1) * 7 * 24 * 60 * 60 * 1000,
  );

  const [connections, currentPeriodSubmissions, recentSubmissions, trendSubmissions, sideRows] =
    await Promise.all([
      prisma.connection.findMany({
        where: scope,
        include: { vaUser: true, department: true },
        orderBy: { clientName: "asc" },
      }),
      prisma.submission.findMany({
        where: {
          connection: scope,
          period: selectedPeriod,
          periodStart: selectedPeriodStart,
        },
        select: { connectionId: true },
      }),
      prisma.submission.findMany({
        where: { connection: scope },
        orderBy: { submittedAt: "desc" },
        take: 50,
        include: {
          connection: { include: { department: true, vaUser: true } },
          records: { include: { kpiDefinition: true } },
        },
      }),
      prisma.submission.findMany({
        where: {
          connection: scope,
          period: KpiPeriod.WEEKLY,
          periodStart: { gte: trendStart },
        },
        select: { periodStart: true },
      }),
      session.role === UserRole.ADMIN
        ? getDepartmentSubmissionSummary(KpiPeriod.WEEKLY, weeklyStart)
        : getTeamSubmissionSummary(scope, KpiPeriod.WEEKLY, weeklyStart),
    ]);

  // Submission volume per week, oldest-first, zero-filled for weeks with no
  // submissions — mirrors legacy getSubmissionTrendData().
  const weekBuckets: Date[] = [];
  for (let i = TREND_WEEKS - 1; i >= 0; i--) {
    weekBuckets.push(new Date(weeklyStart.getTime() - i * 7 * 24 * 60 * 60 * 1000));
  }
  const countsByWeek = new Map<string, number>();
  for (const s of trendSubmissions) {
    const key = s.periodStart.toISOString();
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  }
  const trendCounts = weekBuckets.map(
    (w) => countsByWeek.get(w.toISOString()) ?? 0,
  );

  // Submitted-vs-pending tracker: has this connection got an actual
  // Submission row for the selected period? Deliberately NOT derived from
  // PerformanceSummary — that table's rows are never deleted
  // (recomputePerformanceSummary falls back to NO_DATA instead), so a
  // deleted/moved submission would leave a stale row that still reads as
  // "submitted" even though no Submission exists anymore — mirrors the
  // legacy AppSubmissions grid.
  const submittedConnectionIds = new Set(currentPeriodSubmissions.map((s) => s.connectionId));
  function trackerStatus(connectionId: string) {
    return submittedConnectionIds.has(connectionId);
  }

  // Paused/ended connections aren't expected to submit — mirrors legacy's
  // exclusion of paused/not-applicable connections from submission counts.
  const trackedConnections = connections.filter((c) => c.status === "ACTIVE");
  const excludedCount = connections.length - trackedConnections.length;

  const recentSubmissionRows: RecentSubmissionRow[] = recentSubmissions.map((sub) => ({
    id: sub.id,
    submittedAt: sub.submittedAt.toISOString(),
    vaName: sub.connection.vaUser.name ?? sub.connection.vaUser.email,
    clientName: sub.connection.clientName,
    departmentName: sub.connection.department.name,
    period: sub.period,
    periodStart: sub.periodStart.toISOString(),
    valuesLabel: sub.records
      .map((r) => `${r.kpiDefinition.name}: ${r.noData ? "No data" : r.value}`)
      .join(", "),
  }));

  const trackerRows: SubmissionTrackerRow[] = trackedConnections.map((c) => {
    const submitted = trackerStatus(c.id);
    return {
      connectionId: c.id,
      vaName: c.vaUser.name ?? c.vaUser.email,
      clientName: c.clientName,
      departmentName: c.department.name,
      submitted,
      statusLabel: submitted ? "Submitted" : "Pending",
    };
  });

  // Scorecards — mirrors legacy's Submitted / Pending / VAs Complete stat
  // cards (AppSubmissions.html: `_subStatCard`), now computed for whichever
  // period the navbar toggle currently selects, rather than always weekly.
  const periodSubmittedCount = trackerRows.filter((r) => r.submitted).length;
  const periodTotal = trackerRows.length;
  const periodPendingCount = periodTotal - periodSubmittedCount;
  const periodRatePct = periodTotal > 0 ? Math.round((periodSubmittedCount / periodTotal) * 100) : 0;
  const vaGroups = new Map<string, { total: number; submitted: number }>();
  for (const c of trackedConnections) {
    const group = vaGroups.get(c.vaUserId) ?? { total: 0, submitted: 0 };
    group.total++;
    if (trackerStatus(c.id)) group.submitted++;
    vaGroups.set(c.vaUserId, group);
  }
  const vasTotal = vaGroups.size;
  const vasComplete = [...vaGroups.values()].filter((g) => g.submitted === g.total).length;

  // Mirrors legacy's Team Report button, shown to Administrator/Manager
  // only — DM and the DM-equivalent OPS_MANAGER are this app's Manager
  // equivalent (lib/connection-scope.ts).
  const canViewTeamReport =
    session.role === UserRole.ADMIN ||
    session.role === UserRole.DM ||
    session.role === UserRole.OPS_MANAGER;

  // Who can correct/remove a wrongly-dated submission (click a VA's name in
  // the tracker table below) — kept in sync with SUBMISSION_EDITOR_ROLES in
  // ./actions.ts.
  const canEditSubmissions =
    session.role === UserRole.ADMIN ||
    session.role === UserRole.DM ||
    session.role === UserRole.OPS_MANAGER ||
    session.role === UserRole.OM;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Submissions"
          description="Submitted-vs-pending status per connection, plus the raw submission log."
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          {canViewTeamReport && (
            <Link
              href="/dashboard/reports/team-submissions"
              className="rounded-lg border border-surface-border px-3 py-2 text-xs font-medium transition hover:bg-surface-hover"
            >
              Team Report
            </Link>
          )}
        </div>
      </div>

      {connections.length > 0 && (
        <a
          href="/api/export/submissions"
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      {connections.length === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Recent Submissions</h2>
              {recentSubmissions.length === 0 ? (
                <ComingSoon note="No submissions yet — they'll show up here once VAs start using the form at /submit." />
              ) : (
                <RecentSubmissionsTable rows={recentSubmissionRows} canEdit={canEditSubmissions} />
              )}
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold">
                Current Period Status <span className="font-normal text-muted">({isMonthly ? "Monthly" : "Weekly"})</span>
              </h2>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className={`rounded-lg border p-3 ${rateStyle(periodRatePct)}`}>
                  <div className="text-2xl font-semibold">
                    {periodSubmittedCount} / {periodTotal}
                  </div>
                  <div className="mt-0.5 text-xs">Submitted ({periodRatePct}%)</div>
                </div>
                <div
                  className={`rounded-lg border p-3 ${
                    periodPendingCount > 0 ? "border-warning/30 text-warning" : "border-success/30 text-success"
                  }`}
                >
                  <div className="text-2xl font-semibold">{periodPendingCount}</div>
                  <div className="mt-0.5 text-xs">Pending</div>
                </div>
                <div className="rounded-lg border border-surface-border p-3">
                  <div className="text-2xl font-semibold">
                    {vasComplete} / {vasTotal}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">VAs Complete</div>
                </div>
              </div>
              {excludedCount > 0 && (
                <p className="mb-3 text-xs text-muted">
                  {excludedCount} paused/ended connection
                  {excludedCount === 1 ? "" : "s"} excluded — not expected to
                  submit while inactive.
                </p>
              )}
              <SubmissionTrackerTable
                rows={trackerRows}
                periodLabel={isMonthly ? "Monthly" : "Weekly"}
                canEdit={canEditSubmissions}
              />
            </div>

            {trendCounts.some((c) => c > 0) && (
              <div className="rounded-xl border border-surface-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Weekly Submission Volume</h2>
                <p className="mb-4 text-xs text-muted">Last {TREND_WEEKS} weeks</p>
                <Sparkline values={trendCounts} width={300} height={50} />
              </div>
            )}
          </div>

          <DeptTeamSummaryPanel
            title={session.role === UserRole.ADMIN ? "Department Summary" : "Team Summary"}
            rows={sideRows}
          />
        </div>
      )}
    </>
  );
}
