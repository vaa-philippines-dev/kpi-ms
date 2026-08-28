import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { ScopingSession } from "@/lib/connection-scope";

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
