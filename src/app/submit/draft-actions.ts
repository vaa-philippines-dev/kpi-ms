"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { checkRateLimit } from "@/lib/rate-limit";
import { KpiPeriod } from "@/generated/prisma/enums";

export type DraftEntry = { kpiDefinitionId: string; value: number | null; noData: boolean };

/**
 * Autosaves the "view all clusters" form's in-progress values so a VA
 * filling in several areas in one sitting doesn't lose everything if the
 * tab closes before the final Submit. Fired debounced from the client, not
 * per-keystroke — a batch of entries per call, not one call per field.
 * Silently no-ops on any auth/scope failure: a failed autosave shouldn't
 * surface an error over what the VA is still actively typing, and the
 * final Submit (createSubmission) re-validates everything for real.
 */
export async function saveDraftBatch(
  connectionId: string,
  period: KpiPeriod,
  dateParam: string | undefined,
  entries: DraftEntry[],
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user || entries.length === 0) return { ok: false };

  const draftLimit = await checkRateLimit(`submit-draft:${connectionId}`, {
    max: 300,
    windowMs: 60 * 60 * 1000,
  });
  if (!draftLimit.allowed) return { ok: false };

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  });
  const connection = await prisma.connection.findFirst({ where: { id: connectionId, ...scope }, select: { id: true } });
  if (!connection) return { ok: false };

  const weekStartDay = await getWeekStartDay();
  const periodStart = currentPeriodStart(period, parseAnchorDate(dateParam), weekStartDay);

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.submissionDraft.upsert({
        where: {
          connectionId_kpiDefinitionId_period_periodStart: {
            connectionId,
            kpiDefinitionId: entry.kpiDefinitionId,
            period,
            periodStart,
          },
        },
        create: {
          connectionId,
          kpiDefinitionId: entry.kpiDefinitionId,
          period,
          periodStart,
          value: entry.value,
          noData: entry.noData,
          updatedById: session.user.id,
        },
        update: {
          value: entry.value,
          noData: entry.noData,
          updatedById: session.user.id,
        },
      }),
    ),
  );

  return { ok: true };
}
