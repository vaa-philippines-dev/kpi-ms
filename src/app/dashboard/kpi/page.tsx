import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getConnectionWeekDetail, type ConnectionWeekDetail } from "@/app/dashboard/performance/actions";
import { ConnectionStatus, KpiPeriod, KpiDirection } from "@/generated/prisma/enums";

function DirIndicator({ direction }: { direction: KpiDirection }) {
  return direction === KpiDirection.LOWER_IS_BETTER ? (
    <ArrowDown className="size-3.5 text-warning" aria-label="Lower is better" />
  ) : (
    <ArrowUp className="size-3.5 text-success" aria-label="Higher is better" />
  );
}

function KpiTable({ label, detail }: { label: string; detail: ConnectionWeekDetail }) {
  if (detail.kpiRows.length === 0) return null;

  // hasSubmission now means EVERY applicable KPI has been submitted this
  // period, not just some — a connection's KPIs are usually submitted one
  // cluster at a time (e.g. "Tiktok Shop", "Instagram"), so a single
  // connection-wide flag used to falsely mark every other not-yet-submitted
  // cluster as done the moment any one cluster was submitted. The table is
  // always shown now (per-row `submitted` distinguishes "not submitted yet"
  // from a real, explicitly-marked "No Data"); the warning just calls out
  // how many rows are still outstanding.
  const pending = detail.kpiRows.filter((r) => !r.submitted).length;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold text-muted uppercase">{label}</h3>
      {pending > 0 && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {pending === detail.kpiRows.length
            ? "Not submitted yet for this period."
            : `${pending} of ${detail.kpiRows.length} KPIs still need to be submitted for this period.`}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover/60 text-xs text-muted uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">KPI</th>
              <th className="px-3 py-2 text-left font-medium">Target</th>
              <th className="px-3 py-2 text-left font-medium">Actual</th>
              <th className="px-3 py-2 text-center font-medium">Dir</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.kpiRows.map((r) => (
              <tr key={r.kpiDefinitionId} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted">
                  {r.targetValue}
                  {r.unit ? ` ${r.unit}` : ""}
                </td>
                <td className="px-3 py-2 text-muted">{r.actualValue ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <DirIndicator direction={r.direction} />
                </td>
                <td className="px-3 py-2">
                  {r.submitted ? (
                    <StatusBadge status={r.status} />
                  ) : (
                    <span className="text-xs text-muted">Not submitted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "KPI" — new nav entry for VAs (not in legacy), reachable at
 * /dashboard/kpi. Previously a VA had no way to check their own current
 * KPI targets/actuals between submissions — the only KPI detail view in
 * the app (the drill-down modal on /dashboard/performance) was manager-
 * only. Reuses the exact same getConnectionWeekDetail the modal calls, so
 * a VA's own numbers here are always consistent with what their manager
 * sees for the same connection/period.
 *
 * Restricted to the VA role: every other role's connectionScopeWhere can
 * cover dozens to hundreds of connections (a DM's whole department, an
 * OM's whole team), and this page fetches one detail call per connection
 * per period — fine for a VA's handful of connections, not built to scale
 * beyond that.
 */
export default async function MyKpiPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  if (session.role !== "VA") redirect("/dashboard");

  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, new Date(), weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, new Date());

  const connections = await prisma.connection.findMany({
    where: { ...scope, status: ConnectionStatus.ACTIVE },
    include: { department: true },
    orderBy: { clientName: "asc" },
  });

  if (connections.length === 0) {
    return (
      <>
        <PageHeader title="KPI" description="Your current KPI targets and status." />
        <ComingSoon note="No active connections yet — your KPIs will show up here once you have one." />
      </>
    );
  }

  const cards = await Promise.all(
    connections.map(async (c) => ({
      connection: c,
      weekly: await getConnectionWeekDetail(c.id, weeklyStart.toISOString(), KpiPeriod.WEEKLY),
      monthly: await getConnectionWeekDetail(c.id, monthlyStart.toISOString(), KpiPeriod.MONTHLY),
    })),
  );

  return (
    <>
      <PageHeader
        title="KPI"
        description="Your current weekly and monthly KPI targets, actuals, and status — updated as you submit."
      />
      <div className="space-y-4">
        {cards.map(({ connection, weekly, monthly }) => {
          const needsWeeklySubmit = weekly.kpiRows.length > 0 && !weekly.hasSubmission;
          return (
            <div
              key={connection.id}
              className="rounded-xl border border-surface-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{connection.clientName}</h2>
                  <p className="text-xs text-muted">{connection.department.name}</p>
                </div>
                {needsWeeklySubmit && (
                  <Link href={`/dashboard/submit-kpi?connectionId=${connection.id}`}>
                    <span className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
                      <Send className="size-3.5" />
                      Submit KPI
                    </span>
                  </Link>
                )}
              </div>

              <KpiTable label="This Week" detail={weekly} />
              <KpiTable label="This Month" detail={monthly} />

              {weekly.kpiRows.length === 0 && monthly.kpiRows.length === 0 && (
                <p className="mt-3 text-xs text-muted">
                  No KPIs are configured for {connection.department.name} yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
