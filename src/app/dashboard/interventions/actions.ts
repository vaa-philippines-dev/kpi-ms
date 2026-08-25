"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { logActivity, diffFields } from "@/lib/activity-log";

async function requireManager() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER" && role !== "OM") {
    throw new Error("Only Admins, DMs, Ops Managers, or OMs can log interventions.");
  }
  return session;
}

export async function createIntervention(formData: FormData) {
  const session = await requireManager();
  const connectionId = String(formData.get("connectionId") ?? "");
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const actionTaken = String(formData.get("actionTaken") ?? "").trim() || null;
  // Optional at creation, mirroring legacy's createIntervention() (Interventions.js),
  // which lets the logger record an initial/pending outcome up front.
  const outcome = String(formData.get("outcome") ?? "").trim() || null;

  if (!connectionId || !type || !description) {
    throw new Error("Connection, type, and description are required.");
  }

  const scope = connectionScopeWhere({
    id: session!.user!.id,
    role: session!.user!.role,
    departmentId: session!.user!.departmentId,
    teamId: session!.user!.teamId,
  });
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
  });
  if (!connection) {
    throw new Error("Connection not found.");
  }

  const intervention = await prisma.intervention.create({
    data: {
      connectionId,
      type,
      description,
      actionTaken,
      outcome,
      createdById: session!.user!.id,
    },
  });
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "CREATE",
    entityType: "Intervention",
    entityId: intervention.id,
    entityLabel: `${type} — ${connection.clientName}`,
    summary: `Logged intervention "${type}" for "${connection.clientName}"`,
    departmentId: connection.departmentId,
  });
  revalidatePath("/dashboard/interventions");
}

// Full edit — mirrors legacy updateIntervention(), which could revise any
// field, not just the outcome.
export async function updateIntervention(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const actionTaken = String(formData.get("actionTaken") ?? "").trim() || null;
  const outcome = String(formData.get("outcome") ?? "").trim() || null;
  if (!type || !description) {
    throw new Error("Type and description are required.");
  }

  const scope = connectionScopeWhere({
    id: session!.user!.id,
    role: session!.user!.role,
    departmentId: session!.user!.departmentId,
    teamId: session!.user!.teamId,
  });
  const existing = await prisma.intervention.findFirst({
    where: { id, connection: scope },
    include: { connection: true },
  });
  if (!existing) {
    throw new Error("Intervention not found.");
  }

  await prisma.intervention.update({
    where: { id },
    data: { type, description, actionTaken, outcome },
  });
  const changes = diffFields(existing, { type, description, actionTaken, outcome }, [
    "type",
    "description",
    "actionTaken",
    "outcome",
  ]);
  if (changes.length > 0) {
    await logActivity(prisma, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: "UPDATE",
      entityType: "Intervention",
      entityId: id,
      entityLabel: `${type} — ${existing.connection.clientName}`,
      summary: `Edited intervention for "${existing.connection.clientName}" — ${changes.map((c) => c.field).join(", ")}`,
      changes,
      departmentId: existing.connection.departmentId,
    });
  }
  revalidatePath("/dashboard/interventions");
}

export async function deleteIntervention(formData: FormData) {
  const session = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const scope = connectionScopeWhere({
    id: session!.user!.id,
    role: session!.user!.role,
    departmentId: session!.user!.departmentId,
    teamId: session!.user!.teamId,
  });
  const existing = await prisma.intervention.findFirst({
    where: { id, connection: scope },
    include: { connection: true },
  });
  if (!existing) {
    throw new Error("Intervention not found.");
  }

  await prisma.intervention.delete({ where: { id } });
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "DELETE",
    entityType: "Intervention",
    entityId: id,
    entityLabel: `${existing.type} — ${existing.connection.clientName}`,
    summary: `Deleted intervention "${existing.type}" for "${existing.connection.clientName}"`,
    departmentId: existing.connection.departmentId,
  });
  revalidatePath("/dashboard/interventions");
}
