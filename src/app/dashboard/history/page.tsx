import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { getConnectionTrend } from "@/lib/connection-trend";
import { getWeekStartDay } from "@/lib/settings";
import { ConnectionStatusTrend } from "@/components/connection-status-trend";
import { parseAnchorDate } from "@/lib/period";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const DOT_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "bg-success",
  [PerformanceStatus.AT_RISK]: "bg-warning",
  [PerformanceStatus.CRITICAL]: "bg-danger",
  [PerformanceStatus.NO_DATA]: "bg-surface-border",
};

// Twice the old 6-point window — more history to actually spot a slide in,
// now that the chart connects periods with a line instead of isolated dots.
const PERIODS_SHOWN = 10;

/**
 * "History" — new nav entry for VAs (not in legacy), the backward-looking
 * counterpart to /dashboard/kpi (which only shows the current period). A VA
 * previously had no way to tell whether a rough week was a one-off or part
 * of a slide — this surfaces the last several periods per connection as a
 * connected trend line, using lib/connection-trend.ts (the per-connection
 * sibling of lib/trend.ts's system-wide chart).
 *
 * Reads the same global Weekly/Monthly topbar toggle every other trend view
 * in the app does (see components/period-nav.tsx) — this page used to
 * ignore it entirely and always render both weekly and monthly side by
 * side, which also meant the toggle's ◀/▶/date-jump controls did nothing
 * here.
 */
export default async function HistoryPage(props: PageProps<"/dashboard/history">) {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  if (session.role !== "VA") redirect("/dashboard");

  const searchParams = await props.searchParams;
  const selectedPeriod: KpiPeriod =
    searchParams.period === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;
  const isMonthly = selectedPeriod === KpiPeriod.MONTHLY;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

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
      points: await getConnectionTrend(c.id, selectedPeriod, weekStartDay, PERIODS_SHOWN, anchor),
    })),
  );

  return (
    <>
      <PageHeader
        title="History"
        description={`Your ${isMonthly ? "monthly" : "weekly"} status over the last ${PERIODS_SHOWN} periods, per connection. Switch periods with the Weekly / Monthly toggle above.`}
      />
      <div className="space-y-4">
        {cards.map(({ connection, points }) => (
          <div
            key={connection.id}
            className="rounded-xl border border-surface-border bg-surface p-5"
          >
            <h2 className="text-sm font-semibold">{connection.clientName}</h2>
            <p className="mb-4 text-xs text-muted">{connection.department.name}</p>
            <ConnectionStatusTrend points={points} isMonthly={isMonthly} />
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
