import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const connectionId = request.nextUrl.searchParams.get("connectionId");
  if (!connectionId) {
    return new Response("Missing connectionId", { status: 400 });
  }

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: {
      performanceSummaries: {
        orderBy: { periodStart: "asc" },
        include: { kpiDefinition: true },
      },
    },
  });
  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  return csvResponse(
    `client-detail-${connection.clientName.replace(/\W+/g, "-")}.csv`,
    connection.performanceSummaries.map((s) => ({
      Period: s.period,
      PeriodStart: s.periodStart.toISOString().slice(0, 10),
      KPI: s.kpiDefinition.name,
      Actual: s.actualValue ?? "",
      Target: s.targetValue,
      Status: s.status,
    })),
  );
}
