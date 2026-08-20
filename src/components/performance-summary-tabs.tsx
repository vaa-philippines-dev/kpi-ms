"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { PerformanceStatus, ConnectionType } from "@/generated/prisma/enums";

const TYPE_LABELS: Record<ConnectionType, string> = {
  REGULAR: "Regular",
  PROJECT_BASED: "Project-based",
};

const STATUS_FILTER_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));
const TYPE_FILTER_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export type ConnectionSummaryRow = {
  connectionId: string;
  clientName: string;
  vaName: string;
  departmentName: string;
  teamName: string | null;
  connectionType: ConnectionType;
  status: PerformanceStatus;
  durationDays: number;
  isFlagged: boolean;
};

export type ClientSummaryRow = {
  clientName: string;
  connectionCount: number;
  departmentNames: string;
  status: PerformanceStatus;
  isFlagged: boolean;
};

const connectionColumns: DataTableColumn<ConnectionSummaryRow>[] = [
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    filterOptions: STATUS_FILTER_OPTIONS,
    searchText: (row) => STATUS_LABEL[row.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "departmentName",
    label: "Dept / Service",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "durationDays",
    label: "Duration",
    sortable: true,
    className: "text-muted",
    render: (v) => `${v}d`,
  },
  {
    key: "teamName",
    label: "Team",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "connectionType",
    label: "Type",
    sortable: true,
    filterable: "select",
    filterOptions: TYPE_FILTER_OPTIONS,
    className: "text-muted",
    searchText: (row) => TYPE_LABELS[row.connectionType],
    render: (v) => TYPE_LABELS[v as ConnectionType],
  },
  {
    key: "isFlagged",
    label: "Intv",
    className: "w-6",
    render: (v) => (v ? <Flag className="size-3.5 fill-danger text-danger" /> : null),
  },
];

const clientColumns: DataTableColumn<ClientSummaryRow>[] = [
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    filterOptions: STATUS_FILTER_OPTIONS,
    searchText: (row) => STATUS_LABEL[row.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  {
    key: "connectionCount",
    label: "Connections",
    sortable: true,
    className: "text-muted",
  },
  {
    key: "departmentNames",
    label: "Dept / Service",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "isFlagged",
    label: "Intv",
    className: "w-6",
    render: (v) => (v ? <Flag className="size-3.5 fill-danger text-danger" /> : null),
  },
];

/**
 * "Performance Summary" table on the Performance Analytics page — legacy's
 * Per Connection / Per Client tab toggle over the same filterable/sortable
 * DataTable used everywhere else in the app.
 */
export function PerformanceSummaryTabs({
  connectionRows,
  clientRows,
}: {
  connectionRows: ConnectionSummaryRow[];
  clientRows: ClientSummaryRow[];
}) {
  const [tab, setTab] = useState<"connection" | "client">("connection");

  return (
    <div>
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-surface-hover/60 p-1">
        {(
          [
            ["connection", "Per Connection"],
            ["client", "Per Client"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === key
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "connection" ? (
        <DataTable
          columns={connectionColumns}
          data={connectionRows}
          getRowId={(r) => r.connectionId}
          defaultSort={{ key: "status", dir: "desc" }}
          emptyMessage="No connections with performance data for this period."
        />
      ) : (
        <DataTable
          columns={clientColumns}
          data={clientRows}
          getRowId={(r) => r.clientName}
          defaultSort={{ key: "status", dir: "desc" }}
          emptyMessage="No clients with performance data for this period."
        />
      )}
    </div>
  );
}
