import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Select } from "@/components/ui/input";
import { PeriodNav } from "@/components/period-nav";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate, toDateParam } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { KpiPeriod } from "@/generated/prisma/enums";

// Spreadsheet-style grid of every visible connection's KPI actual/target/
// status, grouped by cluster — mirrors legacy AppVAKPISheet.html /
// getVAKPISheetData(). Admin gets a department picker (defaults to all);
// DM/OM/VA are already scoped by connectionScopeWhere.
export default async function VaKpiSheetPage(
  props: PageProps<"/dashboard/reports/va-kpi-sheet">,
) {
  const searchParams = await props.searchParams;
  const departmentId =
    typeof searchParams.departmentId === "string" && searchParams.departmentId
      ? searchParams.departmentId
      : undefined;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const scope = connectionScopeWhere(session);
  const effectiveScope =
    isAdmin && departmentId ? { ...scope, departmentId } : scope;

  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  const [connections, departments] = await Promise.all([
    prisma.connection.findMany({
      where: effectiveScope,
      include: {
        vaUser: true,
        department: true,
        performanceSummaries: {
          where: {
            OR: [
              { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
              { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
            ],
          },
          include: { kpiDefinition: true },
        },
      },
      orderBy: { clientName: "asc" },
    }),
    isAdmin ? prisma.department.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  // Group by cluster -> ordered list of distinct KPIs seen this period,
  // so the grid's columns match what's actually in play for these
  // connections rather than every KPI in the whole library.
  const clusters = new Map<string, Map<string, string>>(); // cluster -> kpiId -> kpiName
  for (const c of connections) {
    for (const s of c.performanceSummaries) {
      const cluster = s.kpiDefinition.cluster;
      if (!clusters.has(cluster)) clusters.set(cluster, new Map());
      clusters.get(cluster)!.set(s.kpiDefinitionId, s.kpiDefinition.name);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="VA KPI Sheet"
          description="Every connection's KPI actual/target/status for the current period, grouped by cluster."
          className="mb-0"
        />
        <PeriodNav
          anchor={weeklyStart}
          weekStartDay={weekStartDay}
          basePath="/dashboard/reports/va-kpi-sheet"
          params={{ departmentId }}
        />
      </div>

      {connections.length > 0 && clusters.size > 0 && (
        <a
          href={`/api/export/va-kpi-sheet${departmentId ? `?departmentId=${departmentId}` : ""}`}
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      {isAdmin && departments.length > 0 && (
        <form method="GET" className="mb-6 flex gap-2">
          {anchor && <input type="hidden" name="date" value={toDateParam(anchor)} />}
          <Select name="departmentId" defaultValue={departmentId ?? ""} className="w-full max-w-xs">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Filter
          </button>
        </form>
      )}

      {connections.length === 0 || clusters.size === 0 ? (
        <ComingSoon note="No KPI data for the current period yet for connections visible to your account." />
      ) : (
        <div className="max-w-6xl space-y-10">
          {[...clusters.entries()].map(([cluster, kpis]) => {
            const kpiIds = [...kpis.keys()];
            return (
              <div key={cluster}>
                <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
                  {cluster}
                </h2>
                <Table>
                  <TableHead>
                    <tr>
                      <Th>VA / Client</Th>
                      <Th>Department</Th>
                      {kpiIds.map((id) => (
                        <Th key={id}>{kpis.get(id)}</Th>
                      ))}
                    </tr>
                  </TableHead>
                  <tbody>
                    {connections.map((c) => {
                      const byKpi = new Map(
                        c.performanceSummaries
                          .filter((s) => kpiIds.includes(s.kpiDefinitionId))
                          .map((s) => [s.kpiDefinitionId, s]),
                      );
                      if (byKpi.size === 0) return null;
                      return (
                        <Tr key={c.id}>
                          <Td>
                            {c.vaUser.name ?? c.vaUser.email}
                            <div className="text-xs text-muted">{c.clientName}</div>
                          </Td>
                          <Td className="text-muted">{c.department.name}</Td>
                          {kpiIds.map((id) => {
                            const s = byKpi.get(id);
                            return (
                              <Td key={id}>
                                {s ? (
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status={s.status} />
                                    <span className="text-xs text-muted">
                                      {s.actualValue ?? "—"}/{s.targetValue}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </Td>
                            );
                          })}
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
