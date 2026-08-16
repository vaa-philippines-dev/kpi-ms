import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type ScopingSession = {
  id: string;
  role: string;
  departmentId: string | null;
  teamId: string | null;
};

/** Redirects unauthenticated visitors to sign-in; returns the session's user otherwise. */
export async function requireSession(): Promise<ScopingSession> {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  };
}

/**
 * Server-side authoritative connection visibility, by role:
 * VA -> own connections only; OM (Team Leader equivalent) -> connections of
 * users on teams they lead; DM (Manager equivalent) -> connections in their
 * department; ADMIN and SERVICE_MANAGER (CS Specialist equivalent) ->
 * everything. Unlike the legacy Apps Script app (which trusted a
 * client-asserted userId/role), this reads off the server-verified session,
 * so it can't be spoofed from the browser.
 *
 * The ADMIN/SERVICE_MANAGER parity mirrors legacy's getVAConnections()
 * (VAConnections.js): 'Virtual Assistant' and 'Team Leader' are filtered,
 * 'Manager' is filtered by DeptID in that same function, and every other
 * role (Administrator, CS Specialist) falls through unfiltered. DM keeps
 * its own case here for exactly that reason — it is NOT unscoped in
 * legacy, so it must not share ADMIN/SERVICE_MANAGER's fallthrough.
 */
export function connectionScopeWhere(
  session: ScopingSession,
): Prisma.ConnectionWhereInput {
  switch (session.role) {
    case UserRole.ADMIN:
    case UserRole.SERVICE_MANAGER:
      return {};
    case UserRole.DM:
      return session.departmentId ? { departmentId: session.departmentId } : { id: "__none__" };
    case UserRole.OM:
      return {
        OR: [
          { vaUserId: session.id },
          {
            vaUser: {
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
    case UserRole.VA:
    default:
      return { vaUserId: session.id };
  }
}
