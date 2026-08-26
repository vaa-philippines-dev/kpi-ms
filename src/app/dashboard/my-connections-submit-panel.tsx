import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionStatus, KpiPeriod } from "@/generated/prisma/enums";

/**
 * Anyone can end up personally assigned as the VA on a connection, not just
 * VA-role accounts — e.g. a Team Leader (OM) who also personally services a
 * client, synced straight from WFM/CMS with them as vaUserId. Every
 * non-VA dashboard (TeamLeaderOverview, CsOverview, the Admin/DM/OPS_MANAGER
 * overview) renders something scoped to the connections that role manages,
 * but none of them ever surfaced a Submit action for a connection the
 * viewer is personally the VA on — so a hybrid TL had no way to submit
 * their own KPI short of the public /submit form. This panel is dropped
 * into each of those dashboards and renders nothing when the viewer has no
 * connections of their own, so it's a no-op for the common case.
 */
export async function MyConnectionsSubmitPanel({
  userId,
  weeklyStart,
}: {
  userId: string;
  weeklyStart: Date;
}) {
  const connections = await prisma.connection.findMany({
    where: { vaUserId: userId, status: ConnectionStatus.ACTIVE },
    orderBy: { clientName: "asc" },
  });
  if (connections.length === 0) return null;

  const submittedRows = await prisma.performanceSummary.findMany({
    where: {
      connectionId: { in: connections.map((c) => c.id) },
      period: KpiPeriod.WEEKLY,
      periodStart: weeklyStart,
    },
    select: { connectionId: true },
  });
  const submittedIds = new Set(submittedRows.map((s) => s.connectionId));
  const submittedCount = connections.filter((c) => submittedIds.has(c.id)).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Your Own Connections</h2>
        <span className="text-xs text-muted">
          {submittedCount} of {connections.length} submitted this week
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {connections.map((c) => {
          const submitted = submittedIds.has(c.id);
          return (
            <div
              key={c.id}
              className="rounded-xl border border-surface-border bg-surface p-4"
            >
              <p className="font-medium">{c.clientName}</p>
              <p className="mt-1 text-xs text-muted">
                Since {c.createdAt.toLocaleDateString()}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone="success">Active</Badge>
                <div className="flex-1" />
                {submitted ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <CheckCircle2 className="size-3.5" />
                    Submitted
                  </span>
                ) : (
                  <Link href={`/dashboard/submit-kpi?connectionId=${c.id}`}>
                    <Button className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <Send className="size-3.5" />
                      Submit Report
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
