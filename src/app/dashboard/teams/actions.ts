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
  if (isDeptScopedManager(session?.user?.role)) {
    if (!team || team.departmentId !== session.user.departmentId) {
      throw new Error("DMs can only manage teams in their own department.");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { additionalDepartments: true, team: true },
    });
    // A VA can belong to more than one department — eligible for this
    // team if the DM's department is either their primary or additional.
    const userInDept =
      user &&
      (user.departmentId === session.user.departmentId ||
        user.additionalDepartments.some((d) => d.departmentId === session.user.departmentId));
    if (!userInDept) {
      throw new Error("DMs can only add members from their own department.");
    }
    // A hybrid VA (tagged into this department only via
    // additionalDepartments) may already sit on a team in their actual
    // primary department — teamId is a single field, so silently adding
    // them here would rip them off that other team out from under its
    // owning DM. Only that DM (or an Admin) can move them.
    if (user.team && user.team.departmentId !== session.user.departmentId) {
      throw new Error(
        "This user is already on a team in another department — only that department's manager can move them.",
      );
    }
  }

  const member = await prisma.user.update({ where: { id: userId }, data: { teamId } });
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: teamId,
    entityLabel: team?.name ?? teamId,
    summary: `Added ${member.name ?? member.email} to team "${team?.name ?? teamId}"`,
    departmentId: team?.departmentId ?? null,
  });
  revalidatePath("/dashboard/teams");
  // Also used by the Overview page's "Unassigned Virtual Assistants" panel.
  revalidatePath("/dashboard");
}

export async function removeTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { team: true, additionalDepartments: true },
  });
  if (isDeptScopedManager(session?.user?.role)) {
    const userInDept =
      user &&
      (user.departmentId === session.user.departmentId ||
        user.additionalDepartments.some((d) => d.departmentId === session.user.departmentId));
    if (
      !userInDept ||
      (user.team && user.team.departmentId !== session.user.departmentId)
    ) {
      throw new Error("DMs can only manage teams in their own department.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
  if (user?.team) {
    await logActivity(prisma, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: "UPDATE",
      entityType: "Team",
      entityId: user.team.id,
      entityLabel: user.team.name,
      summary: `Removed ${user.name ?? user.email} from team "${user.team.name}"`,
      departmentId: user.team.departmentId,
    });
  }
  revalidatePath("/dashboard/teams");
}

// Atomic move to another team, guarded to stay within the same department —
// mirrors legacy transferTeamMember()'s department-match validation, which
// plain remove-then-add doesn't enforce.
export async function transferTeamMember(formData: FormData) {
  const session = await requireAdminOrDm();
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
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Team",
    entityId: toTeamId,
    entityLabel: toTeam.name,
    summary: `Transferred ${user.name ?? user.email} from "${user.team?.name ?? "no team"}" to "${toTeam.name}"`,
    changes: [{ field: "teamId", oldValue: user.team?.id ?? null, newValue: toTeamId }],
    departmentId: toTeam.departmentId,
  });
  revalidatePath("/dashboard/teams");
}
