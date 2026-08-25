"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdminOrDm() {
  const session = await auth();
  if (
    session?.user?.role !== "ADMIN" &&
    session?.user?.role !== "DM" &&
    session?.user?.role !== "OPS_MANAGER"
  ) {
    throw new Error("Only admins, DMs, or Ops Managers can manage teams.");
  }
  return session;
}

function isDeptScopedManager(role: string | undefined): boolean {
  return role === "DM" || role === "OPS_MANAGER";
}

function optionalId(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "");
  return value === "" ? null : value;
}

export async function createTeam(formData: FormData) {
  const session = await requireAdminOrDm();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  const teamLeaderId = optionalId(formData, "teamLeaderId");

  if (!name || !departmentId) {
    throw new Error("Name and department are required.");
  }
  if (
    isDeptScopedManager(session?.user?.role) &&
    session.user.departmentId !== departmentId
  ) {
    throw new Error("DMs can only create teams in their own department.");
  }

  await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { name, departmentId, teamLeaderId },
    });
    if (teamLeaderId) {
      await tx.user.update({
        where: { id: teamLeaderId },
        data: { teamId: team.id },
      });
    }
  });
  revalidatePath("/dashboard/teams");
}

export async function updateTeam(formData: FormData) {
  const session = await requireAdminOrDm();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing team id.");
  const name = String(formData.get("name") ?? "").trim();
  const teamLeaderId = optionalId(formData, "teamLeaderId");
  const tempLeader1Id = optionalId(formData, "tempLeader1Id");
  const tempLeader2Id = optionalId(formData, "tempLeader2Id");
  if (!name) throw new Error("Name is required.");

  await prisma.$transaction(async (tx) => {
    const previous = await tx.team.findUnique({ where: { id } });
    if (
      isDeptScopedManager(session?.user?.role) &&
      previous &&
      session.user.departmentId !== previous.departmentId
    ) {
      throw new Error("DMs can only edit teams in their own department.");
    }
    await tx.team.update({
      where: { id },
      data: { name, teamLeaderId, tempLeader1Id, tempLeader2Id },
    });
    // Keep the leader's own User.teamId in sync — the authoritative
    // membership pointer per the legacy analysis (Connections.TeamID goes
    // stale on transfer; only User.teamId is trusted).
    if (
      teamLeaderId &&
      teamLeaderId !== previous?.teamLeaderId
    ) {
      await tx.user.update({
        where: { id: teamLeaderId },
        data: { teamId: id },
      });
    }
  });
  revalidatePath("/dashboard/teams");
}

export async function deactivateTeam(formData: FormData) {
  await requireAdminOrDm();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.team.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/dashboard/teams");
}

export async function addTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!teamId || !userId) return;

  if (isDeptScopedManager(session?.user?.role)) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.departmentId !== session.user.departmentId) {
      throw new Error("DMs can only manage teams in their own department.");
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.departmentId !== session.user.departmentId) {
      throw new Error("DMs can only add members from their own department.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { teamId } });
  revalidatePath("/dashboard/teams");
  // Also used by the Overview page's "Unassigned Virtual Assistants" panel.
  revalidatePath("/dashboard");
}

export async function removeTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  if (isDeptScopedManager(session?.user?.role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { team: true },
    });
    if (
      !user ||
      user.departmentId !== session.user.departmentId ||
      (user.team && user.team.departmentId !== session.user.departmentId)
    ) {
      throw new Error("DMs can only manage teams in their own department.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
  revalidatePath("/dashboard/teams");
}

// Atomic move to another team, guarded to stay within the same department —
// mirrors legacy transferTeamMember()'s department-match validation, which
// plain remove-then-add doesn't enforce.
export async function transferTeamMember(formData: FormData) {
  await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  if (!userId || !toTeamId) return;

  const [user, toTeam] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { team: true } }),
    prisma.team.findUnique({ where: { id: toTeamId } }),
  ]);
  if (!user || !toTeam) throw new Error("User or destination team not found.");
  if (user.team && user.team.departmentId !== toTeam.departmentId) {
    throw new Error("Can't transfer a member across departments.");
  }

  await prisma.user.update({ where: { id: userId }, data: { teamId: toTeamId } });
  revalidatePath("/dashboard/teams");
}
