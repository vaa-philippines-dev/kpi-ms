import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { STATUS_LABEL } from "@/components/status-badge";
import { Sparkline } from "@/components/sparkline";
import { DeptTeamSummaryPanel } from "@/components/dept-team-summary-panel";
import {
  SubmissionTrackerTable,
  type SubmissionTrackerRow,
} from "@/components/submission-tracker-table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import {
  getDepartmentSubmissionSummary,
  getTeamSubmissionSummary,
} from "@/lib/dept-team-summary";
import { KpiPeriod, PerformanceStatus, UserRole } from "@/generated/prisma/enums";

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

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);
  const trendStart = new Date(
    weeklyStart.getTime() - (TREND_WEEKS - 1) * 7 * 24 * 60 * 60 * 1000,
  );

  const [connections, currentSummaries, recentSubmissions, trendSubmissions, sideRows] =
    await Promise.all([
      prisma.connection.findMany({
        where: scope,
        include: { vaUser: true, department: true },
        orderBy: { clientName: "asc" },
      }),
      prisma.performanceSummary.findMany({
        where: {
          connection: scope,
          OR: [
            { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
            { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
          ],
        },
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

  // Submitted-vs-pending tracker: worst-case status per connection/period,
  // or "not submitted" (distinct from NO_DATA, which means a submission
  // explicitly marked a KPI as having no data) when no summary row exists
  // yet — mirrors the legacy AppSubmissions grid.
  const byConnectionPeriod = new Map<string, PerformanceStatus[]>();
  for (const s of currentSummaries) {
    const key = `${s.connectionId}:${s.period}`;
    if (!byConnectionPeriod.has(key)) byConnectionPeriod.set(key, []);
    byConnectionPeriod.get(key)!.push(s.status);
  }
  function trackerStatus(connectionId: string, period: KpiPeriod) {
    const statuses = byConnectionPeriod.get(`${connectionId}:${period}`);
    if (!statuses || statuses.length === 0) return null;
    return rollupStatus(statuses);
  }

  // Paused/ended connections aren't expected to submit — mirrors legacy's
  // exclusion of paused/not-applicable connections from submission counts.
  const trackedConnections = connections.filter((c) => c.status === "ACTIVE");
  const excludedCount = connections.length - trackedConnections.length;

  const trackerRows: SubmissionTrackerRow[] = trackedConnections.map((c) => {
    const weeklyStatus = trackerStatus(c.id, KpiPeriod.WEEKLY);
    const monthlyStatus = trackerStatus(c.id, KpiPeriod.MONTHLY);
    return {
      connectionId: c.id,
      vaName: c.vaUser.name ?? c.vaUser.email,
      clientName: c.clientName,
      departmentName: c.department.name,
      weeklyStatus,
      weeklyStatusLabel: weeklyStatus ? STATUS_LABEL[weeklyStatus] : "Pending",
      monthlyStatus,
      monthlyStatusLabel: monthlyStatus ? STATUS_LABEL[monthlyStatus] : "Pending",
    };
  });

  // Scorecards — mirrors legacy's Submitted / Pending / VAs Complete stat
  // cards (AppSubmissions.html: `_subStatCard`), based on the weekly column
  // of the tracker above (legacy shows one set of cards for whichever
  // period is toggled; this app shows both periods side by side in the
  // table, so the cards summarize the weekly period specifically).
  const weeklySubmittedCount = trackerRows.filter((r) => r.weeklyStatus !== null).length;
  const weeklyTotal = trackerRows.length;
  const weeklyPendingCount = weeklyTotal - weeklySubmittedCount;
  const weeklyRatePct = weeklyTotal > 0 ? Math.round((weeklySubmittedCount / weeklyTotal) * 100) : 0;
  const vaGroups = new Map<string, { total: number; submitted: number }>();
  for (const c of trackedConnections) {
    const group = vaGroups.get(c.vaUserId) ?? { total: 0, submitted: 0 };
    group.total++;
    if (trackerStatus(c.id, KpiPeriod.WEEKLY)) group.submitted++;
    vaGroups.set(c.vaUserId, group);
  }
  const vasTotal = vaGroups.size;
  const vasComplete = [...vaGroups.values()].filter((g) => g.submitted === g.total).length;

  // Mirrors legacy's Team Report button, shown to Administrator/Manager
  // only — DM is this app's Manager equivalent (lib/connection-scope.ts).
  const canViewTeamReport = session.role === UserRole.ADMIN || session.role === UserRole.DM;

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
            {trendCounts.some((c) => c > 0) && (
              <div className="rounded-xl border border-surface-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Weekly Submission Volume</h2>
                <p className="mb-4 text-xs text-muted">Last {TREND_WEEKS} weeks</p>
                <Sparkline values={trendCounts} width={300} height={50} />
              </div>
            )}

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Current Period Status</h2>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className={`rounded-lg border p-3 ${rateStyle(weeklyRatePct)}`}>
                  <div className="text-2xl font-semibold">
                    {weeklySubmittedCount} / {weeklyTotal}
                  </div>
                  <div className="mt-0.5 text-xs">Submitted ({weeklyRatePct}%)</div>
                </div>
                <div
                  className={`rounded-lg border p-3 ${
                    weeklyPendingCount > 0 ? "border-warning/30 text-warning" : "border-success/30 text-success"
                  }`}
                >
                  <div className="text-2xl font-semibold">{weeklyPendingCount}</div>
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
              <SubmissionTrackerTable rows={trackerRows} />
            </div>

            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Recent Submissions</h2>
              {recentSubmissions.length === 0 ? (
                <ComingSoon note="No submissions yet — they'll show up here once VAs start using the form at /submit." />
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <Th>Submitted</Th>
                      <Th>VA</Th>
                      <Th>Client</Th>
                      <Th>Department</Th>
                      <Th>Period</Th>
                      <Th>Values</Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {recentSubmissions.map((sub) => (
                      <Tr key={sub.id} className="align-top">
                        <Td className="whitespace-nowrap text-muted">
                          {sub.submittedAt.toLocaleString()}
                        </Td>
                        <Td>{sub.connection.vaUser.name ?? sub.connection.vaUser.email}</Td>
                        <Td>{sub.connection.clientName}</Td>
                        <Td className="text-muted">{sub.connection.department.name}</Td>
                        <Td className="text-muted">
                          {sub.period} · {sub.periodStart.toLocaleDateString()}
                        </Td>
                        <Td className="text-muted">
                          {sub.records
                            .map((r) => `${r.kpiDefinition.name}: ${r.value}`)
                            .join(", ")}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
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
