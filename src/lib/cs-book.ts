import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ConnectionStatus, KpiPeriod } from "@/generated/prisma/enums";
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
import type { CsStatusRow } from "@/components/cs-status-table";
import type { CsClientRow } from "@/components/cs-client-table";

// Same "live" set lib/cms-sync/cs-sync.ts uses to derive Customer.status.
export const LIVE_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.ACTIVE,
  ConnectionStatus.PAUSED,
  ConnectionStatus.PENDING,
]);

export type CsBookConnectionRow = CsStatusRow & { csUserId: string; csName: string };
export type CsBookClientRow = CsClientRow & { csUserId: string; csName: string; csIsActive: boolean };

/**
 * One or more CS Specialists' client books for the week starting
 * `weeklyStart` — every client row (one per CsClientAssignment) plus every
 * live VA connection under those clients, with its KPI rollup. Shared by
 * the CS Specialist dashboard (one CS) and the CS Manager's (all of them).
 */
export async function loadCsBook(
  assignmentWhere: Prisma.CsClientAssignmentWhereInput,
  weeklyStart: Date,
): Promise<{ clientRows: CsBookClientRow[]; connectionRows: CsBookConnectionRow[] }> {
  const assignments = await prisma.csClientAssignment.findMany({
    where: assignmentWhere,
    include: {
      csUser: { select: { id: true, name: true, email: true, isActive: true } },
      customer: {
        include: {
          connections: {
            include: {
              vaUser: { select: { name: true, email: true } },
              performanceSummaries: {
                where: { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
                select: {
                  kpiDefinitionId: true,
                  status: true,
                  targetValue: true,
                  actualValue: true,
                  kpiDefinition: { select: { name: true } },
                },
              },
              // Not-applicable KPIs can still carry a stale summary row —
              // excluded from the rollup, same as CsOverview.
              kpiConfigs: { where: { isApplicable: false }, select: { kpiDefinitionId: true } },
            },
            orderBy: { clientName: "asc" },
          },
        },
      },
    },
  });

  const connectionRows: CsBookConnectionRow[] = [];
  const clientRows: CsBookClientRow[] = assignments.map((a) => {
    const csName = a.csUser.name ?? a.csUser.email;
    const live = a.customer.connections.filter((c) => LIVE_STATUSES.has(c.status));
    const perConnection = live.map((c) => {
      const inapplicable = new Set(c.kpiConfigs.map((cfg) => cfg.kpiDefinitionId));
      const summaries = excludeInapplicable(c.performanceSummaries, inapplicable);
      const row: CsBookConnectionRow = {
        id: c.id,
        clientName: c.clientName,
        vaName: c.vaUser.name ?? c.vaUser.email,
        status: rollupStatus(summaries.map((s) => s.status)),
        kpiRows: summaries.map((s) => ({
          name: s.kpiDefinition.name,
          target: s.targetValue,
          actual: s.actualValue,
          status: s.status,
        })),
        csUserId: a.csUserId,
        csName,
      };
      connectionRows.push(row);
      return row;
    });
    return {
      id: a.id,
      clientName: a.customer.name,
      assignmentCode: a.code,
      status: a.customer.status,
      cmsStatus: a.customer.cmsStatus ?? "",
      liveConnections: live.length,
      vaNames: perConnection.map((r) => r.vaName).join(", "),
      performance: rollupStatus(perConnection.map((r) => r.status)),
      csUserId: a.csUserId,
      csName,
      csIsActive: a.csUser.isActive,
    };
  });
  connectionRows.sort((x, y) => x.clientName.localeCompare(y.clientName));
  return { clientRows, connectionRows };
}
