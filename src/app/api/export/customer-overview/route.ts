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
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: {
        where: {
          OR: [
            { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
            { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
          ],
        },
      },
    },
    orderBy: { clientName: "asc" },
  });

  return csvResponse(
    "customer-overview.csv",
    connections.map((c) => ({
      Client: c.clientName,
      VA: c.vaUser.name ?? c.vaUser.email,
      Department: c.department.name,
      ContractStatus: c.status,
      CurrentPerformance:
        c.performanceSummaries.length > 0
          ? rollupStatus(c.performanceSummaries.map((s) => s.status))
          : "NO_DATA",
    })),
  );
}
