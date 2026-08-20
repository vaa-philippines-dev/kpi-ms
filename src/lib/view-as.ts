import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";

export const VIEW_AS_COOKIE = "kpi_view_as_user_id";

export type EffectiveSession = {
  id: string;
  role: string;
  departmentId: string | null;
  teamId: string | null;
  name: string | null;
  email: string;
  /** True when an ADMIN has an active "view as" override applied. */
  isViewingAs: boolean;
  /** The real, authenticated admin's own id — always present when viewing as someone else. */
  actualId: string;
  actualRole: string;
};

/**
 * The session every page should render against: the real signed-in user,
 * unless that user is an ADMIN with a "view as" cookie set, in which case
 * this returns the target user's own id/role/departmentId/teamId — so
 * every scope check and role branch downstream sees exactly what that
 * person would see. Mutating server actions must keep using `auth()`
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

  if (actual.role !== UserRole.ADMIN) {
    return { ...actual, isViewingAs: false, actualId: actual.id, actualRole: actual.role };
  }

  const store = await cookies();
  const targetId = store.get(VIEW_AS_COOKIE)?.value;
  if (!targetId || targetId === actual.id) {
    return { ...actual, isViewingAs: false, actualId: actual.id, actualRole: actual.role };
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) {
    return { ...actual, isViewingAs: false, actualId: actual.id, actualRole: actual.role };
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
  };
}
