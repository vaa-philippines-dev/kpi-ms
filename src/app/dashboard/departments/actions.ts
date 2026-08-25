"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage departments.");
  }
  return { id: session!.user!.id, role: session!.user!.role };
}

export async function createDepartment(formData: FormData) {
  const actor = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const department = await prisma.department.create({ data: { name } });
  await logActivity(prisma, {
    actor,
    action: "CREATE",
    entityType: "Department",
    entityId: department.id,
    entityLabel: department.name,
    summary: `Created department "${department.name}"`,
    departmentId: department.id,
  });
  revalidatePath("/dashboard/departments");
}

export async function renameDepartment(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const before = await prisma.department.findUnique({ where: { id } });
  if (!before) return;
  await prisma.department.update({ where: { id }, data: { name } });
  if (before.name !== name) {
    await logActivity(prisma, {
      actor,
      action: "UPDATE",
      entityType: "Department",
      entityId: id,
      entityLabel: name,
      summary: `Renamed department "${before.name}" to "${name}"`,
      changes: [{ field: "name", oldValue: before.name, newValue: name }],
      departmentId: id,
    });
  }
  revalidatePath("/dashboard/departments");
}

export async function deleteDepartment(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const department = await prisma.department.findUnique({ where: { id } });
  try {
    await prisma.department.delete({ where: { id } });
  } catch {
    throw new Error(
      "Can't delete a department that still has KPIs, connections, or users assigned to it.",
    );
  }
  await logActivity(prisma, {
    actor,
    action: "DELETE",
    entityType: "Department",
    entityId: id,
    entityLabel: department?.name ?? id,
    summary: `Deleted department "${department?.name ?? id}"`,
  });
  revalidatePath("/dashboard/departments");
}

// Daily submission-window guard, per department, to spread VA submission
// traffic across the day instead of everyone hitting /submit at once.
export async function updateSubmissionWindow(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const start = String(formData.get("submissionWindowStart") ?? "").trim() || null;
  const end = String(formData.get("submissionWindowEnd") ?? "").trim() || null;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (start && !timePattern.test(start)) {
    throw new Error("Start time must be in HH:mm format.");
  }
  if (end && !timePattern.test(end)) {
    throw new Error("End time must be in HH:mm format.");
  }
  const before = await prisma.department.findUnique({ where: { id } });
  if (!before) return;
  await prisma.department.update({
    where: { id },
    data: { submissionWindowStart: start, submissionWindowEnd: end },
  });
  if (before.submissionWindowStart !== start || before.submissionWindowEnd !== end) {
    await logActivity(prisma, {
      actor,
      action: "UPDATE",
      entityType: "Department",
      entityId: id,
      entityLabel: before.name,
      summary: `Updated submission window for "${before.name}"`,
      changes: [
        { field: "submissionWindowStart", oldValue: before.submissionWindowStart, newValue: start },
        { field: "submissionWindowEnd", oldValue: before.submissionWindowEnd, newValue: end },
      ],
      departmentId: id,
    });
  }
  revalidatePath("/dashboard/departments");
}

export async function createService(formData: FormData) {
  const actor = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) {
    throw new Error("Name and department are required.");
  }
  const service = await prisma.service.create({ data: { name, departmentId } });
  await logActivity(prisma, {
    actor,
    action: "CREATE",
    entityType: "Service",
    entityId: service.id,
    entityLabel: service.name,
    summary: `Created service "${service.name}"`,
    departmentId,
  });
  revalidatePath("/dashboard/departments");
}

export async function renameService(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const before = await prisma.service.findUnique({ where: { id } });
  if (!before) return;
  await prisma.service.update({ where: { id }, data: { name } });
  if (before.name !== name) {
    await logActivity(prisma, {
      actor,
      action: "UPDATE",
      entityType: "Service",
      entityId: id,
      entityLabel: name,
      summary: `Renamed service "${before.name}" to "${name}"`,
      changes: [{ field: "name", oldValue: before.name, newValue: name }],
      departmentId: before.departmentId,
    });
  }
  revalidatePath("/dashboard/departments");
}

export async function toggleServiceActive(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) return;
  const isActive = !service.isActive;
  await prisma.service.update({
    where: { id },
    data: { isActive },
  });
  await logActivity(prisma, {
    actor,
    action: "UPDATE",
    entityType: "Service",
    entityId: id,
    entityLabel: service.name,
    summary: `${isActive ? "Activated" : "Deactivated"} service "${service.name}"`,
    changes: [{ field: "isActive", oldValue: String(service.isActive), newValue: String(isActive) }],
    departmentId: service.departmentId,
  });
  revalidatePath("/dashboard/departments");
}
