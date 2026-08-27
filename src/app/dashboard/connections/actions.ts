"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import { generateConnectionShortCode } from "@/lib/connection-short-code";
import { logActivity, diffFields } from "@/lib/activity-log";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Only admins can manage connections.");
  }
  return session;
}

// Editing a connection's status, type, account info, and notes is open to
// ADMIN, DM (Manager), and OM (Team Leader) — each locked to the
// connections they can already see via connectionScopeWhere (DM: own
// department, OM: own team's connections). Same pattern as
// requireKpiConfigEditor() in kpi-config/actions.ts; flagging and deleting
// a connection stay admin-only, so those two mutations keep requireAdmin().
async function requireConnectionEditor(): Promise<ScopingSession> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OM") {
    throw new Error("You don't have permission to edit connections.");
  }
  return {
    id: session!.user.id,
    role,
    departmentId: session!.user.departmentId,
    teamId: session!.user.teamId,
  };
}

// Creating a new connection (unlike every other connection mutation below)
// is also open to DM and the DM-equivalent OPS_MANAGER, each locked to their
// own department — mirrors the same "ignore the submitted value, lock to
// session" pattern already used by users/actions.ts's createUser.
async function requireConnectionCreator(): Promise<{
  id: string;
  role: string;
  departmentId: string | null;
}> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "DM" && role !== "OPS_MANAGER") {
    throw new Error("Only admins, DMs, or Ops Managers can create connections.");
  }
  return { id: session!.user.id, role, departmentId: session!.user.departmentId };
}

// Terminal states never transition back to anything else — mirrors the
// legacy updateVAConnectionStatus() legal-transition guard.
const TERMINAL_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
];

export async function createConnection(formData: FormData) {
  const creator = await requireConnectionCreator();
  const vaUserId = String(formData.get("vaUserId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  const secondaryName = String(formData.get("secondaryName") ?? "").trim() || null;
  // DM/Ops Manager can only create connections in their own department,
  // regardless of what the form submitted.
  const departmentId =
    creator.role === "ADMIN"
      ? String(formData.get("departmentId") ?? "")
      : (creator.departmentId ?? "");
  const serviceId = String(formData.get("serviceId") ?? "") || null;
  const connectionTypeRaw = String(formData.get("connectionType") ?? "REGULAR");
  const connectionType = connectionTypeRaw === "PROJECT_BASED" ? "PROJECT_BASED" : "REGULAR";
  const startDateRaw = String(formData.get("startDate") ?? "");
  // Defaults to today, mirroring legacy's createVAConnection() (StartDate:
  // data.startDate || now).
  const startDate = startDateRaw ? new Date(`${startDateRaw}T00:00:00.000Z`) : new Date();

  if (!vaUserId || !clientName || !departmentId) {
    throw new Error("All fields are required.");
  }

  const shortCode = await generateConnectionShortCode();
  const connection = await prisma.connection.create({
    data: {
      vaUserId,
      clientName,
      secondaryName,
      departmentId,
      serviceId,
      connectionType,
      startDate,
      shortCode,
      // Legacy createVAConnection() always starts a new connection as
      // Pending, regardless of role or form defaults.
      status: "PENDING",
    },
  });
  await logActivity(prisma, {
    actor: creator,
    action: "CREATE",
    entityType: "Connection",
    entityId: connection.id,
    entityLabel: connection.clientName,
    summary: `Created connection "${connection.clientName}"`,
    departmentId: connection.departmentId,
  });
  revalidatePath("/dashboard/connections");
}

export async function updateConnectionStatus(formData: FormData) {
  const session = await requireConnectionEditor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ConnectionStatus;
  if (!id || !Object.values(ConnectionStatus).includes(status)) {
    throw new Error("Missing or invalid status.");
  }

  const connection = await prisma.connection.findFirst({
    where: { id, ...connectionScopeWhere(session) },
  });
  if (!connection) throw new Error("Connection not found.");
  if (TERMINAL_STATUSES.includes(connection.status)) {
    throw new Error(
      "This connection has ended and can't be moved to another status.",
    );
  }
  if (connection.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.connection.update({ where: { id }, data: { status } });
    await tx.connectionStatusEvent.create({
      data: { connectionId: id, status, changedById: session.id },
    });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "Connection",
      entityId: id,
      entityLabel: connection.clientName,
      summary: `Changed status of "${connection.clientName}" from ${connection.status} to ${status}`,
      changes: [{ field: "status", oldValue: connection.status, newValue: status }],
      departmentId: connection.departmentId,
    });
  });
  revalidatePath("/dashboard/connections");
}

export async function updateConnectionType(formData: FormData) {
  const session = await requireConnectionEditor();
  const id = String(formData.get("id") ?? "");
  const connectionType = String(formData.get("connectionType") ?? "");
  if (!id || !["REGULAR", "PROJECT_BASED"].includes(connectionType)) {
    throw new Error("Missing or invalid connection type.");
  }
  const before = await prisma.connection.findFirst({
    where: { id, ...connectionScopeWhere(session) },
  });
  if (!before) throw new Error("Connection not found.");
  await prisma.connection.update({
    where: { id },
    data: { connectionType: connectionType as "REGULAR" | "PROJECT_BASED" },
  });
  if (before.connectionType !== connectionType) {
    await logActivity(prisma, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "Connection",
      entityId: id,
      entityLabel: before.clientName,
      summary: `Changed connection type of "${before.clientName}" to ${connectionType}`,
      changes: [{ field: "connectionType", oldValue: before.connectionType, newValue: connectionType }],
      departmentId: before.departmentId,
    });
  }
  revalidatePath("/dashboard/connections");
}

export type ConnectionImportRow = {
  clientName: string;
  secondaryName: string;
  departmentName: string;
  serviceName: string;
  vaName: string;
  startDate: string;
};

export type ConnectionImportRowResult = {
  row: number;
  success: boolean;
  clientName: string;
  message?: string;
};

// CSV/paste bulk import — mirrors legacy's bulkCreateVAConnections():
// matches Department/Service/VA by (case-insensitive) name rather than ID,
// skips invalid rows instead of failing the whole batch, and reports a
// per-row result so the caller can render the same success/fail summary
// legacy's import wizard does.
export async function bulkCreateConnectionsFromRows(
  rows: ConnectionImportRow[],
): Promise<{ imported: number; failed: number; results: ConnectionImportRowResult[] }> {
  const session = await requireAdmin();
  if (rows.length === 0) throw new Error("No rows to import.");

  const [departments, services, vaUsers] = await Promise.all([
    prisma.department.findMany(),
    prisma.service.findMany({ where: { isActive: true } }),
    prisma.user.findMany({ where: { role: "VA" } }),
  ]);
  const norm = (s: string) => s.toLowerCase().trim();

  const results: ConnectionImportRowResult[] = [];
  const usedInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      if (!row.clientName) {
        results.push({ row: rowNum, success: false, clientName: row.clientName, message: "Client Name is required." });
        continue;
      }
      const dept = departments.find((d) => norm(d.name) === norm(row.departmentName));
      if (!dept) {
        results.push({
          row: rowNum,
          success: false,
          clientName: row.clientName,
          message: `Department "${row.departmentName}" not found.`,
        });
        continue;
      }
      const svc = services.find(
        (s) => s.departmentId === dept.id && norm(s.name) === norm(row.serviceName),
      );
      if (!svc) {
        results.push({
          row: rowNum,
          success: false,
          clientName: row.clientName,
          message: `Service "${row.serviceName}" not found in ${dept.name}.`,
        });
        continue;
      }
      let vaUserId: string | null = null;
      if (row.vaName) {
        const va = vaUsers.find((u) => norm(u.name ?? u.email) === norm(row.vaName));
        if (!va) {
          results.push({
            row: rowNum,
            success: false,
            clientName: row.clientName,
            message: `VA "${row.vaName}" not found.`,
          });
          continue;
        }
        vaUserId = va.id;
      }
      if (!vaUserId) {
        results.push({ row: rowNum, success: false, clientName: row.clientName, message: "VA Name is required." });
        continue;
      }

      let shortCode = await generateConnectionShortCode();
      while (usedInBatch.has(shortCode)) {
        shortCode = await generateConnectionShortCode();
      }
      usedInBatch.add(shortCode);

      await prisma.connection.create({
        data: {
          vaUserId,
          clientName: row.clientName,
          secondaryName: row.secondaryName || null,
          departmentId: dept.id,
          serviceId: svc.id,
          startDate: row.startDate ? new Date(`${row.startDate}T00:00:00.000Z`) : new Date(),
          status: "PENDING",
          shortCode,
        },
      });
      results.push({ row: rowNum, success: true, clientName: row.clientName });
    } catch (e) {
      results.push({
        row: rowNum,
        success: false,
        clientName: row.clientName,
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  revalidatePath("/dashboard/connections");
  const imported = results.filter((r) => r.success).length;
  if (imported > 0) {
    await logActivity(prisma, {
      actor: { id: session!.user!.id, role: session!.user!.role },
      action: "CREATE",
      entityType: "Connection",
      entityId: "bulk",
      summary: `Bulk-imported ${imported} connection${imported === 1 ? "" : "s"}${results.length - imported > 0 ? ` (${results.length - imported} row(s) failed)` : ""}`,
    });
  }
  return { imported, failed: results.length - imported, results };
}

export async function toggleConnectionFlag(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const connection = await prisma.connection.findUnique({ where: { id } });
  if (!connection) return;
  const isFlagged = !connection.isFlagged;
  await prisma.connection.update({
    where: { id },
    data: { isFlagged },
  });
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "UPDATE",
    entityType: "Connection",
    entityId: id,
    entityLabel: connection.clientName,
    summary: `${isFlagged ? "Flagged" : "Unflagged"} connection "${connection.clientName}"`,
    changes: [{ field: "isFlagged", oldValue: String(connection.isFlagged), newValue: String(isFlagged) }],
    departmentId: connection.departmentId,
  });
  revalidatePath("/dashboard/connections");
}

// Legacy's connection detail modal lets an admin edit Account Name and
// Start Date inline (connDetailItem() editable fields) — mirrored here as
// one action covering both, since they're edited from the same panel.
export async function updateConnectionInfo(formData: FormData) {
  const session = await requireConnectionEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const clientName = String(formData.get("clientName") ?? "").trim();
  const secondaryName = String(formData.get("secondaryName") ?? "").trim() || null;
  const startDateRaw = String(formData.get("startDate") ?? "");
  if (!clientName) throw new Error("Account name is required.");

  const before = await prisma.connection.findFirst({
    where: { id, ...connectionScopeWhere(session) },
  });
  if (!before) throw new Error("Connection not found.");
  const startDate = startDateRaw ? new Date(`${startDateRaw}T00:00:00.000Z`) : null;
  await prisma.connection.update({
    where: { id },
    data: { clientName, secondaryName, startDate },
  });
  const changes = diffFields(
    { clientName: before.clientName, secondaryName: before.secondaryName, startDate: before.startDate?.toISOString() ?? null },
    { clientName, secondaryName, startDate: startDate?.toISOString() ?? null },
    ["clientName", "secondaryName", "startDate"],
  );
  if (changes.length > 0) {
    await logActivity(prisma, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "Connection",
      entityId: id,
      entityLabel: clientName,
      summary: `Edited connection info for "${clientName}" — ${changes.map((c) => c.field).join(", ")}`,
      changes,
      departmentId: before.departmentId,
    });
  }
  revalidatePath("/dashboard/connections");
}

// Reassigns which VA (and, for admins, which department/service) a
// connection belongs to — the "change the VA connected to this client, or
// move the connection to another department/service" counterpart to
// updateConnectionInfo above. DM/OM stay locked to their own department
// (same restriction requireConnectionCreator applies on create) so they
// can only reassign VAs within it; only ADMIN can move a connection across
// departments.
export async function updateConnectionAssignment(formData: FormData) {
  const session = await requireConnectionEditor();
  const id = String(formData.get("id") ?? "");
  const vaUserId = String(formData.get("vaUserId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "") || null;
  if (!id || !vaUserId || !departmentId) {
    throw new Error("VA and department are required.");
  }

  const before = await prisma.connection.findFirst({
    where: { id, ...connectionScopeWhere(session) },
    include: { vaUser: true, department: true },
  });
  if (!before) throw new Error("Connection not found.");

  if (session.role !== "ADMIN" && departmentId !== session.departmentId) {
    throw new Error("You can only assign connections within your own department.");
  }

  const [va, department, service] = await Promise.all([
    prisma.user.findUnique({ where: { id: vaUserId }, include: { additionalDepartments: true } }),
    prisma.department.findUnique({ where: { id: departmentId } }),
    serviceId ? prisma.service.findUnique({ where: { id: serviceId } }) : Promise.resolve(null),
  ]);
  if (!va || va.role !== "VA") throw new Error("Invalid VA.");
  if (!department) throw new Error("Invalid department.");
  if (serviceId && (!service || service.departmentId !== departmentId)) {
    throw new Error("Selected service does not belong to the selected department.");
  }
  const vaInDept =
    va.departmentId === departmentId ||
    va.additionalDepartments.some((d) => d.departmentId === departmentId);
  if (!vaInDept) {
    throw new Error("Selected VA does not belong to the selected department.");
  }

  await prisma.connection.update({
    where: { id },
    data: { vaUserId, departmentId, serviceId },
  });

  const changes = diffFields(
    { vaUserId: before.vaUserId, departmentId: before.departmentId, serviceId: before.serviceId },
    { vaUserId, departmentId, serviceId },
    ["vaUserId", "departmentId", "serviceId"],
  );
  if (changes.length > 0) {
    const bits: string[] = [];
    if (before.vaUserId !== vaUserId) {
      bits.push(`VA ${before.vaUser.name ?? before.vaUser.email} → ${va.name ?? va.email}`);
    }
    if (before.departmentId !== departmentId) {
      bits.push(`department ${before.department.name} → ${department.name}`);
    }
    await logActivity(prisma, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "Connection",
      entityId: id,
      entityLabel: before.clientName,
      summary: `Reassigned connection "${before.clientName}"${bits.length ? ` — ${bits.join(", ")}` : ""}`,
      changes,
      departmentId: before.departmentId,
    });
  }
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
  const session = await requireConnectionEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const before = await prisma.connection.findFirst({
    where: { id, ...connectionScopeWhere(session) },
  });
  if (!before) return;
  await prisma.connection.update({ where: { id }, data: { notes } });
  if (before.notes !== notes) {
    await logActivity(prisma, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "Connection",
      entityId: id,
      entityLabel: before.clientName,
      summary: `Edited notes for "${before.clientName}"`,
      changes: [{ field: "notes", oldValue: before.notes, newValue: notes }],
      departmentId: before.departmentId,
    });
  }
  revalidatePath("/dashboard/connections");
}

export async function deleteConnection(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const connection = await prisma.connection.findUnique({ where: { id } });
  if (!connection) return;
  // Admin-only, and deliberately unconditional: every table that references
  // this connection is wiped first so the delete below never trips a
  // foreign-key error, regardless of how much submission/history data has
  // piled up against it. Order matters — children before parents.
  await prisma.$transaction([
    prisma.submissionRecord.deleteMany({ where: { submission: { connectionId: id } } }),
    prisma.submission.deleteMany({ where: { connectionId: id } }),
    prisma.submissionDraft.deleteMany({ where: { connectionId: id } }),
    prisma.performanceSummary.deleteMany({ where: { connectionId: id } }),
    prisma.kpiConfigHistory.deleteMany({ where: { kpiConfig: { connectionId: id } } }),
    prisma.kpiConfig.deleteMany({ where: { connectionId: id } }),
    prisma.intervention.deleteMany({ where: { connectionId: id } }),
    prisma.connectionStatusEvent.deleteMany({ where: { connectionId: id } }),
    prisma.connection.delete({ where: { id } }),
  ]);
  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "DELETE",
    entityType: "Connection",
    entityId: id,
    entityLabel: connection?.clientName ?? id,
    summary: `Deleted connection "${connection?.clientName ?? id}"`,
    departmentId: connection?.departmentId ?? null,
  });
  revalidatePath("/dashboard/connections");
}
