import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/connection-scope";
import { csvResponse } from "@/lib/csv";

// Admin-only, mirroring the page itself (src/app/dashboard/activity/page.tsx).
const RECENT_LIMIT = 2000;

export async function GET() {
  const session = await requireSession();
  if (session.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const [logs, departments] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: { actor: true },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  return csvResponse(
    "activity-log.csv",
    logs.map((log) => ({
      Time: log.createdAt.toISOString(),
      Actor: log.actor?.name ?? log.actor?.email ?? "System",
      Email: log.actor?.email ?? "",
      Role: log.actorRole ?? "",
      Action: log.action,
      "Entity Type": log.entityType,
      Entity: log.entityLabel ?? log.entityId,
      Summary: log.summary,
      Department: log.departmentId ? (departmentNameById.get(log.departmentId) ?? "") : "",
    })),
  );
}
