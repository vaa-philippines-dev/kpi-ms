"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage settings.");
  }
  return session;
}

export async function updateSetting(formData: FormData) {
  const session = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!key) throw new Error("Missing setting key.");

  await prisma.setting.upsert({
    where: { key },
    create: { key, value, updatedById: session!.user!.id },
    update: { value, updatedById: session!.user!.id },
  });
  revalidatePath("/dashboard/settings");
}
