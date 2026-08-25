import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getEffectiveSession } from "@/lib/view-as";

export type ScopingSession = {
  id: string;
  role: string;
  departmentId: string | null;
  teamId: string | null;
};

/**
 * Redirects unauthenticated visitors to sign-in; returns the effective
 * session otherwise — the real signed-in user, unless an ADMIN currently
 * has a "view as" override applied (see lib/view-as.ts), in which case
 * every caller of this transparently sees what the viewed-as user sees.
 */
export async function requireSession(): Promise<ScopingSession> {
  const session = await getEffectiveSession();
  if (!session) {
    redirect("/sign-in");
  }
  return {
    id: session.id,
    role: session.role,
    departmentId: session.departmentId,
    teamId: session.teamId,
  };
}

/**
 * Server-side authoritative connection visibility, by role:
 * VA -> own connections only; OM (Team Leader equivalent) -> connections of
 * users on teams they lead; DM (Manager equivalent) and OPS_MANAGER
 * (Operations Manager, same department-wide scope as DM) -> connections in
 * their department; ADMIN and SERVICE_MANAGER (CS Specialist equivalent) ->
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
    case UserRole.OPS_MANAGER:
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

/**
 * Department-only scoping for models that hang directly off a department
 * with no Connection relation to walk through (e.g. KpiDefinition) — same
 * role semantics as connectionScopeWhere's DM/OPS_MANAGER/OM branches:
 * ADMIN and SERVICE_MANAGER see every department, DM/OPS_MANAGER/OM are
 * locked to their own, everyone else has no legitimate reason to be here
 * and sees nothing.
 */
export function departmentScopeWhere(
  session: ScopingSession,
): { departmentId?: string; id?: string } {
  switch (session.role) {
    case UserRole.ADMIN:
    case UserRole.SERVICE_MANAGER:
      return {};
    case UserRole.DM:
    case UserRole.OPS_MANAGER:
    case UserRole.OM:
      return session.departmentId ? { departmentId: session.departmentId } : { id: "__none__" };
    default:
      return { id: "__none__" };
  }
}

/**
 * Single-record counterpart to departmentScopeWhere, for server actions
 * validating one write instead of filtering a list — same role semantics.
 */
export function canAccessDepartment(session: ScopingSession, departmentId: string): boolean {
  switch (session.role) {
    case UserRole.ADMIN:
    case UserRole.SERVICE_MANAGER:
      return true;
    case UserRole.DM:
    case UserRole.OPS_MANAGER:
    case UserRole.OM:
      return session.departmentId === departmentId;
    default:
      return false;
  }
}
