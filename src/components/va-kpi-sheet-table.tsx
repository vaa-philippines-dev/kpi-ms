"use client";

import { useMemo, useState } from "react";
import { Th, Td, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type VaKpiSheetCell =
  | { kind: "na" }
  | { kind: "nodata"; target: number }
  | { kind: "data"; actual: number | null; target: number; status: PerformanceStatus };

export type VaKpiSheetRow = {
  connectionId: string;
  vaName: string;
  clientName: string;
  overallStatus: PerformanceStatus;
  cells: Record<string, VaKpiSheetCell>;
};

export type VaKpiSheetCluster = {
  cluster: string;
  kpis: { id: string; name: string }[];
};

const ALL_CLUSTERS = "__all__";

/**
 * The VA KPI Sheet's matrix, split into its own client component so the
 * grid can offer a VA/client search box and a cluster filter without
 * needing a page round-trip. Same fixed KPI-column-per-department grid as
 * before, just quieter: N/A cells (a KPI not applicable to a connection)
 * and cells with no submission yet both render as a plain dash instead of
 * "N/A" text or a loud colored NO_DATA badge — the target is still shown
 * for cells awaiting data, so nothing informative is lost.
 */
export function VaKpiSheetTable({
  rows,
  clusters,
}: {
  rows: VaKpiSheetRow[];
  clusters: VaKpiSheetCluster[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState(ALL_CLUSTERS);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.vaName.toLowerCase().includes(q) || r.clientName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const visibleClusters = useMemo(
    () =>
      selectedCluster === ALL_CLUSTERS
        ? clusters
        : clusters.filter((c) => c.cluster === selectedCluster),
    [clusters, selectedCluster],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search VA or client…"
          className="w-full max-w-xs"
        />
        <Select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="w-full max-w-[220px]"
        >
          <option value={ALL_CLUSTERS}>All clusters</option>
          {clusters.map((c) => (
            <option key={c.cluster} value={c.cluster}>
              {c.cluster}
            </option>
          ))}
        </Select>
      </div>

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
              {visibleClusters.map(({ cluster, kpis }) => (
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
              {visibleClusters.map(({ kpis }) =>
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
            {filteredRows.map((r) => (
              <Tr key={r.connectionId}>
                <Td className="sticky left-0 z-10 w-[200px] min-w-[200px] bg-surface">
                  {r.vaName}
                  <div className="text-xs text-muted">{r.clientName}</div>
                </Td>
                <Td className="sticky left-[200px] z-10 w-[130px] min-w-[130px] bg-surface text-center">
                  <StatusBadge status={r.overallStatus} />
                </Td>
                {visibleClusters.map(({ kpis }) =>
                  kpis.map((kpi, ki) => {
                    const cell = r.cells[kpi.id];
                    const startCls = ki === 0 ? "border-l border-surface-border" : "";
                    if (!cell || cell.kind === "na") {
                      return (
                        <Td key={kpi.id} className={`text-center text-muted ${startCls}`}>
                          —
                        </Td>
                      );
                    }
                    if (cell.kind === "nodata") {
                      return (
                        <Td key={kpi.id} className={`text-center text-muted ${startCls}`}>
                          {cell.target} · —
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

      {filteredRows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No VA or client matches “{search}”.
        </p>
      )}
    </div>
  );
}
