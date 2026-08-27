import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getConnectionWeekDetail } from "@/app/dashboard/performance/actions";
import { getKpiConfigDetail } from "@/app/dashboard/connections/kpi-config/actions";
import { MyKpiView, type MyKpiCard } from "@/components/my-kpi-view";
import { ConnectionStatus, KpiPeriod } from "@/generated/prisma/enums";

/**
 * "KPI" — new nav entry for VAs (not in legacy), reachable at
 * /dashboard/kpi. Shows a VA their current weekly/monthly targets and
 * actuals (getConnectionWeekDetail — the same call the manager-only
 * drill-down modal on /dashboard/performance uses, so the numbers here are
 * always consistent with what a manager sees), plus a read-only view of
 * each connection's KPI Configuration (getKpiConfigDetail — same grouping
 * the manager-facing editor at /dashboard/connections/kpi-config uses) so a
 * VA can see whether a target is a department default or a per-connection
 * override, without needing manager access to check. Rendering, including
 * the "only show KPIs I use" declutter toggle, lives in the client
 * component (components/my-kpi-view.tsx) so one toggle can filter every
 * connection's config table at once.
 *
 * Restricted to the VA role: every other role's connectionScopeWhere can
 * cover dozens to hundreds of connections (a DM's whole department, an
 * OM's whole team), and this page fetches per-connection detail calls —
 * fine for a VA's handful of connections, not built to scale beyond that.
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
        <PageHeader title="My KPI Config" description="Your current KPI targets and status." />
        <ComingSoon note="No active connections yet — your KPIs will show up here once you have one." />
      </>
    );
  }

  const cards: MyKpiCard[] = await Promise.all(
    connections.map(async (c) => {
      const [weekly, monthly, config] = await Promise.all([
        getConnectionWeekDetail(c.id, weeklyStart.toISOString(), KpiPeriod.WEEKLY),
        getConnectionWeekDetail(c.id, monthlyStart.toISOString(), KpiPeriod.MONTHLY),
        getKpiConfigDetail(c.id),
      ]);
      return {
        connectionId: c.id,
        clientName: c.clientName,
        departmentName: c.department.name,
        weekly,
        monthly,
        configRows: config.rows,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="My KPI Config"
        description="Your current weekly and monthly KPI targets, actuals, and configuration — updated as you submit."
      />
      <MyKpiView cards={cards} />
    </>
  );
}
