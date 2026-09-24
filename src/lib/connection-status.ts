import type { Prisma } from "@/generated/prisma/client";
import { ConnectionStatus } from "@/generated/prisma/enums";
import { logActivity, type ActivityActor } from "@/lib/activity-log";

// Terminal states never transition back to anything else — mirrors the
// legacy updateVAConnectionStatus() legal-transition guard.
export const TERMINAL_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
];

/** "2026-09-24" date-input value → UTC midnight, or today when blank. */
export function parseEocDate(raw: string): Date {
  return raw ? new Date(`${raw}T00:00:00.000Z`) : new Date();
}

/**
 * The one non-override way a connection's status changes: updates the row
 * (plus eocDate when moving into a terminal status), records a
 * ConnectionStatusEvent, and writes the Activity Log entry. Shared by
 * updateConnectionStatus (manual edit) and approveStatusChangeRequest (a CS
 * approving a manager's request), so both leave identical audit trails.
 * Callers do their own permission/scope and terminal-status checks first.
 */
export async function applyConnectionStatusChange(
  tx: Prisma.TransactionClient,
  args: {
    connection: { id: string; clientName: string; status: ConnectionStatus; departmentId: string };
    status: ConnectionStatus;
    eocDate?: Date;
    actor: ActivityActor;
    summarySuffix?: string;
  },
) {
  const { connection, status, eocDate, actor } = args;
  await tx.connection.update({
    where: { id: connection.id },
    data: { status, ...(eocDate ? { eocDate } : {}) },
  });
  await tx.connectionStatusEvent.create({
    data: { connectionId: connection.id, status, changedById: actor.id },
  });
  await logActivity(tx, {
    actor,
    action: "UPDATE",
    entityType: "Connection",
    entityId: connection.id,
    entityLabel: connection.clientName,
    summary: `Changed status of "${connection.clientName}" from ${connection.status} to ${status}${args.summarySuffix ?? ""}`,
    changes: [
      { field: "status", oldValue: connection.status, newValue: status },
      ...(eocDate ? [{ field: "eocDate", oldValue: null, newValue: eocDate.toISOString() }] : []),
    ],
    departmentId: connection.departmentId,
  });
}
