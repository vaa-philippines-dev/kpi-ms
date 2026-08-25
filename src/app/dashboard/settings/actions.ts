"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

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

  const before = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, updatedById: session!.user!.id },
    update: { value, updatedById: session!.user!.id },
  });
  if (before?.value !== value) {
    await logActivity(prisma, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: before ? "UPDATE" : "CREATE",
      entityType: "Setting",
      entityId: key,
      entityLabel: key,
      summary: `Changed setting "${key}"`,
      changes: [{ field: "value", oldValue: before?.value ?? null, newValue: value }],
    });
  }
  revalidatePath("/dashboard/settings");
}
