import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Sparkline } from "@/components/sparkline";
import { Select } from "@/components/ui/input";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { ConnectionStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  END_OF_CONTRACT: "End of Contract",
  END_OF_PROJECT: "End of Project",
  PENDING: "Pending",
};

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
    include: { vaUser: true },
    orderBy: { clientName: "asc" },
  });

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
    { name: string; points: { periodStart: Date; pct: number }[] }
  >();
  if (connection) {
    for (const s of connection.performanceSummaries) {
      if (s.pct === null) continue;
      const key = s.kpiDefinitionId;
      if (!trendsByKpi.has(key)) {
        trendsByKpi.set(key, { name: s.kpiDefinition.name, points: [] });
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
        <form method="GET" className="flex gap-2">
          <Select name="connectionId" defaultValue={connectionId ?? ""} className="w-full">
            <option value="" disabled>
              Choose a connection
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.vaUser.name ?? c.vaUser.email)} · {c.clientName}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            View
          </button>
        </form>

        {!connection ? (
          <ComingSoon note="Choose a connection above to see its detail." />
        ) : (
          <>
            <a
              href={`/api/export/client-detail?connectionId=${connection.id}`}
              className="inline-block text-xs text-accent hover:underline"
            >
              Export CSV →
            </a>

            <div className="rounded-xl border border-surface-border p-5">
              <h2 className="text-lg font-semibold">
                {connection.vaUser.name ?? connection.vaUser.email} · {connection.clientName}
              </h2>
              <p className="text-xs text-muted">
                {connection.department.name} · {STATUS_LABELS[connection.status]}
              </p>
            </div>

            {trendsByKpi.size > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                  Performance trend (% of target)
                </h3>
                <div className="flex flex-wrap gap-6">
                  {[...trendsByKpi.entries()].map(([kpiId, trend]) => (
                    <div key={kpiId}>
                      <p className="mb-1 text-xs text-muted">{trend.name}</p>
                      <Sparkline values={trend.points.map((p) => p.pct)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase">
                Performance history
              </h3>
              {connection.performanceSummaries.length === 0 ? (
                <p className="text-sm text-muted">No submissions recorded yet.</p>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <Th>Period</Th>
                      <Th>KPI</Th>
                      <Th>Actual</Th>
                      <Th>Target</Th>
                      <Th>Status</Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {connection.performanceSummaries.map((s) => (
                      <Tr key={s.id}>
                        <Td className="text-muted">
                          {s.period} · {s.periodStart.toLocaleDateString()}
                        </Td>
                        <Td>{s.kpiDefinition.name}</Td>
                        <Td className="text-muted">{s.actualValue ?? "—"}</Td>
                        <Td className="text-muted">{s.targetValue}</Td>
                        <Td>
                          <StatusBadge status={s.status} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
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
                      {STATUS_LABELS[e.status]} — {e.changedAt.toLocaleString()} by{" "}
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
        <Link
          href="/dashboard/reports/customer-overview"
          className="block text-xs text-muted hover:underline"
        >
          ← Back to Customer Overview
        </Link>
      </div>
    </>
  );
}
