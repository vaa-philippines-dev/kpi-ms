import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Sparkline } from "@/components/sparkline";
import { PeriodNav } from "@/components/period-nav";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const TREND_WEEKS = 8;

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

  const [connections, currentSummaries, recentSubmissions, trendSubmissions] = await Promise.all([
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

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Submissions"
          description="Submitted-vs-pending status per connection, plus the raw submission log."
          className="mb-0"
        />
        <PeriodNav
          anchor={weeklyStart}
          weekStartDay={weekStartDay}
          basePath="/dashboard/submissions"
        />
      </div>

      {connections.length > 0 && (
        <a
          href="/api/export/submissions"
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      <div className="max-w-5xl space-y-10">
        {trendCounts.some((c) => c > 0) && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
              Weekly submission volume (last {TREND_WEEKS} weeks)
            </h2>
            <Sparkline values={trendCounts} width={300} height={50} />
          </div>
        )}

        {connections.length === 0 ? (
          <ComingSoon note="No connections visible to your account yet." />
        ) : (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
              Current period status
            </h2>
            {excludedCount > 0 && (
              <p className="mb-2 text-xs text-muted">
                {excludedCount} paused/ended connection
                {excludedCount === 1 ? "" : "s"} excluded — not expected to
                submit while inactive.
              </p>
            )}
            <Table>
              <TableHead>
                <tr>
                  <Th>VA / Client</Th>
                  <Th>Department</Th>
                  <Th>Weekly</Th>
                  <Th>Monthly</Th>
                </tr>
              </TableHead>
              <tbody>
                {trackedConnections.map((c) => {
                  const weekly = trackerStatus(c.id, KpiPeriod.WEEKLY);
                  const monthly = trackerStatus(c.id, KpiPeriod.MONTHLY);
                  return (
                    <Tr key={c.id}>
                      <Td>
                        {c.vaUser.name ?? c.vaUser.email}
                        <div className="text-xs text-muted">{c.clientName}</div>
                      </Td>
                      <Td className="text-muted">{c.department.name}</Td>
                      <Td>
                        {weekly ? (
                          <StatusBadge status={weekly} />
                        ) : (
                          <span className="text-xs text-muted">Not submitted</span>
                        )}
                      </Td>
                      <Td>
                        {monthly ? (
                          <StatusBadge status={monthly} />
                        ) : (
                          <span className="text-xs text-muted">Not submitted</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
            Recent submissions
          </h2>
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
    </>
  );
}
