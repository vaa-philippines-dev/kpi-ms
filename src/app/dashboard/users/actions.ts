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
//
// Team is checked against the single primary `departmentId` only — Team
// stays fixed/single regardless of how many departments or services a
// hybrid VA holds. Services are checked against the VA's full department
// set (`allDepartmentIds` — primary + additional), since a hybrid VA's
// extra services belong to their extra departments, not the primary one.
// Each Service belongs to exactly one Department, so at most one service
// per department is allowed here — a second service in an already-covered
// department isn't a new capability, just an ambiguous duplicate.
async function assertTeamAndServicesInDepartments(
  teamId: string | null,
  serviceIds: string[],
  departmentId: string | null,
  allDepartmentIds: string[],
): Promise<void> {
  const [team, services] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    serviceIds.length > 0 ? prisma.service.findMany({ where: { id: { in: serviceIds } } }) : [],
  ]);

  if (teamId && (!team || team.departmentId !== departmentId)) {
    throw new Error("Selected team does not belong to the chosen department.");
  }
  if (services.length !== serviceIds.length) {
    throw new Error("Selected service does not belong to the chosen department.");
  }
  const seenDepartmentIds = new Set<string>();
  for (const service of services) {
    if (!allDepartmentIds.includes(service.departmentId)) {
      throw new Error("Selected service does not belong to the chosen department.");
    }
    if (seenDepartmentIds.has(service.departmentId)) {
      throw new Error("Only one service can be selected per department.");
    }
    seenDepartmentIds.add(service.departmentId);
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
  let serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (!email || !Object.values(UserRole).includes(role)) {
    throw new Error("Email and role are required.");
  }

  // Admin only — a VA can be tagged with more than one department (e.g. one
  // VA doing both Amazon and Executive Assistant work); every department is
  // treated equally, with departmentId as just the first of the set. Same
  // idea one level down for services: extraServiceIds holds whichever
  // services beyond the first-picked one were checked (at most one per
  // department, enforced below). DMs/Ops Managers stay strictly
  // single-department (see below), so this never applies to their create flow.
  let extraDepartmentIds: string[] = [];
  let extraServiceIds: string[] = [];
  if (session.role === "ADMIN" && role === UserRole.VA) {
    const submittedDepartments = formData.getAll("departmentIds").map(String).filter(Boolean);
    if (submittedDepartments.length > 0) {
      departmentId = submittedDepartments[0];
      extraDepartmentIds = submittedDepartments.slice(1);
    }
    const submittedServices = formData.getAll("serviceIds").map(String).filter(Boolean);
    if (submittedServices.length > 0) {
      serviceId = submittedServices[0];
      extraServiceIds = submittedServices.slice(1);
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

  const allDepartmentIds = [departmentId, ...extraDepartmentIds].filter(
    (v): v is string => Boolean(v),
  );
  const allServiceIds = [serviceId, ...extraServiceIds].filter((v): v is string => Boolean(v));
  await assertTeamAndServicesInDepartments(teamId, allServiceIds, departmentId, allDepartmentIds);

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
      ...(extraServiceIds.length > 0
        ? { additionalServices: { create: extraServiceIds.map((id) => ({ serviceId: id })) } }
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
  const teamId = optionalId(formData, "teamId");

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
    include: { additionalDepartments: true, additionalServices: true },
  });
  if (!target) throw new Error("User not found.");
  const targetDepartmentIds = new Set(
    [target.departmentId, ...target.additionalDepartments.map((d) => d.departmentId)].filter(
      (v): v is string => Boolean(v),
    ),
  );

  // Admin only — see createUser for why. Replaces the VA's full department
  // (and, one level down, service) set with whatever was submitted; a
  // non-VA role change below drops any additional departments/services,
  // since only VAs carry them.
  let extraDepartmentIds: string[] | null = null;
  let extraServiceIds: string[] | null = null;
  if (session.role === "ADMIN" && role === UserRole.VA) {
    const submittedDepartments = formData.getAll("departmentIds").map(String).filter(Boolean);
    if (submittedDepartments.length > 0) {
      // Checkboxes render in alphabetical department-name order, not
      // "primary first" — so `submitted[0]` is NOT reliably the existing
      // primary. Keep the existing primary if it's still checked, instead
      // of letting a routine re-save (that never touched the checkboxes)
      // silently reassign it to whichever department sorts first.
      departmentId = submittedDepartments.includes(target.departmentId ?? "")
        ? target.departmentId
        : submittedDepartments[0];
      extraDepartmentIds = submittedDepartments.filter((depId) => depId !== departmentId);
    }
    const submittedServices = formData.getAll("serviceIds").map(String).filter(Boolean);
    if (submittedServices.length > 0) {
      serviceId = submittedServices.includes(target.serviceId ?? "")
        ? target.serviceId
        : submittedServices[0];
      extraServiceIds = submittedServices.filter((svcId) => svcId !== serviceId);
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
      // This VA's primary department belongs to a different DM — this DM
      // only co-manages them via an additional-department membership (e.g.
      // a hybrid Amazon/Walmart VA, seen from the Walmart side when their
      // primary is Amazon). That's enough to see and pick them in dropdowns,
      // but not enough to touch their account: identity (email/role) and
      // their primary department/service/team stay under the owning DM's
      // control. Without this, a co-managing DM could silently reassign a
      // VA that isn't really theirs — a cross-department escalation, not
      // just a data-integrity nicety.
      throw new Error(
        "This user's primary department is managed by another DM — you can only edit users whose primary department is your own.",
      );
    } else {
      // Common case: this VA's primary department is this DM's own —
      // locked to it, same as on create, regardless of what the form sent.
      departmentId = session.departmentId;
    }
  }

  const allDepartmentIds = [departmentId, ...(extraDepartmentIds ?? [])].filter(
    (v): v is string => Boolean(v),
  );
  const allServiceIds = [serviceId, ...(extraServiceIds ?? [])].filter(
    (v): v is string => Boolean(v),
  );
  await assertTeamAndServicesInDepartments(teamId, allServiceIds, departmentId, allDepartmentIds);

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
    if (extraServiceIds !== null) {
      await tx.userService.deleteMany({ where: { userId: id } });
      if (extraServiceIds.length > 0) {
        await tx.userService.createMany({
          data: extraServiceIds.map((svcId) => ({ userId: id, serviceId: svcId })),
          skipDuplicates: true,
        });
      }
    } else if (role !== UserRole.VA && before.additionalServices.length > 0) {
      // Demoted out of VA — additional services are a VA-only concept, same
      // reasoning as additional departments above.
      await tx.userService.deleteMany({ where: { userId: id } });
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

  await assertTeamAndServicesInDepartments(
    teamId,
    serviceId ? [serviceId] : [],
    departmentId,
    departmentId ? [departmentId] : [],
  );

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
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;
  if (DEPT_SCOPED_MANAGER_ROLES.includes(session.role)) {
    // Deactivating locks the account out everywhere, not just this
    // department — so unlike editing (which a co-managing DM can request
    // for their own department's slice), this is reserved for the VA's
    // *primary* department. Otherwise a Walmart DM could lock out a VA
    // whose real home is Amazon just because they're also tagged Walmart.
    if (user.departmentId !== session.departmentId) {
      throw new Error("You can only activate/deactivate users whose primary department is your own.");
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
