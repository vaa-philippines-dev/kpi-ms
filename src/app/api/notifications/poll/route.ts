import { NextRequest, NextResponse } from "next/server";
import { requireSession, SUBMISSION_WATCHER_ROLES, connectionScopeWhere } from "@/lib/connection-scope";
import { prisma } from "@/lib/prisma";
import type { SubmissionNotification } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Polled feed of submission notifications, scoped to this session's
 * department/team the same way every other view in the app is (see
 * connectionScopeWhere). Reads straight off the Submission table instead of
 * an in-memory pub/sub — replaced an SSE stream that held a Vercel function
 * invocation open for as long as a manager's dashboard tab stayed open,
 * which is billed as continuous compute time and was burning the plan's
 * function-duration quota.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const now = new Date();
  if (!SUBMISSION_WATCHER_ROLES.includes(session.role as (typeof SUBMISSION_WATCHER_ROLES)[number])) {
    return NextResponse.json({ events: [], serverTime: now.toISOString() });
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : new Date(now.getTime() - 60_000);

  const submissions = await prisma.submission.findMany({
    where: { submittedAt: { gt: since }, connection: connectionScopeWhere(session) },
    select: {
      connectionId: true,
      period: true,
      submittedAt: true,
      connection: { select: { clientName: true, department: { select: { name: true } } } },
      records: { select: { kpiDefinition: { select: { cluster: true } } } },
    },
    orderBy: { submittedAt: "asc" },
    take: 20,
  });

  const events: SubmissionNotification[] = submissions.map((s) => {
    const clusters = Array.from(new Set(s.records.map((r) => r.kpiDefinition.cluster).filter(Boolean)));
    const cluster = clusters.length === 1 ? clusters[0] : clusters.length > 1 ? `${clusters.length} areas` : undefined;
    return {
      connectionId: s.connectionId,
      clientName: s.connection.clientName,
      departmentName: s.connection.department.name,
      period: s.period,
      cluster,
      submittedAt: s.submittedAt.toISOString(),
    };
  });

  return NextResponse.json({ events, serverTime: now.toISOString() });
}
