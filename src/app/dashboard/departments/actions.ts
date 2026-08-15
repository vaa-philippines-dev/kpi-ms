"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage departments.");
  }
}

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.department.create({ data: { name } });
  revalidatePath("/dashboard/departments");
}

export async function renameDepartment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await prisma.department.update({ where: { id }, data: { name } });
  revalidatePath("/dashboard/departments");
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.department.delete({ where: { id } });
  } catch {
    throw new Error(
      "Can't delete a department that still has KPIs, connections, or users assigned to it.",
    );
  }
  revalidatePath("/dashboard/departments");
}

export async function createService(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) {
    throw new Error("Name and department are required.");
  }
  await prisma.service.create({ data: { name, departmentId } });
  revalidatePath("/dashboard/departments");
}

export async function renameService(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await prisma.service.update({ where: { id }, data: { name } });
  revalidatePath("/dashboard/departments");
}

export async function toggleServiceActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) return;
  await prisma.service.update({
    where: { id },
    data: { isActive: !service.isActive },
  });
  revalidatePath("/dashboard/departments");
}
