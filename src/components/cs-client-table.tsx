"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import type { CustomerStatus, PerformanceStatus } from "@/generated/prisma/enums";

export type CsClientRow = {
  id: string;
  clientName: string;
  assignmentCode: string;
  status: CustomerStatus;
  cmsStatus: string;
  liveConnections: number;
  vaNames: string;
  performance: PerformanceStatus;
};

const COLUMNS: DataTableColumn<CsClientRow>[] = [
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    defaultValue: "ACTIVE",
    filterOptions: [
      { value: "ACTIVE", label: "Active" },
      { value: "INACTIVE", label: "Inactive" },
    ],
    render: (v, row) => (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={v === "ACTIVE" ? "success" : "neutral"}>{v === "ACTIVE" ? "Active" : "Inactive"}</Badge>
        {/* KPI is the source of truth for status — flag where the CMS disagrees. */}
        {v === "INACTIVE" && row.cmsStatus === "Active" && (
          <span className="text-xs text-warning" title="The CMS still lists this client as Active, but none of its KPI connections are live.">
            CMS: Active
          </span>
        )}
      </span>
    ),
  },
  { key: "liveConnections", label: "Live VAs", sortable: true, className: "tabular-nums" },
  { key: "vaNames", label: "VAs", filterable: true, className: "text-muted" },
  {
    key: "performance",
    label: "This Week",
    sortable: true,
    filterable: "select",
    filterOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    searchText: (row) => STATUS_LABEL[row.performance],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  { key: "assignmentCode", label: "CS-Client ID", sortable: true, filterable: true, className: "font-mono text-xs text-muted" },
];

/** A CS Specialist's own client book — one row per CsClientAssignment. */
export function CsClientTable({ rows }: { rows: CsClientRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(r) => r.id}
      defaultLimit={25}
      defaultSort={{ key: "clientName", dir: "asc" }}
      emptyMessage="No clients assigned to you in the CMS yet."
    />
  );
}
