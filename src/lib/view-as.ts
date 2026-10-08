import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { pickTeamForDepartment } from "@/lib/user-teams";

export const VIEW_AS_COOKIE = "kpi_view_as_user_id";

export type EffectiveSession = {
  id: string;
  role: string;
  departmentId: string | null;
  teamId: string | null;
  name: string | null;
  email: string;
  /** True when an ADMIN or Team Leader has an active "view as" override applied. */
  isViewingAs: boolean;
  /** The real, authenticated user's own id — always present when viewing as someone else. */
  actualId: string;
  actualRole: string;
  /**
   * Set only when a Team Leader is viewing as one of their VAs: the team
   * leader's own department, which connectionScopeWhere then locks that
   * VA's connections to — so a hybrid VA's work in their other departments
   * never shows up in the preview. Null for everyone else, including an
   * admin's preview (admins can already see everything).
   */
  scopeDepartmentId: string | null;
};

/**
 * Teams a Team Leader (OM) leads — as the leader or either temp-leader
 * slot — restricted to the team leader's own department, mirroring
 * connectionScopeWhere's OM branch.
 */
function ledTeamWhere(leaderId: string, departmentId: string | null): Prisma.TeamWhereInput {
  return {
    departmentId: departmentId ?? "__none__",
    OR: [{ teamLeaderId: leaderId }, { tempLeader1Id: leaderId }, { tempLeader2Id: leaderId }],
  };
}

/**
 * The VAs a Team Leader may "view as": active VAs whose home team or (for a
 * hybrid VA) additional team is one this team leader leads in their own
 * department. Matched by the VA's own team memberships, never
 * Connection.teamId, which goes stale on transfer.
 */
export function teamLeaderViewableVasWhere(
  leaderId: string,
  departmentId: string | null,
): Prisma.UserWhereInput {
  const ledTeam = ledTeamWhere(leaderId, departmentId);
  return {
    role: UserRole.VA,
    isActive: true,
    id: { not: leaderId },
    OR: [{ team: ledTeam }, { additionalTeams: { some: { team: ledTeam } } }],
  };
}

/**
 * The session every page should render against: the real signed-in user,
 * unless that user is an ADMIN with a "view as" cookie set, in which case
 * this returns the target user's own id/role/departmentId/teamId — so
 * every scope check and role branch downstream sees exactly what that
 * person would see. A Team Leader with the cookie set gets the same, but
 * only for a VA on a team they lead (re-checked every request, so a
 * transfer ends the preview), and pinned to the team leader's department
 * via scopeDepartmentId. Mutating server actions must keep using `auth()`
 * directly instead of this, so real permissions are never affected by
 * what an admin happens to be previewing.
 */
export async function getEffectiveSession(): Promise<EffectiveSession | null> {
  const session = await auth();
  if (!session?.user) return null;

  const actual = {
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
  };

  const self: EffectiveSession = {
    ...actual,
    isViewingAs: false,
    actualId: actual.id,
    actualRole: actual.role,
    scopeDepartmentId: null,
  };

  if (actual.role !== UserRole.ADMIN && actual.role !== UserRole.OM) {
    return self;
  }

  const store = await cookies();
  const targetId = store.get(VIEW_AS_COOKIE)?.value;
  if (!targetId || targetId === actual.id) {
    return self;
  }

  if (actual.role === UserRole.OM) {
    const target = await prisma.user.findFirst({
      where: { AND: [{ id: targetId }, teamLeaderViewableVasWhere(actual.id, actual.departmentId)] },
      select: {
        id: true,
        name: true,
        email: true,
        team: { select: { id: true, departmentId: true } },
        additionalTeams: { select: { team: { select: { id: true, departmentId: true } } } },
      },
    });
    if (!target || !actual.departmentId) {
      return self;
    }
    // The VA's team *in this team leader's department* — for a hybrid VA
    // that may be an additional team rather than their home one. Department
    // likewise is the team leader's, not the VA's primary department.
    const team = pickTeamForDepartment(target, actual.departmentId);
    return {
      id: target.id,
      role: UserRole.VA,
      departmentId: actual.departmentId,
      teamId: team?.id ?? null,
      name: target.name,
      email: target.email,
      isViewingAs: true,
      actualId: actual.id,
      actualRole: actual.role,
      scopeDepartmentId: actual.departmentId,
    };
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) {
    return self;
  }

  return {
    id: target.id,
    role: target.role,
    departmentId: target.departmentId,
    teamId: target.teamId,
    name: target.name,
    email: target.email,
    isViewingAs: true,
    actualId: actual.id,
    actualRole: actual.role,
    scopeDepartmentId: null,
  };
}

/**
 * For server actions that write *as* the effective user (rather than via
 * auth()) — refuses while a "view as" preview is active, so nobody can
 * create records attributed to the person they're previewing.
 */
export async function assertNotViewingAs(action: string): Promise<void> {
  const session = await getEffectiveSession();
  if (session?.isViewingAs) {
    throw new Error(`Exit View As before you ${action}.`);
  }
}
