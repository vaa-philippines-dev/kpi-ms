import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { PeriodNav } from "@/components/period-nav";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { KpiPeriod } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

export default async function PerformancePage(
  props: PageProps<"/dashboard/performance">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  const summaries = await prisma.performanceSummary.findMany({
    where: {
      connection: scope,
      OR: [
        { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
        { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
      ],
    },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    include: {
      connection: { include: { department: true, vaUser: true } },
      kpiDefinition: true,
    },
  });

  // Grouped by KPI cluster — mirrors the legacy "KPI Performance Breakdown"
  // report, which is organized by cluster within department.
  const byCluster = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const cluster = s.kpiDefinition.cluster;
    if (!byCluster.has(cluster)) byCluster.set(cluster, []);
    byCluster.get(cluster)!.push(s);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Performance"
          description="Actual vs. target per connection, grouped by KPI cluster, for the current week/month."
          className="mb-0"
        />
        <PeriodNav
          anchor={weeklyStart}
          weekStartDay={weekStartDay}
          basePath="/dashboard/performance"
        />
      </div>

      {summaries.length > 0 && (
        <a
          href="/api/export/performance"
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      {summaries.length === 0 ? (
        <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
      ) : (
        <div className="max-w-5xl space-y-10">
          {[...byCluster.entries()].map(([cluster, rows]) => (
            <div key={cluster}>
              <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
                {cluster}
              </h2>
              <Table>
                <TableHead>
                  <tr>
                    <Th>Status</Th>
                    <Th>VA / Client</Th>
                    <Th>Department</Th>
                    <Th>KPI</Th>
                    <Th>Period</Th>
                    <Th>Actual</Th>
                    <Th>Target</Th>
                    <Th>%</Th>
                  </tr>
                </TableHead>
                <tbody>
                  {rows.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <StatusBadge status={s.status} />
                      </Td>
                      <Td>
                        {s.connection.vaUser.name ?? s.connection.vaUser.email}
                        <div className="text-xs text-muted">
                          {s.connection.clientName}
                        </div>
                      </Td>
                      <Td className="text-muted">{s.connection.department.name}</Td>
                      <Td>{s.kpiDefinition.name}</Td>
                      <Td className="text-muted">{s.period}</Td>
                      <Td className="text-muted">{s.actualValue ?? "—"}</Td>
                      <Td className="text-muted">{s.targetValue}</Td>
                      <Td className="text-muted">
                        {s.pct !== null ? `${s.pct.toFixed(1)}%` : "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
