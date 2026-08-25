import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { ClientKpiTrendChart } from "@/components/client-kpi-trend-chart";
import { PerformanceHistoryCalendar } from "@/components/performance-history-calendar";
import { ConnectionCombobox } from "@/components/connection-combobox";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { CONNECTION_STATUS_LABELS } from "@/lib/connection-labels";

// Single-connection drill-down: performance history over time, status
// history, and interventions logged — mirrors legacy getClientDetail() /
// getClientPerformanceTrend().
export default async function ClientDetailPage(
  props: PageProps<"/dashboard/reports/client-detail">,
) {
  const searchParams = await props.searchParams;
  const connectionId =
    typeof searchParams.connectionId === "string"
      ? searchParams.connectionId
      : undefined;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: { vaUser: true, department: true },
    orderBy: { clientName: "asc" },
  });

  const departments = Array.from(
    new Map(connections.map((c) => [c.departmentId, c.department.name])).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const connectionOptions = connections.map((c) => ({
    id: c.id,
    clientName: c.clientName,
    vaLabel: c.vaUser.name ?? c.vaUser.email,
    departmentId: c.departmentId,
    departmentName: c.department.name,
  }));

  const connection = connectionId
    ? await prisma.connection.findFirst({
        where: { id: connectionId, ...scope },
        include: {
          vaUser: true,
          department: true,
          statusEvents: { orderBy: { changedAt: "desc" }, include: { changedBy: true } },
          performanceSummaries: {
            orderBy: { periodStart: "desc" },
            include: { kpiDefinition: true },
          },
          interventions: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
        },
      })
    : null;

  const trendsByKpi = new Map<
    string,
    { id: string; name: string; points: { periodStart: Date; pct: number }[] }
  >();
  if (connection) {
    for (const s of connection.performanceSummaries) {
      if (s.pct === null) continue;
      const key = s.kpiDefinitionId;
      if (!trendsByKpi.has(key)) {
        trendsByKpi.set(key, { id: key, name: s.kpiDefinition.name, points: [] });
      }
      trendsByKpi.get(key)!.points.push({ periodStart: s.periodStart, pct: s.pct });
    }
    for (const trend of trendsByKpi.values()) {
      trend.points.sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
    }
  }

  return (
    <>
      <PageHeader
        title="Client Detail"
        description="Performance history, status history, and interventions for one connection."
      />

      <div className="max-w-4xl space-y-8">
        <ConnectionCombobox
          options={connectionOptions}
          departments={departments}
          selectedId={connectionId}
        />

        {!connection ? (
          <ComingSoon note="Choose a connection above to see its detail." />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-surface-border p-5">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">VA</p>
                  <p className="text-lg font-semibold">
                    {connection.vaUser.name ?? connection.vaUser.email}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                    Client
                  </p>
                  <p className="text-lg font-semibold">{connection.clientName}</p>
                </div>
                <div className="self-end">
                  <p className="text-xs text-muted">
                    {connection.department.name} · {CONNECTION_STATUS_LABELS[connection.status]}
                  </p>
                </div>
              </div>

              <a
                href={`/api/export/client-detail?connectionId=${connection.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border px-3 py-2 text-sm font-medium transition hover:bg-surface-hover"
              >
                <Download className="size-4" />
                Export CSV
              </a>
            </div>

            {trendsByKpi.size > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                  Performance trend (% of target)
                </h3>
                <ClientKpiTrendChart series={[...trendsByKpi.values()]} />
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                Performance history
              </h3>
              {connection.performanceSummaries.length === 0 ? (
                <p className="text-sm text-muted">No submissions recorded yet.</p>
              ) : (
                <PerformanceHistoryCalendar
                  entries={connection.performanceSummaries.map((s) => ({
                    id: s.id,
                    kpiName: s.kpiDefinition.name,
                    period: s.period,
                    periodStart: s.periodStart,
                    actualValue: s.actualValue,
                    targetValue: s.targetValue,
                    status: s.status,
                  }))}
                />
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                Status history
              </h3>
              {connection.statusEvents.length === 0 ? (
                <p className="text-sm text-muted">No status changes recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {connection.statusEvents.map((e) => (
                    <li key={e.id} className="text-muted">
                      {CONNECTION_STATUS_LABELS[e.status]} — {e.changedAt.toLocaleString()} by{" "}
                      {e.changedBy.name ?? e.changedBy.email}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                Interventions
              </h3>
              {connection.interventions.length === 0 ? (
                <p className="text-sm text-muted">No interventions logged yet.</p>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Type</Th>
                      <Th>Description</Th>
                      <Th>Outcome</Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {connection.interventions.map((iv) => (
                      <Tr key={iv.id}>
                        <Td className="text-muted">{iv.createdAt.toLocaleDateString()}</Td>
                        <Td>{iv.type}</Td>
                        <Td className="text-muted">{iv.description}</Td>
                        <Td className="text-muted">{iv.outcome ?? "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
