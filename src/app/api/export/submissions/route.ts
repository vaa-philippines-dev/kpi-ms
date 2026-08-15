import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { csvResponse } from "@/lib/csv";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

export async function GET() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const [connections, summaries] = await Promise.all([
    prisma.connection.findMany({
      where: scope,
      include: { vaUser: true, department: true },
      orderBy: { clientName: "asc" },
    }),
    prisma.performanceSummary.findMany({
      where: {
        connection: scope,
        OR: [
          { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
          { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
        ],
      },
    }),
  ]);

  const byConnectionPeriod = new Map<string, PerformanceStatus[]>();
  for (const s of summaries) {
    const key = `${s.connectionId}:${s.period}`;
    if (!byConnectionPeriod.has(key)) byConnectionPeriod.set(key, []);
    byConnectionPeriod.get(key)!.push(s.status);
  }
  function trackerStatus(connectionId: string, period: KpiPeriod) {
    const statuses = byConnectionPeriod.get(`${connectionId}:${period}`);
    return statuses && statuses.length > 0 ? rollupStatus(statuses) : "NOT_SUBMITTED";
  }

  return csvResponse(
    "submissions-tracker.csv",
    connections.map((c) => ({
      VA: c.vaUser.name ?? c.vaUser.email,
      Client: c.clientName,
      Department: c.department.name,
      Weekly: trackerStatus(c.id, KpiPeriod.WEEKLY),
      Monthly: trackerStatus(c.id, KpiPeriod.MONTHLY),
    })),
  );
}
