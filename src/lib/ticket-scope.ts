import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { ScopingSession } from "@/lib/connection-scope";
import { prisma } from "@/lib/prisma";

/**
 * Server-side ticket visibility, same role shape as connectionScopeWhere
 * (src/lib/connection-scope.ts) but keyed off Ticket.createdBy's
 * department/team instead of a Connection: ADMIN sees everything (the
 * Inbox); DM/OPS_MANAGER see their own tickets plus every ticket raised by
 * someone in their department; OM sees their own plus tickets raised by
 * anyone on a team they lead; VA/SERVICE_MANAGER see only their own.
 */
export function ticketScopeWhere(session: ScopingSession): Prisma.TicketWhereInput {
  switch (session.role) {
    case UserRole.ADMIN:
      return {};
    case UserRole.DM:
    case UserRole.OPS_MANAGER:
      return session.departmentId
        ? { OR: [{ createdById: session.id }, { createdBy: { departmentId: session.departmentId } }] }
        : { createdById: session.id };
    case UserRole.OM:
      return {
        OR: [
          { createdById: session.id },
          {
            createdBy: {
              team: {
                OR: [
                  { teamLeaderId: session.id },
                  { tempLeader1Id: session.id },
                  { tempLeader2Id: session.id },
                ],
              },
            },
          },
        ],
      };
    default:
      return { createdById: session.id };
  }
}

/**
 * User ids who should be notified about activity on a ticket raised by
 * `creatorId` (department `creatorDepartmentId`, team `creatorTeamId`):
 * every active ADMIN (the Inbox is their job — unlike getSubmissionWatcherIds,
 * which deliberately excludes ADMIN), the DM/OPS_MANAGER of that department,
 * the OM (Team Leader) of that creator's team, and the creator themselves
 * (so they hear back about replies/status changes on their own ticket).
 */
export async function getTicketWatcherIds(
  creatorId: string,
  creatorDepartmentId: string | null,
  creatorTeamId: string | null,
): Promise<string[]> {
  const watchers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: UserRole.ADMIN },
        ...(creatorDepartmentId
          ? [{ role: { in: [UserRole.DM, UserRole.OPS_MANAGER] }, departmentId: creatorDepartmentId }]
          : []),
        ...(creatorTeamId
          ? [
              {
                role: UserRole.OM,
                OR: [
                  { ledTeams: { some: { id: creatorTeamId } } },
                  { tempLedTeams1: { some: { id: creatorTeamId } } },
                  { tempLedTeams2: { some: { id: creatorTeamId } } },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  const ids = new Set(watchers.map((w) => w.id));
  ids.add(creatorId);
  return Array.from(ids);
}
