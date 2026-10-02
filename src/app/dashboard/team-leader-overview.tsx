import { prisma } from "@/lib/prisma";
import { ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PerformanceTrendChart } from "@/components/performance-trend-chart";
import { TeamConnectionsPanel, type TeamCard } from "@/components/team-connections-panel";
import { MyConnectionsSubmitPanel } from "./my-connections-submit-panel";
import { getPerformanceTrend } from "@/lib/trend";
import { formatWeekRange } from "@/lib/period";
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getSubmittedConnectionIds } from "@/lib/submitted-connections";

/**
 * Team Leader's dashboard content — mirrors legacy's renderTLDashboard()
 * (AppDashboards.html): tabbed connection cards bucketed by status with a
 * click-to-open KPI detail modal, a team-scoped performance trend, and a
 * per-connection submission tracker for the selected week. `scope` is
 * already narrowed to the TL's own team by connectionScopeWhere, so every
 * query here is automatically team-scoped.
 */
export async function TeamLeaderOverview({
  userId,
  scope,
  weeklyStart,
  period,
  periodStart,
  weekStartDay,
  anchor,
}: {
  userId: string;
  scope: Prisma.ConnectionWhereInput;
  /** Still needed for MyConnectionsSubmitPanel, which is weekly-only. */
  weeklyStart: Date;
  /**
   * Global topbar Weekly/Monthly toggle — the tiles, cards, trend and
   * submission table must follow it, same as the Performance page. This
   * used to be hardcoded to WEEKLY, so with "Monthly" selected the
   * dashboard kept showing this week's rollup while Performance showed the
   * month's, and the two disagreed on At Risk/Critical counts.
   */
  period: KpiPeriod;
  periodStart: Date;
  weekStartDay: number;
  anchor: Date | undefined;
}) {
  const [connections, kpiDefs, trend] = await Promise.all([
    prisma.connection.findMany({
      // ACTIVE only — matches the Performance page's connection count, so a
      // TL's team of e.g. 32 active accounts plus 11 END_OF_CONTRACT ones
      // doesn't read as "Total Accounts: 43" here.
      where: { ...scope, status: ConnectionStatus.ACTIVE },
      include: {
        vaUser: { select: { name: true, email: true } },
        // department/service are never read here — only the scalar
        // departmentId/serviceId FK columns are (already present without an
        // include), so fetching the full related rows was pure waste.
        performanceSummaries: {
          where: { period, periodStart },
          select: {
            kpiDefinitionId: true,
            status: true,
            targetValue: true,
            actualValue: true,
            kpiDefinition: { select: { name: true } },
          },
        },
        // Not-applicable KPIs can still have a PerformanceSummary row left
        // over from before they were marked N/A — excluded below so a stale
        // status doesn't drag down this connection's rollup.
        kpiConfigs: { where: { isApplicable: false }, select: { kpiDefinitionId: true } },
      },
      orderBy: { clientName: "asc" },
    }),
    prisma.kpiDefinition.findMany({ where: { period } }),
    getPerformanceTrend(scope, period, weekStartDay, 6, anchor),
  ]);

  if (connections.length === 0) {
    return <ComingSoon note="No connections assigned to your team yet." />;
  }

  // Submission OR a non-NO_DATA PerformanceSummary — see
  // lib/submitted-connections.ts for why neither table alone is enough.
  const submittedIds = await getSubmittedConnectionIds(
    connections.map((c) => c.id),
    period,
    periodStart,
  );
  const periodLabel =
    period === KpiPeriod.MONTHLY
      ? periodStart.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
      : formatWeekRange(periodStart);

  const cards: TeamCard[] = connections.map((c) => {
    const inapplicableKpiIds = new Set(c.kpiConfigs.map((cfg) => cfg.kpiDefinitionId));
    const applicableSummaries = excludeInapplicable(c.performanceSummaries, inapplicableKpiIds);
    const status = rollupStatus(applicableSummaries.map((s) => s.status));
    const kpiRows =
      applicableSummaries.length > 0
        ? applicableSummaries.map((s) => ({
            name: s.kpiDefinition.name,
            target: s.targetValue,
            actual: s.actualValue,
            status: s.status,
          }))
        : kpiDefs
            .filter(
              (k) =>
                k.departmentId === c.departmentId &&
                (k.serviceId === null || k.serviceId === c.serviceId) &&
                !inapplicableKpiIds.has(k.id),
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
    <div className="space-y-8">
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

      <MyConnectionsSubmitPanel userId={userId} weeklyStart={weeklyStart} />

      <TeamConnectionsPanel cards={cards} weekLabel={periodLabel} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Performance Trend</h2>
          <p className="mb-4 text-xs text-muted">
            Your team, last 6 {period === KpiPeriod.MONTHLY ? "months" : "weeks"}
          </p>
          <PerformanceTrendChart points={trend} />
        </div>

        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Submission Status</h2>
            <p className="text-xs text-muted">
              {period === KpiPeriod.MONTHLY ? periodLabel : `Week of ${periodLabel}`}
            </p>
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
