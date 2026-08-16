"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { ConnectionKpiModal, type ConnectionKpiRow } from "@/components/connection-kpi-modal";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type CsStatusRow = {
  id: string;
  clientName: string;
  vaName: string;
  status: PerformanceStatus;
  kpiRows: ConnectionKpiRow[];
};

const COLUMNS: DataTableColumn<CsStatusRow>[] = [
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    filterOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    searchText: (row) => STATUS_LABEL[row.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
];

/**
 * System-wide connection status table with a click-to-open KPI detail
 * modal — mirrors legacy's CS Specialist dashboard (`renderCSDashboard()` /
 * `renderPerfStatusTable()` in AppDashboards.html), rendered through the
 * shared DataTable component (search, sort, per-status filter, pagination)
 * the same way legacy's own screen used `renderDataTable()`.
 */
export function CsStatusTable({
  rows,
  weekLabel,
}: {
  rows: CsStatusRow[];
  weekLabel: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        defaultLimit={25}
        onRowClick={(r) => setOpenId(r.id)}
        emptyMessage="No connection data this week."
      />

      {openRow && (
        <ConnectionKpiModal
          clientName={openRow.clientName}
          vaName={openRow.vaName}
          subtitle={weekLabel}
          kpiRows={openRow.kpiRows}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
