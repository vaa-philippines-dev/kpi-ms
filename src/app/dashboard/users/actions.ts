"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage users.");
  }
  return session;
}

function optionalId(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "");
  return value === "" ? null : value;
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as UserRole;
  const departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (!email || !Object.values(UserRole).includes(role)) {
    throw new Error("Email and role are required.");
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
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing user id.");
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as UserRole;
  const departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

  if (!Object.values(UserRole).includes(role)) {
    throw new Error("Invalid role.");
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
  await requireAdmin();
  const raw = String(formData.get("rows") ?? "");
  const departmentId = optionalId(formData, "departmentId");
  const serviceId = optionalId(formData, "serviceId");
  const teamId = optionalId(formData, "teamId");

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
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (id === session?.user?.id) {
    throw new Error("You can't deactivate your own account.");
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;
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
