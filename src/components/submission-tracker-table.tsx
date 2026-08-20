"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type SubmissionTrackerRow = {
  connectionId: string;
  vaName: string;
  clientName: string;
  departmentName: string;
  weeklyStatus: PerformanceStatus | null;
  weeklyStatusLabel: string;
  monthlyStatus: PerformanceStatus | null;
  monthlyStatusLabel: string;
};

function statusCell(status: PerformanceStatus | null) {
  return status ? (
    <StatusBadge status={status} />
  ) : (
    <Badge tone="warning">Pending</Badge>
  );
}

const columns: DataTableColumn<SubmissionTrackerRow>[] = [
  { key: "vaName", label: "Virtual Assistant", sortable: true, filterable: true },
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "weeklyStatusLabel",
    label: "Weekly",
    sortable: true,
    filterable: "select",
    render: (_v, row) => statusCell(row.weeklyStatus),
  },
  {
    key: "monthlyStatusLabel",
    label: "Monthly",
    sortable: true,
    filterable: "select",
    render: (_v, row) => statusCell(row.monthlyStatus),
  },
];

/**
 * "VA Submission Detail" — the current-period submitted-vs-pending grid,
 * over the app's standard sortable/filterable DataTable. Mirrors legacy's
 * DataTable of the same name in AppSubmissions.html (`_subRenderTable`),
 * simplified from its 4 separate dept/service/team/status dropdowns down to
 * this component's built-in per-column filters (department + each status
 * column), since the underlying rows are already scoped server-side by
 * role.
 */
export function SubmissionTrackerTable({ rows }: { rows: SubmissionTrackerRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.connectionId}
      defaultLimit={25}
      emptyMessage="No connections match the current filters."
    />
  );
}
