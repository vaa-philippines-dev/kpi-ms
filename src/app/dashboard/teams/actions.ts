"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdminOrDm() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "DM") {
    throw new Error("Only admins or DMs can manage teams.");
  }
  return session;
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
    session?.user?.role === "DM" &&
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
      session?.user?.role === "DM" &&
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
  await requireAdminOrDm();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!teamId || !userId) return;
  await prisma.user.update({ where: { id: userId }, data: { teamId } });
  revalidatePath("/dashboard/teams");
}

export async function removeTeamMember(formData: FormData) {
  await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
  revalidatePath("/dashboard/teams");
}
