import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { StatusChangeRequestState, UserRole } from "@/generated/prisma/enums";
import { connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import type { StatusRequestRow } from "@/components/status-requests-table";

/** Roles that can open the Status Requests / History pages at all. */
export const STATUS_REQUEST_VIEWER_ROLES = new Set<string>([
  UserRole.CS_SPECIALIST,
  UserRole.ADMIN,
  UserRole.EXECUTIVE,
]);

/**
 * A CS sees requests for connections under their own clients (resolved live
 * through connectionScopeWhere, so a CMS reassignment re-routes open
 * requests automatically); ADMIN/EXECUTIVE see all of them.
 */
export function statusRequestScopeWhere(session: ScopingSession): Prisma.StatusChangeRequestWhereInput {
  return { connection: connectionScopeWhere(session) };
}

export async function countPendingStatusRequests(session: ScopingSession): Promise<number> {
  return prisma.statusChangeRequest.count({
    where: { ...statusRequestScopeWhere(session), state: StatusChangeRequestState.PENDING },
  });
}

const nameOf = (u: { name: string | null; email: string } | null) => (u ? u.name ?? u.email : null);

export async function loadStatusRequestRows(
  session: ScopingSession,
  states: StatusChangeRequestState[],
): Promise<StatusRequestRow[]> {
  const requests = await prisma.statusChangeRequest.findMany({
    where: { ...statusRequestScopeWhere(session), state: { in: states } },
    orderBy: states.includes(StatusChangeRequestState.PENDING) ? { createdAt: "asc" } : { resolvedAt: "desc" },
    include: {
      requestedBy: { select: { name: true, email: true } },
      resolvedBy: { select: { name: true, email: true } },
      connection: {
        select: {
          id: true,
          clientName: true,
          shortCode: true,
          status: true,
          department: { select: { name: true } },
          vaUser: { select: { name: true, email: true } },
          customer: {
            select: {
              csAssignments: {
                where: { isActive: true },
                select: { csUser: { select: { name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });

  return requests.map((r) => ({
    id: r.id,
    connectionId: r.connection.id,
    clientName: r.connection.clientName,
    shortCode: r.connection.shortCode,
    vaName: nameOf(r.connection.vaUser) ?? "—",
    departmentName: r.connection.department.name,
    currentStatus: r.connection.status,
    fromStatus: r.fromStatus,
    requestedStatus: r.requestedStatus,
    effectiveDate: r.effectiveDate?.toISOString() ?? null,
    reason: r.reason,
    requestedByName: nameOf(r.requestedBy) ?? "—",
    createdAt: r.createdAt.toISOString(),
    state: r.state,
    resolvedByName: nameOf(r.resolvedBy),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNote: r.resolutionNote,
    csNames: r.connection.customer?.csAssignments.map((a) => nameOf(a.csUser)!).join(", ") || "—",
  }));
}
