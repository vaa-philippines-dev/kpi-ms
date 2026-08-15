import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { csvResponse } from "@/lib/csv";
import { KpiPeriod } from "@/generated/prisma/enums";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const scope = connectionScopeWhere(session);
  const departmentId = request.nextUrl.searchParams.get("departmentId") || undefined;
  const effectiveScope = isAdmin && departmentId ? { ...scope, departmentId } : scope;

  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const connections = await prisma.connection.findMany({
    where: effectiveScope,
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
        include: { kpiDefinition: true },
      },
    },
    orderBy: { clientName: "asc" },
  });

  const rows = connections.flatMap((c) =>
    c.performanceSummaries.map((s) => ({
      Cluster: s.kpiDefinition.cluster,
      VA: c.vaUser.name ?? c.vaUser.email,
      Client: c.clientName,
      Department: c.department.name,
      KPI: s.kpiDefinition.name,
      Actual: s.actualValue ?? "",
      Target: s.targetValue,
      Status: s.status,
    })),
  );

  return csvResponse("va-kpi-sheet.csv", rows);
}
