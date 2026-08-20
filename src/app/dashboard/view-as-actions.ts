"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

// Gated on the REAL session (never the effective one) — an admin who's
// currently viewing as someone else must still be able to switch targets
// or exit, and nobody else can ever set this cookie.
async function requireRealAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can use View As.");
  }
}

// Picking a role, not a specific person — under the hood this still needs
// one real user's id to compute correct scoping (a DM's department, an
// OM's team, a VA's own connections), so it borrows the first active user
// with that role rather than asking the admin to pick someone by name.
export async function setViewAsRole(formData: FormData) {
  await requireRealAdmin();
  const role = String(formData.get("role") ?? "");
  const store = await cookies();

  if (!role) {
    store.delete(VIEW_AS_COOKIE);
    revalidatePath("/dashboard", "layout");
    return;
  }
  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new Error("Invalid role.");
  }

  const target = await prisma.user.findFirst({
    where: { role: role as UserRole, isActive: true },
    orderBy: { name: "asc" },
  });
  if (!target) {
    throw new Error(`No active user with that role exists yet to preview.`);
  }

  store.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/dashboard", "layout");
}

export async function exitViewAs() {
  await requireRealAdmin();
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  revalidatePath("/dashboard", "layout");
}
