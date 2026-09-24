"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CsAssignmentSource, UserRole } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity-log";
import { randomAssignmentCode } from "@/lib/cs-assignment-code";

// Real session only (never view-as), like every other mutation.
async function requireCsAssigner() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== UserRole.CS_MANAGER && role !== UserRole.ADMIN) {
    throw new Error("Only the CS Manager or an admin can reassign clients.");
  }
  return { id: session!.user.id, role: role as string };
}

function revalidateCs() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/connections");
  revalidatePath("/dashboard/status-requests", "layout");
}

/**
 * Moves a client to another CS Specialist. Marked MANUAL so the CMS sync
 * leaves it alone (the CMS sheet is read-only to us — this can't be written
 * back there). The previous assignment is deactivated, not deleted; if the
 * new CS held this client before, their old row (and CSC_ code) is reused.
 * Open status requests follow automatically, since they're routed live
 * through the client's active assignment.
 */
export async function reassignClientCs(formData: FormData) {
  const actor = await requireCsAssigner();
  const customerId = String(formData.get("customerId") ?? "");
  const csUserId = String(formData.get("csUserId") ?? "");

  const [customer, cs] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { csAssignments: { include: { csUser: { select: { name: true, email: true } } } } },
    }),
    prisma.user.findUnique({ where: { id: csUserId } }),
  ]);
  if (!customer) throw new Error("Client not found.");
  if (!cs || cs.role !== UserRole.CS_SPECIALIST || !cs.isActive) {
    throw new Error("Pick an active CS Specialist.");
  }
  const previous = customer.csAssignments.find((a) => a.isActive);
  if (previous?.csUserId === csUserId) {
    throw new Error(`${customer.name} is already assigned to ${cs.name ?? cs.email}.`);
  }
  const existingRow = customer.csAssignments.find((a) => a.csUserId === csUserId);

  await prisma.$transaction(async (tx) => {
    await tx.csClientAssignment.updateMany({
      where: { customerId, isActive: true },
      data: { isActive: false },
    });
    const manual = { isActive: true, source: CsAssignmentSource.MANUAL, assignedById: actor.id };
    if (existingRow) {
      await tx.csClientAssignment.update({ where: { id: existingRow.id }, data: manual });
    } else {
      await tx.csClientAssignment.create({
        data: { ...manual, code: randomAssignmentCode(), csUserId, customerId },
      });
    }
    const fromName = previous ? (previous.csUser.name ?? previous.csUser.email) : "nobody";
    await logActivity(tx, {
      actor,
      action: "UPDATE",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: customer.name,
      summary: `Reassigned client "${customer.name}" from ${fromName} to ${cs.name ?? cs.email} (CS)`,
      changes: [{ field: "csUserId", oldValue: previous?.csUserId ?? null, newValue: csUserId }],
    });
  });
  revalidateCs();
}

/**
 * Drops a KPI-side (MANUAL) override so the client follows the CMS again.
 * Nothing moves right away — the next "Sync CS Specialists & Clients" run
 * re-applies the CMS's AssignedSpecialist.
 */
export async function resetClientCsToCms(formData: FormData) {
  const actor = await requireCsAssigner();
  const customerId = String(formData.get("customerId") ?? "");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Client not found.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.csClientAssignment.updateMany({
      where: { customerId, source: CsAssignmentSource.MANUAL },
      data: { source: CsAssignmentSource.CMS },
    });
    if (updated.count === 0) throw new Error("This client already follows the CMS.");
    await logActivity(tx, {
      actor,
      action: "UPDATE",
      entityType: "Customer",
      entityId: customerId,
      entityLabel: customer.name,
      summary: `Reset CS assignment of "${customer.name}" to follow the CMS`,
    });
  });
  revalidateCs();
}
