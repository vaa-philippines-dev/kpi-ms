"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConnectionStatus, StatusChangeRequestState, UserRole } from "@/generated/prisma/enums";
import { connectionScopeWhere, type ScopingSession } from "@/lib/connection-scope";
import { logActivity } from "@/lib/activity-log";
import { TERMINAL_STATUSES, parseEocDate, applyConnectionStatusChange } from "@/lib/connection-status";
import { connectionStatusLabel } from "@/lib/connection-labels";

// Every action here reads the REAL session (auth()), never the view-as one,
// same rule as every other mutation in the app.
async function realSession(): Promise<ScopingSession> {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  return {
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  };
}

// Same four roles as requireConnectionEditor() in connections/actions.ts —
// anyone who manages the connection can raise a request for it.
const REQUESTER_ROLES = new Set<string>([UserRole.ADMIN, UserRole.DM, UserRole.OPS_MANAGER, UserRole.OM]);
// The CS assigned to the connection's client resolves requests; ADMIN can
// too, as a fallback for clients with no CS assigned yet.
const RESOLVER_ROLES = new Set<string>([UserRole.CS_SPECIALIST, UserRole.ADMIN]);

function revalidateAll() {
  revalidatePath("/dashboard/status-requests", "layout");
  revalidatePath("/dashboard/connections");
  revalidatePath("/dashboard");
}

export async function createStatusChangeRequest(formData: FormData) {
  const session = await realSession();
  if (!REQUESTER_ROLES.has(session.role)) {
    throw new Error("You don't have permission to request a status change.");
  }
  const connectionId = String(formData.get("connectionId") ?? "");
  const requestedStatus = String(formData.get("requestedStatus") ?? "") as ConnectionStatus;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!connectionId || !Object.values(ConnectionStatus).includes(requestedStatus)) {
    throw new Error("Pick the status you're requesting.");
  }
  if (!reason) throw new Error("A reason is required.");

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...connectionScopeWhere(session) },
  });
  if (!connection) throw new Error("Connection not found.");
  if (TERMINAL_STATUSES.includes(connection.status)) {
    throw new Error("This connection has already ended.");
  }
  if (connection.status === requestedStatus) {
    throw new Error(`This connection is already ${connectionStatusLabel(requestedStatus)}.`);
  }
  const existing = await prisma.statusChangeRequest.findFirst({
    where: { connectionId, state: StatusChangeRequestState.PENDING },
  });
  if (existing) {
    throw new Error("There's already a pending status request for this connection — cancel it first.");
  }

  const effectiveDate = TERMINAL_STATUSES.includes(requestedStatus)
    ? parseEocDate(String(formData.get("effectiveDate") ?? ""))
    : null;

  await prisma.$transaction(async (tx) => {
    const request = await tx.statusChangeRequest.create({
      data: {
        connectionId,
        fromStatus: connection.status,
        requestedStatus,
        effectiveDate,
        reason,
        requestedById: session.id,
      },
    });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role },
      action: "CREATE",
      entityType: "StatusChangeRequest",
      entityId: request.id,
      entityLabel: connection.clientName,
      summary: `Requested status change for "${connection.clientName}": ${connection.status} → ${requestedStatus}`,
      departmentId: connection.departmentId,
    });
  });
  revalidateAll();
}

/** A pending request, re-checked against the resolver's own scope. */
async function loadPendingForResolver(session: ScopingSession, requestId: string) {
  if (!RESOLVER_ROLES.has(session.role)) {
    throw new Error("Only the client's CS Specialist can resolve status requests.");
  }
  const request = await prisma.statusChangeRequest.findFirst({
    where: { id: requestId, connection: connectionScopeWhere(session) },
    include: { connection: true },
  });
  if (!request) throw new Error("Request not found.");
  if (request.state !== StatusChangeRequestState.PENDING) {
    throw new Error("This request has already been resolved.");
  }
  return request;
}

export async function approveStatusChangeRequest(formData: FormData) {
  const session = await realSession();
  const requestId = String(formData.get("requestId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const request = await loadPendingForResolver(session, requestId);
  const connection = request.connection;
  if (TERMINAL_STATUSES.includes(connection.status)) {
    throw new Error("This connection has ended since the request was made — reject it instead.");
  }

  await prisma.$transaction(async (tx) => {
    // Conditional on still being PENDING, so two resolvers clicking at once
    // can't both apply it.
    const claimed = await tx.statusChangeRequest.updateMany({
      where: { id: request.id, state: StatusChangeRequestState.PENDING },
      data: {
        state: StatusChangeRequestState.APPROVED,
        resolvedById: session.id,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });
    if (claimed.count === 0) throw new Error("This request has already been resolved.");
    // Someone may have already made the change by hand — nothing to apply.
    if (connection.status !== request.requestedStatus) {
      await applyConnectionStatusChange(tx, {
        connection,
        status: request.requestedStatus,
        eocDate: request.effectiveDate ?? undefined,
        actor: { id: session.id, role: session.role },
        summarySuffix: " (approved status request)",
      });
    }
  });
  revalidateAll();
}

export async function rejectStatusChangeRequest(formData: FormData) {
  const session = await realSession();
  const requestId = String(formData.get("requestId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Add a note explaining why it's rejected.");
  const request = await loadPendingForResolver(session, requestId);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.statusChangeRequest.updateMany({
      where: { id: request.id, state: StatusChangeRequestState.PENDING },
      data: {
        state: StatusChangeRequestState.REJECTED,
        resolvedById: session.id,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });
    if (claimed.count === 0) throw new Error("This request has already been resolved.");
    await logActivity(tx, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "StatusChangeRequest",
      entityId: request.id,
      entityLabel: request.connection.clientName,
      summary: `Rejected status request for "${request.connection.clientName}" (${request.requestedStatus}) — ${note}`,
      departmentId: request.connection.departmentId,
    });
  });
  revalidateAll();
}

/** The requester (or an admin) withdrawing a request that's still pending. */
export async function cancelStatusChangeRequest(formData: FormData) {
  const session = await realSession();
  const requestId = String(formData.get("requestId") ?? "");
  const request = await prisma.statusChangeRequest.findUnique({
    where: { id: requestId },
    include: { connection: { select: { clientName: true, departmentId: true } } },
  });
  if (!request) throw new Error("Request not found.");
  if (request.requestedById !== session.id && session.role !== UserRole.ADMIN) {
    throw new Error("Only whoever raised this request can cancel it.");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.statusChangeRequest.updateMany({
      where: { id: request.id, state: StatusChangeRequestState.PENDING },
      data: {
        state: StatusChangeRequestState.CANCELLED,
        resolvedById: session.id,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new Error("This request has already been resolved.");
    await logActivity(tx, {
      actor: { id: session.id, role: session.role },
      action: "UPDATE",
      entityType: "StatusChangeRequest",
      entityId: request.id,
      entityLabel: request.connection.clientName,
      summary: `Cancelled status request for "${request.connection.clientName}" (${request.requestedStatus})`,
      departmentId: request.connection.departmentId,
    });
  });
  revalidateAll();
}
