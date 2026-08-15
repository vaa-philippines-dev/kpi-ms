"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus } from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage connections.");
  }
  return session;
}

// Terminal states never transition back to anything else — mirrors the
// legacy updateVAConnectionStatus() legal-transition guard.
const TERMINAL_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
];

export async function createConnection(formData: FormData) {
  await requireAdmin();
  const vaUserId = String(formData.get("vaUserId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");

  if (!vaUserId || !clientName || !departmentId) {
    throw new Error("All fields are required.");
  }

  await prisma.connection.create({
    data: { vaUserId, clientName, departmentId },
  });
  revalidatePath("/dashboard/connections");
}

export async function updateConnectionStatus(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ConnectionStatus;
  if (!id || !Object.values(ConnectionStatus).includes(status)) {
    throw new Error("Missing or invalid status.");
  }

  const connection = await prisma.connection.findUnique({ where: { id } });
  if (!connection) throw new Error("Connection not found.");
  if (TERMINAL_STATUSES.includes(connection.status)) {
    throw new Error(
      "This connection has ended and can't be moved to another status.",
    );
  }
  if (connection.status === status) return;

  await prisma.$transaction([
    prisma.connection.update({ where: { id }, data: { status } }),
    prisma.connectionStatusEvent.create({
      data: { connectionId: id, status, changedById: session!.user!.id },
    }),
  ]);
  revalidatePath("/dashboard/connections");
}

export async function updateConnectionType(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const connectionType = String(formData.get("connectionType") ?? "");
  if (!id || !["REGULAR", "PROJECT_BASED"].includes(connectionType)) {
    throw new Error("Missing or invalid connection type.");
  }
  await prisma.connection.update({
    where: { id },
    data: { connectionType: connectionType as "REGULAR" | "PROJECT_BASED" },
  });
  revalidatePath("/dashboard/connections");
}

// Bulk import, one per line: "vaEmail,clientName". The VA must already
// exist as a User (created via Users bulk import or individually first).
// Mirrors legacy bulkCreateConnections().
export async function bulkCreateConnections(formData: FormData) {
  await requireAdmin();
  const raw = String(formData.get("rows") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!departmentId) throw new Error("Department is required.");

  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) throw new Error("No rows to import.");

  const parsed = rows.map((line) => {
    const [vaEmailRaw, clientNameRaw] = line.split(",").map((p) => p?.trim());
    const vaEmail = vaEmailRaw?.toLowerCase();
    if (!vaEmail || !clientNameRaw) {
      throw new Error(`Invalid row: "${line}" (expected vaEmail,clientName)`);
    }
    return { vaEmail, clientName: clientNameRaw };
  });

  const vaUsers = await prisma.user.findMany({
    where: { email: { in: parsed.map((p) => p.vaEmail) } },
  });
  const byEmail = new Map(vaUsers.map((u) => [u.email, u]));

  const missing = parsed.filter((p) => !byEmail.has(p.vaEmail));
  if (missing.length > 0) {
    throw new Error(
      `No user found for: ${missing.map((m) => m.vaEmail).join(", ")}. Create them first (Users page).`,
    );
  }

  await prisma.connection.createMany({
    data: parsed.map((p) => ({
      vaUserId: byEmail.get(p.vaEmail)!.id,
      clientName: p.clientName,
      departmentId,
    })),
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
