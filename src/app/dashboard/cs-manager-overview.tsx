import { prisma } from "@/lib/prisma";
import type { CsTeamRow } from "@/components/cs-team-table";
import { CsDashboard } from "@/components/cs-dashboard";
import { formatWeekRange } from "@/lib/period";
import { loadCsBook } from "@/lib/cs-book";
import { CustomerStatus, PerformanceStatus, StatusChangeRequestState, UserRole } from "@/generated/prisma/enums";

/**
 * CS_MANAGER's dashboard — a department-manager-style view across the whole
 * CS team: team-wide tiles and a per-specialist breakdown; tiles and rows
 * open drill-downs (see CsDashboard). Reassigning clients lives on its own Reassign
 * page. Same scope as connectionScopeWhere's CS_MANAGER branch (any client
 * with an active CS).
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

  return (
    <CsDashboard
      mode="manager"
      clientRows={clientRows}
      connectionRows={connectionRows}
      teamRows={teamRows}
      pendingCount={pending.length}
      weekLabel={formatWeekRange(weeklyStart)}
    />
  );
}
