"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { SubmissionDetailModal } from "@/components/submission-detail-modal";
import { KpiPeriod } from "@/generated/prisma/enums";

export type SubmissionTrackerRow = {
  connectionId: string;
  vaName: string;
  teamName: string | null;
  clientName: string;
  departmentName: string;
  submitted: boolean;
  statusLabel: string;
};

// This column tracks whether a submission came in for the period, not how
// it performed against target — performance status belongs on the
// Performance page. Showing On Target/At Risk here (as PerformanceStatus
// once did) reads as a performance judgment on a submission-tracking grid,
// which isn't what this table is for.
function statusCell(submitted: boolean) {
  return submitted ? (
    <Badge tone="success">Submitted</Badge>
  ) : (
    <Badge tone="warning">Pending</Badge>
  );
}

function getColumns(
  periodLabel: string,
  canEdit: boolean,
  onEdit: (row: SubmissionTrackerRow) => void,
): DataTableColumn<SubmissionTrackerRow>[] {
  return [
    {
      key: "vaName",
      label: "Virtual Assistant",
      sortable: true,
      filterable: true,
      render: (v, row) =>
        canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="text-accent hover:underline"
            title="View this connection's actual submitted data"
          >
            {v as string}
          </button>
        ) : (
          (v as string)
        ),
    },
    {
      key: "teamName",
      label: "Team",
      sortable: true,
      filterable: "select",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    { key: "clientName", label: "Client", sortable: true, filterable: true },
    {
      key: "departmentName",
      label: "Department",
      sortable: true,
      filterable: "select",
      className: "text-muted",
    },
    {
      key: "statusLabel",
      label: periodLabel,
      sortable: true,
      filterable: "select",
      render: (_v, row) => statusCell(row.submitted),
    },
  ];
}

/**
 * "VA Submission Detail" — the current-period submitted-vs-pending grid,
 * over the app's standard sortable/filterable DataTable. Mirrors legacy's
 * DataTable of the same name in AppSubmissions.html (`_subRenderTable`),
 * simplified from its 4 separate dept/service/team/status dropdowns down to
 * this component's built-in per-column filters (department + status),
 * since the underlying rows are already scoped server-side by role. Shows
 * one status column for whichever period the navbar toggle currently
 * selects, rather than a fixed Weekly+Monthly pair.
 *
 * When `canEdit` (Admin/DM/Ops Manager/Team Leader), clicking a VA's name
 * opens SubmissionDetailModal — the connection's actual/target per KPI for
 * this period, which KPIs are still missing, and the raw submission log
 * (with edit/delete for a wrongly-dated one) — VA/Service Manager viewers
 * just see plain text instead.
 */
export function SubmissionTrackerTable({
  rows,
  period,
  periodStart,
  periodLabel,
  canEdit,
}: {
  rows: SubmissionTrackerRow[];
  period: KpiPeriod;
  periodStart: string;
  periodLabel: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<SubmissionTrackerRow | null>(null);

  return (
    <>
      <DataTable
        columns={getColumns(periodLabel, canEdit, setEditing)}
        data={rows}
        getRowId={(r) => r.connectionId}
        defaultLimit={25}
        emptyMessage="No connections match the current filters."
      />
      {canEdit && (
        <SubmissionDetailModal
          open={editing !== null}
          onClose={() => setEditing(null)}
          connectionId={editing?.connectionId ?? ""}
          period={period}
          periodStart={periodStart}
          periodLabel={periodLabel}
        />
      )}
    </>
  );
}
