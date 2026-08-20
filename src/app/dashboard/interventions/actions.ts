"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireManager() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OM") {
    throw new Error("Only Admins, DMs, or OMs can log interventions.");
  }
  return session;
}

export async function createIntervention(formData: FormData) {
  const session = await requireManager();
  const connectionId = String(formData.get("connectionId") ?? "");
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const actionTaken = String(formData.get("actionTaken") ?? "").trim() || null;

  if (!connectionId || !type || !description) {
    throw new Error("Connection, type, and description are required.");
  }

  await prisma.intervention.create({
    data: {
      connectionId,
      type,
      description,
      actionTaken,
      createdById: session!.user!.id,
    },
  });
  revalidatePath("/dashboard/interventions");
}

// Full edit — mirrors legacy updateIntervention(), which could revise any
// field, not just the outcome.
export async function updateIntervention(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const actionTaken = String(formData.get("actionTaken") ?? "").trim() || null;
  const outcome = String(formData.get("outcome") ?? "").trim() || null;
  if (!type || !description) {
    throw new Error("Type and description are required.");
  }
  await prisma.intervention.update({
    where: { id },
    data: { type, description, actionTaken, outcome },
  });
  revalidatePath("/dashboard/interventions");
}

export async function deleteIntervention(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.intervention.delete({ where: { id } });
  revalidatePath("/dashboard/interventions");
}
