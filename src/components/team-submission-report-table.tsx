"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Sparkline } from "@/components/sparkline";

export type TeamReportRow = {
  teamId: string;
  teamName: string;
  departmentName: string;
  leaderName: string | null;
  /** Submission rate (0–100) for each of the last N weeks, oldest first. */
  weeklyRates: number[];
  submitted: number;
  total: number;
  ratePct: number;
  avgRatePct: number;
};

function rateTextClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-danger";
}

const columns: DataTableColumn<TeamReportRow>[] = [
  {
    key: "teamName",
    label: "Team",
    sortable: true,
    filterable: true,
    render: (v, row) => (
      <>
        <span className="font-medium">{v as string}</span>
        {row.leaderName && <div className="text-xs text-muted">{row.leaderName}</div>}
      </>
    ),
  },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "weeklyRates",
    label: "Weekly Trend",
    render: (v) => <Sparkline values={v as number[]} width={120} height={32} />,
  },
  {
    key: "ratePct",
    label: "This Period",
    sortable: true,
    render: (v, row) => (
      <span className={`font-semibold ${rateTextClass(v as number)}`}>
        {v as number}%
        <div className="text-xs font-normal text-muted">
          {row.submitted}/{row.total}
        </div>
      </span>
    ),
  },
  {
    key: "avgRatePct",
    label: "Avg Rate",
    sortable: true,
    render: (v) => <span className={`font-semibold ${rateTextClass(v as number)}`}>{v as number}%</span>,
  },
];

/**
 * "Team Report" — a per-team weekly submission-rate breakdown reachable
 * from the Submissions page (Admin/DM only), mirroring legacy's Team
 * Submission Report modal (AppSubmissions.html) over the app's standard
 * sortable/filterable DataTable rather than a modal + hand-rolled SVG chart.
 */
export function TeamSubmissionReportTable({ rows }: { rows: TeamReportRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.teamId}
      defaultSort={{ key: "avgRatePct", dir: "desc" }}
      emptyMessage="No teams with connections for this period."
    />
  );
}
