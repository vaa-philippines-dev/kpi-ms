import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { csvResponse } from "@/lib/csv";
import { KpiPeriod } from "@/generated/prisma/enums";

export async function GET() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weekStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: {
        where: { period: KpiPeriod.WEEKLY, periodStart: weekStart },
      },
      interventions: {
        where: { createdAt: { gte: weekStart, lt: weekEnd } },
      },
    },
    orderBy: { clientName: "asc" },
  });

  return csvResponse(
    `weekly-interventions-${weekStart.toISOString().slice(0, 10)}.csv`,
    connections.map((c) => ({
      VA: c.vaUser.name ?? c.vaUser.email,
      Client: c.clientName,
      Department: c.department.name,
      WeeklyStatus:
        c.performanceSummaries.length > 0
          ? rollupStatus(c.performanceSummaries.map((s) => s.status))
          : "NOT_SUBMITTED",
      Interventions: c.interventions.map((iv) => iv.type).join("; "),
    })),
  );
}
