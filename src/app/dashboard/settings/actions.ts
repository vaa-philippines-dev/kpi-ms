"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { SYSTEM_MESSAGE_KEYS } from "@/lib/settings";

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

export async function updateSystemMessage(formData: FormData) {
  const session = await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const text = String(formData.get("text") ?? "").trim();
  const toneRaw = String(formData.get("tone") ?? "");
  const tone = toneRaw === "update" || toneRaw === "caution" ? toneRaw : "notice";

  const keys = Object.values(SYSTEM_MESSAGE_KEYS);
  const before = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const beforeMap = Object.fromEntries(before.map((r) => [r.key, r.value]));

  const updates: [string, string][] = [
    [SYSTEM_MESSAGE_KEYS.enabled, String(enabled)],
    [SYSTEM_MESSAGE_KEYS.text, text],
    [SYSTEM_MESSAGE_KEYS.tone, tone],
  ];

  await prisma.$transaction(
    updates.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value, updatedById: session!.user!.id },
        update: { value, updatedById: session!.user!.id },
      }),
    ),
  );

  const changes = updates
    .filter(([key, value]) => (beforeMap[key] ?? "") !== value)
    .map(([key, value]) => ({ field: key, oldValue: beforeMap[key] ?? null, newValue: value }));

  if (changes.length) {
    await logActivity(prisma, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: "UPDATE",
      entityType: "Setting",
      entityId: "SYSTEM_MESSAGE",
      entityLabel: "System Message",
      summary: "Changed the system message banner",
      changes,
    });
  }
  revalidatePath("/dashboard/settings");
}
