import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Select } from "@/components/ui/input";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate, toDateParam } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

type KpiCell =
  | { kind: "na" }
  | { kind: "nodata"; target: number }
  | { kind: "data"; actual: number | null; target: number; status: PerformanceStatus };

// Spreadsheet-style matrix: one row per connection, one column per KPI
// (grouped under cluster group-header cells), mirrors legacy
// AppVAKPISheet.html / getVAKPISheetData(). KPI columns are department-
// specific, so — as in legacy — Admin must pick exactly one department
// (defaulting to the first alphabetically); DM/OM/VA are already scoped to
// a single department's worth of connections by connectionScopeWhere.
export default async function VaKpiSheetPage(
  props: PageProps<"/dashboard/reports/va-kpi-sheet">,
) {
  const searchParams = await props.searchParams;
  const requestedDepartmentId =
    typeof searchParams.departmentId === "string" && searchParams.departmentId
      ? searchParams.departmentId
      : undefined;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const scope = connectionScopeWhere(session);

  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

  const departments = isAdmin
    ? await prisma.department.findMany({ orderBy: { name: "asc" } })
    : [];

  if (isAdmin && departments.length === 0) {
    return (
      <>
        <PageHeader title="VA KPI Sheet" description="No departments are configured yet." />
        <ComingSoon note="Set up a department before this report can show any data." />
      </>
    );
  }

  const selectedDepartmentId = isAdmin
    ? requestedDepartmentId && departments.some((d) => d.id === requestedDepartmentId)
      ? requestedDepartmentId
      : departments[0].id
    : undefined;

  // KPI columns are department-specific, so Admin is pinned to one
  // department at a time (like legacy); DM/OM/VA are already scoped.
  const effectiveScope = isAdmin ? { departmentId: selectedDepartmentId } : scope;

  const connections = await prisma.connection.findMany({
    where: effectiveScope,
    include: {
      vaUser: true,
      kpiConfigs: true,
      performanceSummaries: {
        where: {
          OR: [
            { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
            { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
          ],
        },
      },
    },
    orderBy: [{ vaUser: { name: "asc" } }, { clientName: "asc" }],
  });

  // Full set of KPIs for whichever department(s) are actually represented
  // among the in-scope connections — not just the ones with a submission
  // this period — so the grid shows "No Data" instead of silently omitting
  // a column/row that simply hasn't reported yet.
  const departmentIds = isAdmin
    ? [selectedDepartmentId!]
    : [...new Set(connections.map((c) => c.departmentId))];

  const kpiDefinitions = departmentIds.length
    ? await prisma.kpiDefinition.findMany({
        where: { departmentId: { in: departmentIds } },
        orderBy: [{ cluster: "asc" }, { name: "asc" }],
      })
    : [];

  const clusterMap = new Map<string, typeof kpiDefinitions>();
  for (const kpi of kpiDefinitions) {
    const list = clusterMap.get(kpi.cluster);
    if (list) list.push(kpi);
    else clusterMap.set(kpi.cluster, [kpi]);
  }
  const clusters = [...clusterMap.entries()].map(([cluster, kpis]) => ({ cluster, kpis }));

  const rows = connections.map((c) => {
    const summaryByKpi = new Map(c.performanceSummaries.map((s) => [s.kpiDefinitionId, s]));
    const configByKpi = new Map(c.kpiConfigs.map((cfg) => [cfg.kpiDefinitionId, cfg]));
    const cells = new Map<string, KpiCell>();
    for (const kpi of kpiDefinitions) {
      // A KPI only applies to connections in its own department — with
      // Admin pinned to one department this is always true there, but
      // DM/OM/VA scopes can still mix in a connection from another
      // department (e.g. an OM's own client connection).
      if (kpi.departmentId !== c.departmentId) {
        cells.set(kpi.id, { kind: "na" });
        continue;
      }
      const cfg = configByKpi.get(kpi.id);
      if (cfg && !cfg.isApplicable) {
        cells.set(kpi.id, { kind: "na" });
        continue;
      }
      const s = summaryByKpi.get(kpi.id);
      if (!s) {
        cells.set(kpi.id, { kind: "nodata", target: cfg?.targetValue ?? kpi.targetValue });
        continue;
      }
      cells.set(kpi.id, { kind: "data", actual: s.actualValue, target: s.targetValue, status: s.status });
    }
    return {
      connectionId: c.id,
      vaName: c.vaUser.name ?? c.vaUser.email,
      clientName: c.clientName,
      overallStatus: rollupStatus(c.performanceSummaries.map((s) => s.status)),
      cells,
    };
  });

  const totalKpis = kpiDefinitions.length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="VA KPI Sheet"
          description="Every connection's KPI actual/target/status for the current period, grouped by cluster."
          className="mb-0"
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {isAdmin && (
          <form method="GET" className="flex gap-2">
            {anchor && <input type="hidden" name="date" value={toDateParam(anchor)} />}
            <Select name="departmentId" defaultValue={selectedDepartmentId} className="w-full min-w-[200px]">
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
        {rows.length > 0 && clusters.length > 0 && (
          <a
            href={`/api/export/va-kpi-sheet${selectedDepartmentId ? `?departmentId=${selectedDepartmentId}` : ""}`}
            className="text-xs text-accent hover:underline"
          >
            Export CSV →
          </a>
        )}
      </div>

      {rows.length === 0 || clusters.length === 0 ? (
        <ComingSoon note="No active VA connections or configured KPIs found for your account." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {rows.length} connection{rows.length !== 1 ? "s" : ""} · {totalKpis} KPI
            {totalKpis !== 1 ? "s" : ""} across {clusters.length} cluster{clusters.length !== 1 ? "s" : ""}
          </p>
          <div className="overflow-auto rounded-xl border border-surface-border bg-surface">
            <table className="text-sm">
              <thead className="text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <Th rowSpan={2} className="sticky left-0 z-20 w-[200px] min-w-[200px] bg-surface">
                    VA / Client
                  </Th>
                  <Th
                    rowSpan={2}
                    className="sticky left-[200px] z-20 w-[130px] min-w-[130px] bg-surface text-center"
                  >
                    Overall Status
                  </Th>
                  {clusters.map(({ cluster, kpis }) => (
                    <Th
                      key={cluster}
                      colSpan={kpis.length}
                      className="border-l border-surface-border text-center"
                    >
                      {cluster}
                    </Th>
                  ))}
                </tr>
                <tr>
                  {clusters.map(({ kpis }) =>
                    kpis.map((kpi, ki) => (
                      <Th
                        key={kpi.id}
                        className={`whitespace-nowrap ${ki === 0 ? "border-l border-surface-border" : ""}`}
                      >
                        {kpi.name}
                      </Th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.connectionId}>
                    <Td className="sticky left-0 z-10 w-[200px] min-w-[200px] bg-surface">
                      {r.vaName}
                      <div className="text-xs text-muted">{r.clientName}</div>
                    </Td>
                    <Td className="sticky left-[200px] z-10 w-[130px] min-w-[130px] bg-surface text-center">
                      <StatusBadge status={r.overallStatus} />
                    </Td>
                    {clusters.map(({ kpis }) =>
                      kpis.map((kpi, ki) => {
                        const cell = r.cells.get(kpi.id);
                        const startCls = ki === 0 ? "border-l border-surface-border" : "";
                        if (!cell || cell.kind === "na") {
                          return (
                            <Td key={kpi.id} className={`text-center text-xs text-muted ${startCls}`}>
                              N/A
                            </Td>
                          );
                        }
                        if (cell.kind === "nodata") {
                          return (
                            <Td key={kpi.id} className={startCls}>
                              <div className="text-xs text-muted">Target: {cell.target}</div>
                              <StatusBadge status={PerformanceStatus.NO_DATA} />
                            </Td>
                          );
                        }
                        return (
                          <Td key={kpi.id} className={startCls}>
                            <div className="text-xs font-semibold">
                              {cell.actual ?? "—"}
                              <span className="ml-1 font-normal text-muted">/ {cell.target}</span>
                            </div>
                            <StatusBadge status={cell.status} />
                          </Td>
                        );
                      }),
                    )}
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
