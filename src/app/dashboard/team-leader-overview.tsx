import { prisma } from "@/lib/prisma";
import { ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { TeamConnectionsPanel, type TeamCard } from "@/components/team-connections-panel";
import { getPerformanceTrend } from "@/lib/trend";
import { formatWeekRange } from "@/lib/period";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Team Leader's dashboard content — mirrors legacy's renderTLDashboard()
 * (AppDashboards.html): tabbed connection cards bucketed by status with a
 * click-to-open KPI detail modal, a team-scoped performance trend, and a
 * per-connection submission tracker for the selected week. `scope` is
 * already narrowed to the TL's own team by connectionScopeWhere, so every
 * query here is automatically team-scoped.
 */
export async function TeamLeaderOverview({
  scope,
  weeklyStart,
  weekStartDay,
  anchor,
}: {
  scope: Prisma.ConnectionWhereInput;
  weeklyStart: Date;
  weekStartDay: number;
  anchor: Date | undefined;
}) {
  const [connections, submittedRows, kpiDefs, trend] = await Promise.all([
    prisma.connection.findMany({
      where: scope,
      include: {
        vaUser: true,
        department: true,
        service: true,
        performanceSummaries: {
          where: { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
          include: { kpiDefinition: true },
        },
      },
      orderBy: { clientName: "asc" },
    }),
    prisma.submission.findMany({
      where: { connection: scope, period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
      select: { connectionId: true },
    }),
    prisma.kpiDefinition.findMany({ where: { period: KpiPeriod.WEEKLY } }),
    getPerformanceTrend(scope, KpiPeriod.WEEKLY, weekStartDay, 6, anchor),
  ]);

  if (connections.length === 0) {
    return <ComingSoon note="No connections assigned to your team yet." />;
  }

  const submittedIds = new Set(submittedRows.map((s) => s.connectionId));
  const weekLabel = formatWeekRange(weeklyStart);

  const cards: TeamCard[] = connections.map((c) => {
    const status = rollupStatus(c.performanceSummaries.map((s) => s.status));
    const kpiRows =
      c.performanceSummaries.length > 0
        ? c.performanceSummaries.map((s) => ({
            name: s.kpiDefinition.name,
            target: s.targetValue,
            actual: s.actualValue,
            status: s.status,
          }))
        : kpiDefs
            .filter(
              (k) =>
                k.departmentId === c.departmentId &&
                (k.serviceId === null || k.serviceId === c.serviceId),
            )
            .map((k) => ({
              name: k.name,
              target: k.targetValue,
              actual: null,
              status: PerformanceStatus.NO_DATA,
            }));
    return {
      id: c.id,
      clientName: c.clientName,
      vaName: c.vaUser.name ?? c.vaUser.email,
      status,
      kpiRows,
    };
  });

  const criticalCount = cards.filter(
    (c) => c.status === PerformanceStatus.CRITICAL,
  ).length;
  const atRiskCount = cards.filter(
    (c) => c.status === PerformanceStatus.AT_RISK,
  ).length;

  return (
    <div className="max-w-5xl space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{connections.length}</div>
          <div className="mt-1 text-sm text-muted">Total Accounts</div>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">
            {submittedIds.size}
            <span className="text-lg text-muted"> / {connections.length}</span>
          </div>
          <div className="mt-1 text-sm text-muted">Submissions</div>
        </div>
        <div className="rounded-xl border border-warning/30 bg-surface p-4 text-warning">
          <div className="text-3xl font-semibold">{atRiskCount}</div>
          <div className="mt-1 text-sm">At Risk</div>
        </div>
        <div className="rounded-xl border border-danger/30 bg-surface p-4 text-danger">
          <div className="text-3xl font-semibold">{criticalCount}</div>
          <div className="mt-1 text-sm">Critical</div>
        </div>
      </div>

      <TeamConnectionsPanel cards={cards} weekLabel={weekLabel} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Performance Trend</h2>
          <p className="mb-4 text-xs text-muted">Your team, last 6 weeks</p>
          <PerformanceTrendChart points={trend} />
        </div>

        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Submission Status</h2>
            <p className="text-xs text-muted">Week of {weekLabel}</p>
          </div>
          <Table>
            <TableHead>
              <tr>
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Status</Th>
              </tr>
            </TableHead>
            <tbody>
              {connections.map((c) => (
                <Tr key={c.id}>
                  <Td>{c.vaUser.name ?? c.vaUser.email}</Td>
                  <Td className="text-muted">{c.clientName}</Td>
                  <Td>
                    {submittedIds.has(c.id) ? (
                      <Badge tone="success">Submitted</Badge>
                    ) : (
                      <Badge tone="warning">Not Yet</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}
