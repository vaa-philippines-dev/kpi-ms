import { prisma } from "@/lib/prisma";
import { ActivityAction, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Db = typeof prisma | Prisma.TransactionClient;

export type FieldChange = { field: string; oldValue: string | null; newValue: string | null };

export type ActivityActor = { id: string; role: string; departmentId?: string | null };

/**
 * Writes one ActivityLog row. Accepts either the default `prisma` client or
 * a transaction client (`tx`) so a call site already inside a
 * `prisma.$transaction` can log atomically with the mutation it describes —
 * a log entry should never exist for a write that got rolled back, or be
 * missing for one that committed.
 */
export async function logActivity(
  db: Db,
  args: {
    actor: ActivityActor;
    action: ActivityAction;
    entityType: string;
    entityId: string;
    entityLabel?: string | null;
    summary: string;
    changes?: FieldChange[];
    departmentId?: string | null;
  },
) {
  await db.activityLog.create({
    data: {
      actorId: args.actor.id,
      actorRole: args.actor.role as UserRole,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      entityLabel: args.entityLabel ?? null,
      summary: args.summary,
      changes:
        args.changes && args.changes.length > 0
          ? (args.changes as unknown as Prisma.InputJsonValue)
          : undefined,
      departmentId: args.departmentId ?? args.actor.departmentId ?? null,
    },
  });
}

/**
 * Diffs the given fields between two plain objects, returning only the ones
 * that actually changed — the same shape kpi-config/actions.ts's
 * KpiConfigHistory logging already uses, generalized for reuse across every
 * entity's UPDATE actions.
 */
export function diffFields(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const oldValue = oldObj[field];
    const newValue = newObj[field];
    if (oldValue !== newValue) {
      changes.push({
        field,
        oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue),
        newValue: newValue === null || newValue === undefined ? null : String(newValue),
      });
    }
  }
  return changes;
}
