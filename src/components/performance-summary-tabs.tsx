"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { PerformanceDetailModal } from "@/components/performance-detail-modal";
import { formatDuration } from "@/lib/period";
import { KpiPeriod, PerformanceStatus, ConnectionType } from "@/generated/prisma/enums";

const TYPE_LABELS: Record<ConnectionType, string> = {
  REGULAR: "Regular",
  PROJECT_BASED: "Project-based",
};

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

// Status / Dept / Team / Type are now filtered up at the page level (see
// PerformanceFilterBar), which — unlike these per-column dropdowns — also
// narrows the Performance Trend, Submission Trend, and Department/Team
// Summary panels. Kept as plain (non-dropdown) `filterable: true` so they
// still count toward the table's global search box.
const connectionColumns: DataTableColumn<ConnectionSummaryRow>[] = [
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: true,
    searchText: (row) => STATUS_LABEL[row.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "departmentName",
    label: "Dept / Service",
    sortable: true,
    filterable: true,
    className: "text-muted",
  },
  {
    key: "durationDays",
    label: "Duration",
    sortable: true,
    className: "text-muted",
    render: (v) => formatDuration(v as number),
  },
  {
    key: "teamName",
    label: "Team",
    sortable: true,
    filterable: true,
    className: "text-muted",
  },
  {
    key: "connectionType",
    label: "Type",
    sortable: true,
    filterable: true,
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
    filterable: true,
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
    filterable: true,
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
  periodStart,
  period,
  isManager,
  interventionTypes,
}: {
  connectionRows: ConnectionSummaryRow[];
  clientRows: ClientSummaryRow[];
  periodStart: string;
  period: KpiPeriod;
  isManager: boolean;
  interventionTypes: string[];
}) {
  const [tab, setTab] = useState<"connection" | "client">("connection");
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);
  const [openClientName, setOpenClientName] = useState<string | null>(null);

  const connectionsForClient = (clientName: string) =>
    connectionRows.filter((r) => r.clientName === clientName);

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
          key="connection"
          columns={connectionColumns}
          data={connectionRows}
          getRowId={(r) => r.connectionId}
          defaultSort={{ key: "status", dir: "desc" }}
          onRowClick={(r) => setOpenConnectionId(r.connectionId)}
          emptyMessage="No connections with performance data for this period."
        />
      ) : (
        <DataTable
          key="client"
          columns={clientColumns}
          data={clientRows}
          getRowId={(r) => r.clientName}
          defaultSort={{ key: "status", dir: "desc" }}
          onRowClick={(r) => setOpenClientName(r.clientName)}
          emptyMessage="No clients with performance data for this period."
        />
      )}

      {openClientName && (
        <Modal open onClose={() => setOpenClientName(null)} title={openClientName}>
          <ul className="divide-y divide-surface-border">
            {connectionsForClient(openClientName).map((row) => (
              <li key={row.connectionId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenConnectionId(row.connectionId);
                    setOpenClientName(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <StatusBadge status={row.status} />
                    </p>
                    <p className="truncate text-xs text-muted">
                      {row.vaName} · {row.departmentName}
                      {row.teamName ? ` · ${row.teamName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {row.isFlagged && <Flag className="size-3.5 fill-danger text-danger" />}
                    {formatDuration(row.durationDays)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {openConnectionId && (
        <PerformanceDetailModal
          connectionId={openConnectionId}
          periodStart={periodStart}
          period={period}
          isManager={isManager}
          interventionTypes={interventionTypes}
          onClose={() => setOpenConnectionId(null)}
        />
      )}
    </div>
  );
}
