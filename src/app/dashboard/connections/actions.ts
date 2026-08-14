"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage connections.");
  }
}

export async function createConnection(formData: FormData) {
  await requireAdmin();
  const vaName = String(formData.get("vaName") ?? "").trim();
  const vaEmail = String(formData.get("vaEmail") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");

  if (!vaName || !vaEmail || !clientName || !departmentId) {
    throw new Error("All fields are required.");
  }

  await prisma.connection.create({
    data: { vaName, vaEmail, clientName, departmentId },
  });
  revalidatePath("/dashboard/connections");
}

export async function deleteConnection(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.connection.delete({ where: { id } });
  } catch {
    throw new Error(
      "Can't delete a connection that already has submissions recorded against it.",
    );
  }
  revalidatePath("/dashboard/connections");
}
