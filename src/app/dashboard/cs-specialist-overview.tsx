import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CsStatusTable, type CsStatusRow } from "@/components/cs-status-table";
import { CsClientTable, type CsClientRow } from "@/components/cs-client-table";
import { formatWeekRange } from "@/lib/period";
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
import { countPendingStatusRequests } from "@/lib/status-requests";
import type { ScopingSession } from "@/lib/connection-scope";
import { ConnectionStatus, CustomerStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

// Same "live" set lib/cms-sync/cs-sync.ts uses to derive Customer.status.
const LIVE_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.ACTIVE,
  ConnectionStatus.PAUSED,
  ConnectionStatus.PENDING,
]);

const STATUS_TILES = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", style: "border-success/30 text-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", style: "border-warning/30 text-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", style: "border-danger/30 text-danger" },
] as const;

/**
 * CS_SPECIALIST's dashboard — their own client book (CsClientAssignment,
 * synced from the CMS's Customers.AssignedSpecialist) and this week's KPI
 * standing of every live VA connection under those clients.
 */
export async function CsSpecialistOverview({
  session,
  weeklyStart,
}: {
  session: ScopingSession;
  weeklyStart: Date;
}) {
  const [assignments, pendingRequests] = await Promise.all([
    prisma.csClientAssignment.findMany({
      where: { csUserId: session.id, isActive: true },
      include: {
        customer: {
          include: {
            connections: {
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
                // Not-applicable KPIs can still carry a stale summary row —
                // excluded from the rollup, same as CsOverview.
                kpiConfigs: { where: { isApplicable: false }, select: { kpiDefinitionId: true } },
              },
              orderBy: { clientName: "asc" },
            },
          },
        },
      },
    }),
    countPendingStatusRequests(session),
  ]);

  const connectionRows: CsStatusRow[] = [];
  const clientRows: CsClientRow[] = assignments.map((a) => {
    const live = a.customer.connections.filter((c) => LIVE_STATUSES.has(c.status));
    const perConnection = live.map((c) => {
      const inapplicable = new Set(c.kpiConfigs.map((cfg) => cfg.kpiDefinitionId));
      const summaries = excludeInapplicable(c.performanceSummaries, inapplicable);
      const row: CsStatusRow = {
        id: c.id,
        clientName: c.clientName,
        vaName: c.vaUser.name ?? c.vaUser.email,
        status: rollupStatus(summaries.map((s) => s.status)),
        kpiRows: summaries.map((s) => ({
          name: s.kpiDefinition.name,
          target: s.targetValue,
          actual: s.actualValue,
          status: s.status,
        })),
      };
      connectionRows.push(row);
      return row;
    });
    return {
      id: a.id,
      clientName: a.customer.name,
      assignmentCode: a.code,
      status: a.customer.status,
      cmsStatus: a.customer.cmsStatus ?? "",
      liveConnections: live.length,
      vaNames: perConnection.map((r) => r.vaName).join(", "),
      performance: rollupStatus(perConnection.map((r) => r.status)),
    };
  });
  connectionRows.sort((x, y) => x.clientName.localeCompare(y.clientName));

  const activeClients = clientRows.filter((r) => r.status === CustomerStatus.ACTIVE).length;
  const counts = Object.fromEntries(
    STATUS_TILES.map((t) => [t.status, connectionRows.filter((r) => r.status === t.status).length]),
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{activeClients}</div>
          <div className="mt-1 text-sm text-muted">Active Clients</div>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{connectionRows.length}</div>
          <div className="mt-1 text-sm text-muted">Live VA Connections</div>
        </div>
        <Link
          href="/dashboard/status-requests"
          className={`rounded-xl border bg-surface p-4 transition hover:bg-surface-hover ${
            pendingRequests > 0 ? "border-accent/40 text-accent" : "border-surface-border"
          }`}
        >
          <div className="text-3xl font-semibold">{pendingRequests}</div>
          <div className="mt-1 text-sm">Pending Status Requests</div>
        </Link>
        {STATUS_TILES.map((tile) => (
          <div key={tile.status} className={`rounded-xl border bg-surface p-4 ${tile.style}`}>
            <div className="text-3xl font-semibold">{counts[tile.status]}</div>
            <div className="mt-1 text-sm">{tile.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">My Clients</h2>
        <CsClientTable rows={clientRows} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
          VA Connections — {formatWeekRange(weeklyStart)}
        </h2>
        <CsStatusTable rows={connectionRows} weekLabel={formatWeekRange(weeklyStart)} />
      </div>
    </div>
  );
}
