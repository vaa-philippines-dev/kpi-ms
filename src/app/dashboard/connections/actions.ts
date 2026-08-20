"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

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
  const secondaryName = String(formData.get("secondaryName") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "");
  // Defaults to today, mirroring legacy's createVAConnection() (StartDate:
  // data.startDate || now).
  const startDate = startDateRaw ? new Date(`${startDateRaw}T00:00:00.000Z`) : new Date();

  if (!vaUserId || !clientName || !departmentId) {
    throw new Error("All fields are required.");
  }

  await prisma.connection.create({
    data: { vaUserId, clientName, secondaryName, departmentId, startDate },
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

export async function toggleConnectionFlag(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const connection = await prisma.connection.findUnique({ where: { id } });
  if (!connection) return;
  await prisma.connection.update({
    where: { id },
    data: { isFlagged: !connection.isFlagged },
  });
  revalidatePath("/dashboard/connections");
}

// Legacy's connection detail modal lets an admin edit Account Name and
// Start Date inline (connDetailItem() editable fields) — mirrored here as
// one action covering both, since they're edited from the same panel.
export async function updateConnectionInfo(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const clientName = String(formData.get("clientName") ?? "").trim();
  const secondaryName = String(formData.get("secondaryName") ?? "").trim() || null;
  const startDateRaw = String(formData.get("startDate") ?? "");
  if (!clientName) throw new Error("Account name is required.");

  await prisma.connection.update({
    where: { id },
    data: {
      clientName,
      secondaryName,
      startDate: startDateRaw ? new Date(`${startDateRaw}T00:00:00.000Z`) : null,
    },
  });
  revalidatePath("/dashboard/connections");
}

export type ConnectionPerformanceRow = {
  kpiDefinitionId: string;
  kpiName: string;
  period: KpiPeriod;
  periodStart: string;
  actualValue: number | null;
  targetValue: number;
  pct: number | null;
  status: PerformanceStatus;
};

// Lazily loaded when the Connections detail modal's Performance tab opens —
// mirrors legacy's renderPerfCharts() (AppVAConnections.html:1078-1138),
// which loads Actual vs Target per KPI over recent periods; kept as a
// compact table here rather than an SVG line chart per se. Capped to the
// last 4 periods per KPI, the same "recent periods" window legacy's chart
// used. Scoped like getKpiConfigDetail() — viewing is open to every role
// that can already see this connection, not just admins.
export async function getConnectionPerformance(
  connectionId: string,
): Promise<ConnectionPerformanceRow[]> {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
  });
  if (!connection) throw new Error("Connection not found.");

  const summaries = await prisma.performanceSummary.findMany({
    where: { connectionId },
    include: { kpiDefinition: true },
    orderBy: [{ kpiDefinition: { name: "asc" } }, { periodStart: "desc" }],
  });

  const perKpiCount = new Map<string, number>();
  const rows: ConnectionPerformanceRow[] = [];
  for (const s of summaries) {
    const count = perKpiCount.get(s.kpiDefinitionId) ?? 0;
    if (count >= 4) continue;
    perKpiCount.set(s.kpiDefinitionId, count + 1);
    rows.push({
      kpiDefinitionId: s.kpiDefinitionId,
      kpiName: s.kpiDefinition.name,
      period: s.period,
      periodStart: s.periodStart.toISOString(),
      actualValue: s.actualValue,
      targetValue: s.targetValue,
      pct: s.pct,
      status: s.status,
    });
  }
  return rows;
}

export async function updateConnectionNotes(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await prisma.connection.update({ where: { id }, data: { notes } });
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
