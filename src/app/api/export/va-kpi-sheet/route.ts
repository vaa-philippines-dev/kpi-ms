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
  const requestedDepartmentId = request.nextUrl.searchParams.get("departmentId") || undefined;

  // KPI columns are department-specific, so Admin always exports exactly one
  // department (defaulting to the first alphabetically) — same rule the page
  // uses, so the CSV always matches what's currently on screen.
  let effectiveScope = scope;
  if (isAdmin) {
    const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
    const departmentId =
      requestedDepartmentId && departments.some((d) => d.id === requestedDepartmentId)
        ? requestedDepartmentId
        : departments[0]?.id;
    effectiveScope = departmentId ? { departmentId } : { id: "__none__" };
  }

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
