"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";

type ManagingSession = { id: string; role: UserRole; departmentId: string | null };

// Mirrors legacy's Manager capability (Users.js: getUsers/createUser/
// updateUser all accept ROLES.ADMIN or ROLES.MANAGER) — a DM can manage
// users, but only within their own department, and only as OM/VA (legacy's
// Manager create form (AppUsers.html: openCreateUser) only offers 'Team
// Leader'/'Virtual Assistant').
const DM_MANAGEABLE_ROLES: UserRole[] = [UserRole.OM, UserRole.VA];

async function requireManager(): Promise<ManagingSession> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM") {
    throw new Error("Only admins and DMs can manage users.");
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

  if (session.role === "DM") {
    if (!DM_MANAGEABLE_ROLES.includes(role)) {
      throw new Error("DMs may only create OM or VA users.");
    }
    // A DM can only create users in their own department, regardless of
    // what the form submitted.
    departmentId = session.departmentId;
  }

  // Pre-provisions the row so it's ready with the right role/department the
  // moment this person signs in with Google — the NextAuth jwt callback
  // upserts on email but never overwrites an existing row (update: {}).
  await prisma.user.create({
    data: { email, name, role, departmentId, serviceId, teamId },
  });
  revalidatePath("/dashboard/users");
}

export async function updateUser(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing user id.");
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as UserRole;
  let departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (!Object.values(UserRole).includes(role)) {
    throw new Error("Invalid role.");
  }

  if (session.role === "DM") {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.departmentId !== session.departmentId) {
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
    // Locked to the DM's own department, same as on create.
    departmentId = session.departmentId;
  }

  await prisma.user.update({
    where: { id },
    data: { name, role, departmentId, serviceId, teamId },
  });
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

  if (session.role === "DM") {
    departmentId = session.departmentId;
  }

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
    if (session.role === "DM" && !DM_MANAGEABLE_ROLES.includes(role)) {
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

  await prisma.user.createMany({ data: users, skipDuplicates: true });
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
  if (session.role === "DM") {
    if (user.departmentId !== session.departmentId) {
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
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/teams");
}
