import { prisma } from "@/lib/prisma";
import { CsStatusTable } from "@/components/cs-status-table";
import { CsClientTable } from "@/components/cs-client-table";
import { CsTeamTable, type CsTeamRow } from "@/components/cs-team-table";
import { formatWeekRange } from "@/lib/period";
import { loadCsBook } from "@/lib/cs-book";
import { CustomerStatus, PerformanceStatus, StatusChangeRequestState, UserRole } from "@/generated/prisma/enums";
import { STATUS_TILES, StatTile, PendingRequestsTile } from "./cs-specialist-overview";

/**
 * CS_MANAGER's dashboard — a department-manager-style view across the whole
 * CS team: team-wide tiles, a per-specialist breakdown, then every client
 * and live VA connection with a CS filter. Same scope as
 * connectionScopeWhere's CS_MANAGER branch (any client with an active CS).
 */
export async function CsManagerOverview({ weeklyStart }: { weeklyStart: Date }) {
  const [{ clientRows, connectionRows }, specialists, pending] = await Promise.all([
    loadCsBook({ isActive: true }, weeklyStart),
    prisma.user.findMany({
      where: { role: UserRole.CS_SPECIALIST },
      select: { id: true, name: true, email: true, isActive: true },
    }),
    prisma.statusChangeRequest.findMany({
      where: {
        state: StatusChangeRequestState.PENDING,
        connection: { customer: { csAssignments: { some: { isActive: true } } } },
      },
      select: {
        connection: {
          select: {
            customer: { select: { csAssignments: { where: { isActive: true }, select: { csUserId: true } } } },
          },
        },
      },
    }),
  ]);

  const pendingByCs = new Map<string, number>();
  for (const r of pending) {
    for (const a of r.connection.customer?.csAssignments ?? []) {
      pendingByCs.set(a.csUserId, (pendingByCs.get(a.csUserId) ?? 0) + 1);
    }
  }

  const teamRows: CsTeamRow[] = specialists
    .map((u) => {
      const clients = clientRows.filter((c) => c.csUserId === u.id);
      const conns = connectionRows.filter((c) => c.csUserId === u.id);
      const count = (s: PerformanceStatus) => conns.filter((c) => c.status === s).length;
      return {
        id: u.id,
        name: u.name ?? u.email,
        email: u.email,
        isActive: u.isActive,
        activeClients: clients.filter((c) => c.status === CustomerStatus.ACTIVE).length,
        totalClients: clients.length,
        liveConnections: conns.length,
        pendingRequests: pendingByCs.get(u.id) ?? 0,
        onTarget: count(PerformanceStatus.ON_TARGET),
        atRisk: count(PerformanceStatus.AT_RISK),
        critical: count(PerformanceStatus.CRITICAL),
        noData: count(PerformanceStatus.NO_DATA),
      };
    })
    // Hide empty inactive accounts; an inactive CS still holding clients
    // stays visible so their orphaned book gets noticed.
    .filter((r) => r.isActive || r.totalClients > 0);

  const activeClients = clientRows.filter((r) => r.status === CustomerStatus.ACTIVE).length;
  const weekLabel = formatWeekRange(weeklyStart);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile value={teamRows.filter((r) => r.isActive).length} label="Specialists" />
        <StatTile value={activeClients} label="Active Clients" />
        <StatTile value={connectionRows.length} label="Live VA Connections" />
        <PendingRequestsTile count={pending.length} />
        {STATUS_TILES.map((tile) => (
          <div key={tile.status} className={`rounded-xl border bg-surface p-4 ${tile.style}`}>
            <div className="text-3xl font-semibold">
              {connectionRows.filter((r) => r.status === tile.status).length}
            </div>
            <div className="mt-1 text-sm">{tile.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">Specialists — {weekLabel}</h2>
        <CsTeamTable rows={teamRows} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">All Clients</h2>
        <CsClientTable rows={clientRows} showCs />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">VA Connections — {weekLabel}</h2>
        <CsStatusTable rows={connectionRows} weekLabel={weekLabel} showCs />
      </div>
    </div>
  );
}
