import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { getConnectionTrend, type ConnectionTrendPoint } from "@/lib/connection-trend";
import { getWeekStartDay } from "@/lib/settings";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const DOT_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "bg-success",
  [PerformanceStatus.AT_RISK]: "bg-warning",
  [PerformanceStatus.CRITICAL]: "bg-danger",
  [PerformanceStatus.NO_DATA]: "bg-surface-border",
};

const STATUS_TITLE: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.NO_DATA]: "No Data",
};

function TrendRow({
  label,
  points,
  isMonthly,
}: {
  label: string;
  points: ConnectionTrendPoint[];
  isMonthly: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted uppercase">{label}</p>
      <div className="flex items-end gap-2.5">
        {points.map((p) => {
          const dateLabel = isMonthly
            ? p.periodStart.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
            : p.periodStart.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              });
          return (
            <div
              key={p.periodStart.toISOString()}
              className="flex flex-col items-center gap-1.5"
              title={p.status ? STATUS_TITLE[p.status] : "Not submitted"}
            >
              <span
                className={`size-3 rounded-full ${
                  p.status ? DOT_CLASS[p.status] : "border border-dashed border-surface-border"
                }`}
              />
              <span className="text-[10px] whitespace-nowrap text-muted">{dateLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "History" — new nav entry for VAs (not in legacy), the backward-looking
 * counterpart to /dashboard/kpi (which only shows the current period). A VA
 * previously had no way to tell whether a rough week was a one-off or part
 * of a slide — this surfaces the last 6 weekly and monthly periods per
 * connection as a compact dot trend, using lib/connection-trend.ts (the
 * per-connection sibling of lib/trend.ts's system-wide chart).
 */
export default async function HistoryPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  if (session.role !== "VA") redirect("/dashboard");

  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();

  const connections = await prisma.connection.findMany({
    where: { ...scope, status: ConnectionStatus.ACTIVE },
    include: { department: true },
    orderBy: { clientName: "asc" },
  });

  if (connections.length === 0) {
    return (
      <>
        <PageHeader title="History" description="Your status trend over time." />
        <ComingSoon note="No active connections yet — your history will show up here once you have one." />
      </>
    );
  }

  const cards = await Promise.all(
    connections.map(async (c) => ({
      connection: c,
      weekly: await getConnectionTrend(c.id, KpiPeriod.WEEKLY, weekStartDay, 6),
      monthly: await getConnectionTrend(c.id, KpiPeriod.MONTHLY, weekStartDay, 6),
    })),
  );

  return (
    <>
      <PageHeader
        title="History"
        description="Your status over the last 6 weeks and months, per connection."
      />
      <div className="space-y-4">
        {cards.map(({ connection, weekly, monthly }) => (
          <div
            key={connection.id}
            className="rounded-xl border border-surface-border bg-surface p-5"
          >
            <h2 className="text-sm font-semibold">{connection.clientName}</h2>
            <p className="mb-4 text-xs text-muted">{connection.department.name}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <TrendRow label="Weekly" points={weekly} isMonthly={false} />
              <TrendRow label="Monthly" points={monthly} isMonthly />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted">
        {(
          [
            [PerformanceStatus.ON_TARGET, "On Target"],
            [PerformanceStatus.AT_RISK, "At Risk"],
            [PerformanceStatus.CRITICAL, "Critical"],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${DOT_CLASS[status]}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-dashed border-surface-border" />
          Not submitted
        </span>
      </div>
    </>
  );
}
