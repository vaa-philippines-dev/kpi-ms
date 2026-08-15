import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { csvResponse } from "@/lib/csv";
import { KpiPeriod } from "@/generated/prisma/enums";

export async function GET() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const summaries = await prisma.performanceSummary.findMany({
    where: {
      connection: scope,
      OR: [
        { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
        { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
      ],
    },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    include: {
      connection: { include: { department: true, vaUser: true } },
      kpiDefinition: true,
    },
  });

  return csvResponse(
    "performance.csv",
    summaries.map((s) => ({
      Status: s.status,
      Cluster: s.kpiDefinition.cluster,
      VA: s.connection.vaUser.name ?? s.connection.vaUser.email,
      Client: s.connection.clientName,
      Department: s.connection.department.name,
      KPI: s.kpiDefinition.name,
      Period: s.period,
      PeriodStart: s.periodStart.toISOString().slice(0, 10),
      Actual: s.actualValue ?? "",
      Target: s.targetValue,
      Pct: s.pct !== null ? s.pct.toFixed(1) : "",
    })),
  );
}
