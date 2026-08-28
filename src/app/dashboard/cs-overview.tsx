import { prisma } from "@/lib/prisma";
import { ComingSoon } from "@/components/page-header";
import { CsStatusTable, type CsStatusRow } from "@/components/cs-status-table";
import { MyConnectionsSubmitPanel } from "./my-connections-submit-panel";
import { formatWeekRange } from "@/lib/period";
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const STATUS_TILES = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", style: "border-success/30 text-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", style: "border-warning/30 text-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", style: "border-danger/30 text-danger" },
] as const;

/**
 * CS Specialist's dashboard content — mirrors legacy's renderCSDashboard()
 * (AppDashboards.html): system-wide stat cards plus a single flat
 * connection-status table with a click-to-open KPI detail modal. `scope`
 * is unscoped for this role (see connectionScopeWhere), matching legacy's
 * "System-Wide Performance" table title.
 */
export async function CsOverview({
  userId,
  scope,
  weeklyStart,
}: {
  userId: string;
  scope: Prisma.ConnectionWhereInput;
  weeklyStart: Date;
}) {
  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: { select: { name: true, email: true } },
      performanceSummaries: {
        where: { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
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
  });

  if (connections.length === 0) {
    return <ComingSoon note="No connections in the system yet." />;
  }

  const weekLabel = formatWeekRange(weeklyStart);

  const rows: CsStatusRow[] = connections.map((c) => {
    const inapplicableKpiIds = new Set(c.kpiConfigs.map((cfg) => cfg.kpiDefinitionId));
    const applicableSummaries = excludeInapplicable(c.performanceSummaries, inapplicableKpiIds);
    return {
      id: c.id,
      clientName: c.clientName,
      vaName: c.vaUser.name ?? c.vaUser.email,
      status: rollupStatus(applicableSummaries.map((s) => s.status)),
      kpiRows: applicableSummaries.map((s) => ({
        name: s.kpiDefinition.name,
        target: s.targetValue,
        actual: s.actualValue,
        status: s.status,
      })),
    };
  });

  const counts = {
    [PerformanceStatus.ON_TARGET]: rows.filter((r) => r.status === PerformanceStatus.ON_TARGET).length,
    [PerformanceStatus.AT_RISK]: rows.filter((r) => r.status === PerformanceStatus.AT_RISK).length,
    [PerformanceStatus.CRITICAL]: rows.filter((r) => r.status === PerformanceStatus.CRITICAL).length,
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{connections.length}</div>
          <div className="mt-1 text-sm text-muted">Total Connections</div>
        </div>
        {STATUS_TILES.map((tile) => (
          <div
            key={tile.status}
            className={`rounded-xl border bg-surface p-4 ${tile.style}`}
          >
            <div className="text-3xl font-semibold">{counts[tile.status]}</div>
            <div className="mt-1 text-sm">{tile.label}</div>
          </div>
        ))}
      </div>

      <MyConnectionsSubmitPanel userId={userId} weeklyStart={weeklyStart} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
          System-Wide Performance
        </h2>
        <CsStatusTable rows={rows} weekLabel={weekLabel} />
      </div>
    </div>
  );
}
