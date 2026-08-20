import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { daysSince } from "@/lib/period";
import { csvResponse } from "@/lib/csv";
import { PerformanceStatus } from "@/generated/prisma/enums";

export async function GET() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: true,
      _count: { select: { interventions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return csvResponse(
    "lifetime-value.csv",
    connections.map((c) => {
      const tenureDays = daysSince(c.startDate ?? c.createdAt);
      const periods = new Set(
        c.performanceSummaries.map((s) => `${s.period}:${s.periodStart.toISOString()}`),
      );
      const withData = c.performanceSummaries.filter(
        (s) => s.status !== PerformanceStatus.NO_DATA,
      );
      const onTarget = withData.filter(
        (s) => s.status === PerformanceStatus.ON_TARGET,
      ).length;
      const onTargetPct = withData.length > 0 ? (onTarget / withData.length) * 100 : "";

      return {
        VA: c.vaUser.name ?? c.vaUser.email,
        Client: c.clientName,
        Department: c.department.name,
        TenureDays: tenureDays,
        PeriodsSubmitted: periods.size,
        OnTargetPct: onTargetPct === "" ? "" : (onTargetPct as number).toFixed(0),
        Interventions: c._count.interventions,
      };
    }),
  );
}
