"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

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
    await logActivity(tx, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: "CREATE",
      entityType: "Team",
      entityId: team.id,
      entityLabel: team.name,
      summary: `Created team "${team.name}"`,
      departmentId,
    });
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
    if (previous) {
      const fields: [string, string | null, string | null][] = [
        ["name", previous.name, name],
        ["teamLeaderId", previous.teamLeaderId, teamLeaderId],
        ["tempLeader1Id", previous.tempLeader1Id, tempLeader1Id],
        ["tempLeader2Id", previous.tempLeader2Id, tempLeader2Id],
      ];
      const changes = fields
        .filter(([, oldV, newV]) => oldV !== newV)
        .map(([field, oldValue, newValue]) => ({ field, oldValue, newValue }));
      if (changes.length > 0) {
        await logActivity(tx, {
          actor: { id: session!.user!.id, role: session!.user!.role },
          action: "UPDATE",
          entityType: "Team",
          entityId: id,
          entityLabel: name,
          summary: `Edited team "${previous.name}" — ${changes.map((c) => c.field).join(", ")}`,
          changes,
          departmentId: previous.departmentId,
        });
      }
    }
  });
  revalidatePath("/dashboard/teams");
}

export async function deactivateTeam(formData: FormData) {
  const session = await requireAdminOrDm();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return;
  await prisma.team.update({ where: { id }, data: { isActive: false } });
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: id,
    entityLabel: team.name,
    summary: `Deactivated team "${team.name}"`,
    changes: [{ field: "isActive", oldValue: "true", newValue: "false" }],
    departmentId: team.departmentId,
  });
  revalidatePath("/dashboard/teams");
}

export async function addTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!teamId || !userId) return;

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error("Team not found.");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { additionalDepartments: true },
  });
  if (!user) throw new Error("User not found.");

  if (isDeptScopedManager(session?.user?.role) && team.departmentId !== session.user.departmentId) {
    throw new Error("DMs can only manage teams in their own department.");
  }

  // A VA can belong to more than one department (User.additionalDepartments)
  // — this team is only a legitimate assignment if its department is
  // either the VA's primary or one of their additional ones.
  const isPrimaryDept = user.departmentId === team.departmentId;
  const isAdditionalDept = user.additionalDepartments.some(
    (d) => d.departmentId === team.departmentId,
  );
  if (!isPrimaryDept && !isAdditionalDept) {
    throw new Error("This user doesn't belong to this team's department.");
  }

  // A VA holds at most one team per department (mirrors
  // assertTeamsAndServicesInDepartments in dashboard/users/actions.ts). If
  // this team's department is the VA's primary, it's their home teamId; if
  // it's one of their additional departments (a hybrid VA), it's a
  // User.additionalTeams row instead — replacing whichever team they might
  // already hold in that same additional department, and leaving their
  // home team (and any other additional-department team) untouched. This
  // used to unconditionally overwrite teamId, which both silently moved a
  // hybrid VA's home team out from under its owning DM and rejected the
  // legitimate "give them an additional team in this department" case.
  if (isPrimaryDept) {
    await prisma.user.update({ where: { id: userId }, data: { teamId } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.userTeam.deleteMany({
        where: { userId, team: { departmentId: team.departmentId } },
      });
      await tx.userTeam.create({ data: { userId, teamId } });
    });
  }

  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: teamId,
    entityLabel: team.name,
    summary: `Added ${user.name ?? user.email} to team "${team.name}"`,
    departmentId: team.departmentId,
  });
  revalidatePath("/dashboard/teams");
  // Also used by the Overview page's "Unassigned Virtual Assistants" panel.
  revalidatePath("/dashboard");
}

export async function removeTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  // Which team to remove the VA from — required now that a hybrid VA can
  // hold more than one (User.additionalTeams); without it there's no way to
  // tell "remove from this team" apart from "remove from their home team",
  // which used to mean this action only ever touched teamId, wrongly
  // rejecting (or, worse, silently misfiring on) an additional-team member.
  const teamId = String(formData.get("teamId") ?? "");
  if (!userId || !teamId) return;

  const [user, team] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!user || !team) return;

  if (isDeptScopedManager(session?.user?.role) && team.departmentId !== session.user.departmentId) {
    throw new Error("DMs can only manage teams in their own department.");
  }

  if (user.teamId === teamId) {
    await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
  } else {
    await prisma.userTeam.deleteMany({ where: { userId, teamId } });
  }
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: team.id,
    entityLabel: team.name,
    summary: `Removed ${user.name ?? user.email} from team "${team.name}"`,
    departmentId: team.departmentId,
  });
  revalidatePath("/dashboard/teams");
}

// Atomic move to another team, guarded to stay within the same department —
// mirrors legacy transferTeamMember()'s department-match validation, which
// plain remove-then-add doesn't enforce. Takes the specific `fromTeamId`
// (not just the VA's home team) since a hybrid VA can hold more than one
// team (User.additionalTeams) — this transfers whichever one the manager
// clicked "Transfer" on, home or additional, leaving any other team of
// theirs untouched.
export async function transferTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  const fromTeamId = String(formData.get("fromTeamId") ?? "");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  if (!userId || !fromTeamId || !toTeamId) return;

  const [user, fromTeam, toTeam] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.team.findUnique({ where: { id: fromTeamId } }),
    prisma.team.findUnique({ where: { id: toTeamId } }),
  ]);
  if (!user || !fromTeam || !toTeam) throw new Error("User or team not found.");
  if (fromTeam.departmentId !== toTeam.departmentId) {
    throw new Error("Can't transfer a member across departments.");
  }
  if (isDeptScopedManager(session?.user?.role) && fromTeam.departmentId !== session.user.departmentId) {
    throw new Error("DMs can only manage teams in their own department.");
  }

  const isHome = user.teamId === fromTeamId;
  if (isHome) {
    await prisma.user.update({ where: { id: userId }, data: { teamId: toTeamId } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.userTeam.deleteMany({ where: { userId, teamId: fromTeamId } });
      await tx.userTeam.create({ data: { userId, teamId: toTeamId } });
    });
  }
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: toTeamId,
    entityLabel: toTeam.name,
    summary: `Transferred ${user.name ?? user.email} from "${fromTeam.name}" to "${toTeam.name}"`,
    changes: [{ field: isHome ? "teamId" : "additionalTeams", oldValue: fromTeamId, newValue: toTeamId }],
    departmentId: toTeam.departmentId,
  });
  revalidatePath("/dashboard/teams");
}
