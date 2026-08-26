"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity, diffFields } from "@/lib/activity-log";
import { UserRole } from "@/generated/prisma/enums";

type ManagingSession = { id: string; role: UserRole; departmentId: string | null };

// Mirrors legacy's Manager capability (Users.js: getUsers/createUser/
// updateUser all accept ROLES.ADMIN or ROLES.MANAGER) — a DM (or the
// DM-equivalent Ops Manager) can manage users, but only within their own
// department, and only as OM/VA (legacy's Manager create form
// (AppUsers.html: openCreateUser) only offers 'Team Leader'/'Virtual
// Assistant').
const DM_MANAGEABLE_ROLES: UserRole[] = [UserRole.OM, UserRole.VA];
const DEPT_SCOPED_MANAGER_ROLES: UserRole[] = [UserRole.DM, UserRole.OPS_MANAGER];

async function requireManager(): Promise<ManagingSession> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER") {
    throw new Error("Only admins, DMs, and Ops Managers can manage users.");
  }
  return {
    id: session!.user.id,
    role: role as UserRole,
    departmentId: session!.user.departmentId,
  };
}

function optionalId(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "");
  return value === "" ? null : value;
}

// Guards against assigning a user to a team/service that belongs to a
// different department than the one they're being placed in. Without this,
// a DM could smuggle in a team/service from another department even though
// departmentId itself is locked down — and connection-scope.ts's OM branch
// keys visibility off team leadership, so this is a real cross-department
// escalation route, not just a data-integrity nicety.
async function assertTeamAndServiceInDepartment(
  teamId: string | null,
  serviceId: string | null,
  departmentId: string | null,
): Promise<void> {
  const [team, service] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    serviceId ? prisma.service.findUnique({ where: { id: serviceId } }) : null,
  ]);

  if (teamId && (!team || team.departmentId !== departmentId)) {
    throw new Error("Selected team does not belong to the chosen department.");
  }
  if (serviceId && (!service || service.departmentId !== departmentId)) {
    throw new Error("Selected service does not belong to the chosen department.");
  }
}

export async function createUser(formData: FormData) {
  const session = await requireManager();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as UserRole;
  let departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (!email || !Object.values(UserRole).includes(role)) {
    throw new Error("Email and role are required.");
  }

  // Admin only — a VA can be tagged with more than one department (e.g. one
  // VA doing both Amazon and Executive Assistant work); every department is
  // treated equally, with departmentId as just the first of the set.
  // DMs/Ops Managers stay strictly single-department (see below), so this
  // never applies to their create flow.
  let extraDepartmentIds: string[] = [];
  if (session.role === "ADMIN" && role === UserRole.VA) {
    const submitted = formData.getAll("departmentIds").map(String).filter(Boolean);
    if (submitted.length > 0) {
      departmentId = submitted[0];
      extraDepartmentIds = submitted.slice(1);
    }
  }

  if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role)) {
    if (!DM_MANAGEABLE_ROLES.includes(role)) {
      throw new Error("DMs may only create OM or VA users.");
    }
    // A DM can only create users in their own department, regardless of
    // what the form submitted.
    departmentId = session.departmentId;
  }

  await assertTeamAndServiceInDepartment(teamId, serviceId, departmentId);

  // Pre-provisions the row so it's ready with the right role/department the
  // moment this person signs in with Google — the NextAuth jwt callback
  // upserts on email but never overwrites an existing row (update: {}).
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      departmentId,
      serviceId,
      teamId,
      ...(extraDepartmentIds.length > 0
        ? { additionalDepartments: { create: extraDepartmentIds.map((id) => ({ departmentId: id })) } }
        : {}),
    },
  });
  await logActivity(prisma, {
    actor: session,
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.name ?? user.email,
    summary: `Created user ${user.email} as ${role}`,
    departmentId,
  });
  revalidatePath("/dashboard/users");
}

export async function updateUser(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing user id.");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as UserRole;
  let departmentId = optionalId(formData, "departmentId");
  let serviceId = optionalId(formData, "serviceId");
  let teamId = optionalId(formData, "teamId");

  if (!email) {
    throw new Error("Email is required.");
  }
  if (!Object.values(UserRole).includes(role)) {
    throw new Error("Invalid role.");
  }

  const emailOwner = await prisma.user.findUnique({ where: { email } });
  if (emailOwner && emailOwner.id !== id) {
    throw new Error("That email is already in use by another user.");
  }

  const target = await prisma.user.findUnique({
    where: { id },
    include: { additionalDepartments: true },
  });
  if (!target) throw new Error("User not found.");
  const targetDepartmentIds = new Set(
    [target.departmentId, ...target.additionalDepartments.map((d) => d.departmentId)].filter(
      (v): v is string => Boolean(v),
    ),
  );

  // Admin only — see createUser for why. Replaces the VA's full department
  // set (primary + additional) with whatever was submitted; a non-VA role
  // change below drops any additional departments, since only VAs carry them.
  let extraDepartmentIds: string[] | null = null;
  if (session.role === "ADMIN" && role === UserRole.VA) {
    const submitted = formData.getAll("departmentIds").map(String).filter(Boolean);
    if (submitted.length > 0) {
      departmentId = submitted[0];
      extraDepartmentIds = submitted.slice(1);
    }
  }

  if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role)) {
    // A DM can manage a VA who's in their department at all — primary OR
    // (in the multi-department case) just an additional membership, e.g. a
    // VA whose primary is Amazon but who also does Executive Assistant work.
    if (!targetDepartmentIds.has(session.departmentId ?? "")) {
      throw new Error("You can only edit users in your own department.");
    }
    // A DM can only touch OM/VA accounts — without this, a DM could edit an
    // ADMIN or SERVICE_MANAGER account that happens to share their
    // department, since departmentId isn't restricted by role in the schema.
    if (!DM_MANAGEABLE_ROLES.includes(target.role)) {
      throw new Error("You can only edit OM or VA users.");
    }
    if (!DM_MANAGEABLE_ROLES.includes(role)) {
      throw new Error("DMs may only assign OM or VA roles.");
    }
    if (target.departmentId && target.departmentId !== session.departmentId) {
      // This VA's primary department belongs to a different DM (this DM
      // only co-manages them via an additional-department membership) — the
      // DM's own department/service/team dropdowns only ever list their own
      // department's options, so applying them here would wrongly move the
      // VA's primary department out from under the other DM. Leave
      // department/service/team exactly as they were; only email/name/role
      // are editable from this DM's side for a shared VA.
      departmentId = target.departmentId;
      serviceId = target.serviceId;
      teamId = target.teamId;
    } else {
      // Common case: this VA's primary department is this DM's own —
      // locked to it, same as on create, regardless of what the form sent.
      departmentId = session.departmentId;
    }
  }

  await assertTeamAndServiceInDepartment(teamId, serviceId, departmentId);

  const before = target;
  const after = { email, name, role, departmentId, serviceId, teamId };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: after });
    if (extraDepartmentIds !== null) {
      await tx.userDepartment.deleteMany({ where: { userId: id } });
      if (extraDepartmentIds.length > 0) {
        await tx.userDepartment.createMany({
          data: extraDepartmentIds.map((depId) => ({ userId: id, departmentId: depId })),
          skipDuplicates: true,
        });
      }
    } else if (role !== UserRole.VA && before.additionalDepartments.length > 0) {
      // Demoted out of VA (e.g. promoted to OM) — additional departments
      // are a VA-only concept, so drop them rather than leave orphaned rows
      // a non-VA role never reads.
      await tx.userDepartment.deleteMany({ where: { userId: id } });
    }
  });
  const changes = diffFields(before, after, ["email", "name", "role", "departmentId", "serviceId", "teamId"]);
  if (changes.length > 0) {
    const roleChanged = changes.some((c) => c.field === "role");
    await logActivity(prisma, {
      actor: session,
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      entityLabel: name ?? email,
      summary: roleChanged
        ? `Changed role of ${email} from ${before.role} to ${role}`
        : `Edited user ${email} — ${changes.map((c) => c.field).join(", ")}`,
      changes,
      departmentId: departmentId ?? before.departmentId,
    });
  }
  revalidatePath("/dashboard/users");
}

// Bulk import, one user per line: "email,name,role" (name and role
// optional — role defaults to VA). Mirrors legacy bulkCreateUsers().
export async function bulkCreateUsers(formData: FormData) {
  const session = await requireManager();
  const raw = String(formData.get("rows") ?? "");
  let departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role)) {
    departmentId = session.departmentId;
  }

  await assertTeamAndServiceInDepartment(teamId, serviceId, departmentId);

  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const users = rows.map((line) => {
    const [emailRaw, nameRaw, roleRaw] = line.split(",").map((p) => p?.trim());
    const email = emailRaw?.toLowerCase();
    const role = (roleRaw?.toUpperCase() as UserRole) || UserRole.VA;
    if (!email || !Object.values(UserRole).includes(role)) {
      throw new Error(`Invalid row: "${line}" (expected email,name,role)`);
    }
    if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role) && !DM_MANAGEABLE_ROLES.includes(role)) {
      throw new Error(`Invalid row: "${line}" — DMs may only import OM or VA users.`);
    }
    return {
      email,
      name: nameRaw || null,
      role,
      departmentId,
      serviceId,
      teamId,
    };
  });

  if (users.length === 0) {
    throw new Error("No rows to import.");
  }

  const result = await prisma.user.createMany({ data: users, skipDuplicates: true });
  if (result.count > 0) {
    await logActivity(prisma, {
      actor: session,
      action: "CREATE",
      entityType: "User",
      entityId: "bulk",
      summary: `Bulk-imported ${result.count} user${result.count === 1 ? "" : "s"}`,
      departmentId,
    });
  }
  revalidatePath("/dashboard/users");
}

export async function toggleUserActive(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (id === session.id) {
    throw new Error("You can't deactivate your own account.");
  }
  const user = await prisma.user.findUnique({
    where: { id },
    include: { additionalDepartments: true },
  });
  if (!user) return;
  if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role)) {
    const userDepartmentIds = new Set(
      [user.departmentId, ...user.additionalDepartments.map((d) => d.departmentId)].filter(
        (v): v is string => Boolean(v),
      ),
    );
    if (!userDepartmentIds.has(session.departmentId ?? "")) {
      throw new Error("You can only manage users in your own department.");
    }
    // Without this, a DM could deactivate an ADMIN or SERVICE_MANAGER
    // account that happens to share their department, since departmentId
    // isn't restricted by role in the schema.
    if (!DM_MANAGEABLE_ROLES.includes(user.role)) {
      throw new Error("You can only manage OM or VA users.");
    }
  }
  const activating = !user.isActive;
  await prisma.user.update({
    where: { id },
    data: {
      isActive: activating,
      // Mirrors legacy autoCleanInactiveTeamMembers() — a deactivated user
      // shouldn't keep occupying a team roster slot.
      ...(activating ? {} : { teamId: null }),
    },
  });
  await logActivity(prisma, {
    actor: session,
    action: "UPDATE",
    entityType: "User",
    entityId: id,
    entityLabel: user.name ?? user.email,
    summary: `${activating ? "Activated" : "Deactivated"} user ${user.email}`,
    changes: [{ field: "isActive", oldValue: String(user.isActive), newValue: String(activating) }],
    departmentId: user.departmentId,
  });
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/teams");
}
