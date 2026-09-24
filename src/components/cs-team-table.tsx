"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export type CsTeamRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  activeClients: number;
  totalClients: number;
  liveConnections: number;
  pendingRequests: number;
  onTarget: number;
  atRisk: number;
  critical: number;
  noData: number;
};

/** Cell renderer for a count column — colored only when non-zero. */
function num(tone?: string) {
  return function CountCell(v: unknown) {
    return <span className={`tabular-nums ${Number(v) > 0 && tone ? tone : ""}`}>{String(v)}</span>;
  };
}

const COLUMNS: DataTableColumn<CsTeamRow>[] = [
  {
    key: "name",
    label: "Specialist",
    sortable: true,
    filterable: true,
    searchText: (r) => `${r.name} ${r.email}`,
    render: (v, r) => (
      <div>
        <div className="flex items-center gap-1.5 font-medium">
          {String(v)}
          {!r.isActive && <Badge>Inactive</Badge>}
        </div>
        <div className="text-xs text-muted">{r.email}</div>
      </div>
    ),
  },
  {
    key: "activeClients",
    label: "Active Clients",
    sortable: true,
    render: (v, r) => (
      <span className="tabular-nums">
        {String(v)} <span className="text-xs text-muted">/ {r.totalClients}</span>
      </span>
    ),
  },
  { key: "liveConnections", label: "Live VAs", sortable: true, render: num() },
  { key: "pendingRequests", label: "Pending Requests", sortable: true, render: num("font-semibold text-accent") },
  { key: "onTarget", label: "On Target", sortable: true, render: num("text-success") },
  { key: "atRisk", label: "At Risk", sortable: true, render: num("text-warning") },
  { key: "critical", label: "Critical", sortable: true, render: num("font-semibold text-danger") },
  { key: "noData", label: "No Data", sortable: true, render: num("text-muted") },
];

/** CS Manager's per-specialist breakdown — one row per CS on the team. */
export function CsTeamTable({ rows }: { rows: CsTeamRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(r) => r.id}
      defaultLimit={25}
      defaultSort={{ key: "liveConnections", dir: "desc" }}
      emptyMessage="No CS Specialists yet — run Sync CS Specialists & Clients in Settings."
    />
  );
}
