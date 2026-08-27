import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ComingSoon } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HistorySummaryCard } from "@/components/history-summary-card";
import { getConnectionTrend } from "@/lib/connection-trend";
import { ConnectionStatus, KpiPeriod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// Teaser window for the dashboard's History summary — shorter than the real
// History page's 10-period view (lib/connection-trend.ts's caller there),
// since this is meant to be glanced at, not read in full before the click
// through to /dashboard/history.
const HISTORY_TEASER_PERIODS = 8;

/**
 * VA's own dashboard content — mirrors legacy's renderVADashboard()
 * (AppDashboards.html): Total/Active/Pending stat cards, a submission
 * summary for the selected week, a card grid of active connections each
 * showing Submitted or a Submit Report action, and a separate Pending
 * Connections section. Legacy built its own inline submission modal here;
 * this links to /dashboard/submit-kpi with the connection already resolved,
 * so a signed-in VA never has to paste their own connection's code back in.
 */
export async function VaOverview({
  scope,
  weeklyStart,
  weekStartDay,
}: {
  scope: Prisma.ConnectionWhereInput;
  weeklyStart: Date;
  weekStartDay: number;
}) {
  const connections = await prisma.connection.findMany({
    where: scope,
    orderBy: { clientName: "asc" },
  });

  if (connections.length === 0) {
    return <ComingSoon note="No connections assigned to your account yet." />;
  }

  const activeConns = connections.filter((c) => c.status === ConnectionStatus.ACTIVE);
  const pendingConns = connections.filter((c) => c.status === ConnectionStatus.PENDING);

  // PerformanceSummary, not Submission — see lib/submission-trend.ts: legacy
  // bulk imports write straight into PerformanceSummary and never create a
  // Submission row, so this badge would undercount every connection whose
  // current-week data came from the import rather than a live submit.
  const submittedRows = await prisma.performanceSummary.findMany({
    where: {
      connectionId: { in: activeConns.map((c) => c.id) },
      period: KpiPeriod.WEEKLY,
      periodStart: weeklyStart,
    },
    select: { connectionId: true },
  });
  const submittedIds = new Set(submittedRows.map((s) => s.connectionId));
  const submittedCount = activeConns.filter((c) => submittedIds.has(c.id)).length;

  const historyPreview = await Promise.all(
    activeConns.map(async (c) => ({
      connectionId: c.id,
      clientName: c.clientName,
      points: await getConnectionTrend(c.id, KpiPeriod.WEEKLY, weekStartDay, HISTORY_TEASER_PERIODS),
    })),
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{connections.length}</div>
          <div className="mt-1 text-sm text-muted">Total Connections</div>
        </div>
        <div className="rounded-xl border border-success/30 bg-surface p-4 text-success">
          <div className="text-3xl font-semibold">{activeConns.length}</div>
          <div className="mt-1 text-sm">Active</div>
        </div>
        <div className="rounded-xl border border-warning/30 bg-surface p-4 text-warning">
          <div className="text-3xl font-semibold">{pendingConns.length}</div>
          <div className="mt-1 text-sm">Pending</div>
        </div>
      </div>

      {historyPreview.length > 0 && (
        <HistorySummaryCard cards={historyPreview} periodsLabel={`last ${HISTORY_TEASER_PERIODS} weeks`} />
      )}

      {activeConns.length > 0 && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Active Connections</h2>
            <span className="text-xs text-muted">
              {submittedCount} of {activeConns.length} submitted this week
            </span>
            {submittedCount === activeConns.length ? (
              <Badge tone="success">All done ✓</Badge>
            ) : (
              <Badge tone="warning">{activeConns.length - submittedCount} pending</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeConns.map((c) => {
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
      )}

      {pendingConns.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">Pending Connections</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingConns.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-surface-border bg-surface p-4"
              >
                <div>
                  <p className="text-sm font-medium">{c.clientName}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Since {c.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <Badge tone="warning">Pending</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
