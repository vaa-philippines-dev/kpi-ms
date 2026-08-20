"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
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

export async function setViewAs(formData: FormData) {
  await requireRealAdmin();
  const userId = String(formData.get("userId") ?? "");
  const store = await cookies();
  if (!userId) {
    store.delete(VIEW_AS_COOKIE);
  } else {
    store.set(VIEW_AS_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  revalidatePath("/dashboard", "layout");
}

export async function exitViewAs() {
  await requireRealAdmin();
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  revalidatePath("/dashboard", "layout");
}
