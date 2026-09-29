"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { CsClientTable } from "@/components/cs-client-table";
import type { CsTeamRow } from "@/components/cs-team-table";
import { CONNECTION_STATUS_LABELS, CONNECTION_STATUS_TONE } from "@/lib/connection-labels";
import { formatDuration } from "@/lib/period";
import { formatKpiValue } from "@/lib/kpi-format";
import type { CsBookClientRow, CsBookConnectionRow } from "@/lib/cs-book";
import { CustomerStatus, PerformanceStatus } from "@/generated/prisma/enums";

// Shared drill-down views for the CS Specialist / CS Manager dashboards —
// rendered inside CsDashboard's modal (see cs-dashboard.tsx).

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const STATUS_TEXT: Record<PerformanceStatus, string> = {
  ON_TARGET: "text-success",
  AT_RISK: "text-warning",
  CRITICAL: "font-semibold text-danger",
  NO_DATA: "text-muted",
};

const KPI_PREVIEW = 4;

/**
 * A connection's KPIs for the week, target / actual. Long lists (a hybrid
 * VA can carry 15+) collapse to the first few so one row doesn't fill the
 * whole modal.
 */
function KpiList({ rows }: { rows: CsBookConnectionRow["kpiRows"] }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <span className="text-xs text-muted">No KPIs this week</span>;
  const shown = expanded ? rows : rows.slice(0, KPI_PREVIEW);
  const onTarget = rows.filter((k) => k.status === PerformanceStatus.ON_TARGET).length;

  return (
    <div className="w-72 space-y-1 text-xs">
      <div className="text-muted">
        {onTarget}/{rows.length} on target
      </div>
      {shown.map((k, i) => (
        // Same KPI name can repeat across a connection's services, so the
        // index is part of the key.
        <div key={`${k.name}-${i}`} className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-muted">{k.name}</span>
          <span className={`shrink-0 text-right tabular-nums ${STATUS_TEXT[k.status]}`}>
            {formatKpiValue(k.target, k.unit)} / {formatKpiValue(k.actual, k.unit)}
          </span>
        </div>
      ))}
      {rows.length > KPI_PREVIEW && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-accent hover:underline">
          {expanded ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

const CONNECTION_COLUMNS: DataTableColumn<CsBookConnectionRow>[] = [
  {
    key: "clientName",
    label: "Client",
    sortable: true,
    filterable: true,
    className: "align-top",
    searchText: (r) => `${r.clientName} ${r.vaName}`,
    render: (v, r) => (
      <div>
        <div className="font-medium">{String(v)}</div>
        <div className="text-xs text-muted">{r.vaName}</div>
      </div>
    ),
  },
  {
    key: "departments",
    label: "Departments",
    filterable: true,
    className: "align-top",
    searchText: (r) => r.departments.join(" "),
    render: (_, r) => (
      <div className="flex flex-wrap gap-1">
        {r.departments.map((d) => (
          <Badge key={d}>{d}</Badge>
        ))}
      </div>
    ),
  },
  {
    key: "startDate",
    label: "Start Date",
    sortable: true,
    className: "whitespace-nowrap tabular-nums align-top",
    render: (v) => DATE_FORMAT.format(new Date(String(v))),
  },
  {
    key: "tenureDays",
    label: "Lifetime Value",
    sortable: true,
    className: "whitespace-nowrap align-top",
    render: (v) => formatDuration(Number(v)),
  },
  {
    key: "kpiRows",
    label: "Target / Actual",
    className: "align-top",
    render: (_, r) => <KpiList rows={r.kpiRows} />,
  },
  {
    key: "status",
    label: "This Week",
    sortable: true,
    filterable: "select",
    filterOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    className: "align-top",
    searchText: (r) => STATUS_LABEL[r.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  {
    key: "connectionStatus",
    label: "Connection",
    sortable: true,
    className: "align-top",
    render: (_, r) => (
      <Badge tone={CONNECTION_STATUS_TONE[r.connectionStatus]}>{CONNECTION_STATUS_LABELS[r.connectionStatus]}</Badge>
    ),
  },
];

const CS_COLUMN: DataTableColumn<CsBookConnectionRow> = {
  key: "csName",
  label: "CS",
  sortable: true,
  filterable: "select",
  filterPlaceholder: "All specialists",
  className: "whitespace-nowrap align-top",
};

/** Live VA connections with start date, lifetime value, departments, and target vs actual. */
export function CsConnectionTable({
  rows,
  showCs = false,
  emptyMessage = "No live VA connections.",
}: {
  rows: CsBookConnectionRow[];
  showCs?: boolean;
  emptyMessage?: string;
}) {
  return (
    <DataTable
      columns={showCs ? [CONNECTION_COLUMNS[0], CS_COLUMN, ...CONNECTION_COLUMNS.slice(1)] : CONNECTION_COLUMNS}
      data={rows}
      getRowId={(r) => `${r.id}-${r.csUserId}`}
      defaultLimit={10}
      defaultSort={{ key: "clientName", dir: "asc" }}
      emptyMessage={emptyMessage}
    />
  );
}

function MiniTile({ value, label, tone = "" }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-surface-border px-3 py-2">
      <div className={`text-lg font-semibold whitespace-nowrap tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

/** Lifetime, status-count tiles and a by-department breakdown for a set of connections. */
function BookSummary({
  conns,
  leading,
}: {
  conns: CsBookConnectionRow[];
  /** Tiles shown before the shared lifetime/status ones. */
  leading: React.ReactNode;
}) {
  const avgTenure = conns.length ? Math.round(conns.reduce((sum, c) => sum + c.tenureDays, 0) / conns.length) : 0;
  const longest = conns.length ? Math.max(...conns.map((c) => c.tenureDays)) : 0;
  const count = (s: PerformanceStatus) => conns.filter((c) => c.status === s).length;
  const byDepartment = new Map<string, number>();
  for (const c of conns) for (const d of c.departments) byDepartment.set(d, (byDepartment.get(d) ?? 0) + 1);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {leading}
        <MiniTile value={formatDuration(avgTenure)} label="Avg Lifetime" />
        <MiniTile value={formatDuration(longest)} label="Longest Lifetime" />
        <MiniTile value={count(PerformanceStatus.ON_TARGET)} label="On Target" tone="text-success" />
        <MiniTile value={count(PerformanceStatus.AT_RISK)} label="At Risk" tone="text-warning" />
        <MiniTile value={count(PerformanceStatus.CRITICAL)} label="Critical" tone="text-danger" />
      </div>
      {byDepartment.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="font-medium uppercase">By department:</span>
          {[...byDepartment.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => (
              <Badge key={name}>
                {name} · {n}
              </Badge>
            ))}
        </div>
      )}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted uppercase">{children}</h3>;
}

/** One client (one CS assignment): its standing and every live VA connection under it. */
export function ClientDetail({
  client,
  conns,
  weekLabel,
  showCs,
}: {
  client: CsBookClientRow;
  conns: CsBookConnectionRow[];
  weekLabel: string;
  showCs: boolean;
}) {
  return (
    <div className="space-y-5">
      <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Badge tone={client.status === CustomerStatus.ACTIVE ? "success" : "neutral"}>
          {client.status === CustomerStatus.ACTIVE ? "Active" : "Inactive"}
        </Badge>
        {showCs && <span>CS: {client.csName}</span>}
        <span className="font-mono text-xs">{client.assignmentCode}</span>
        <span>· {weekLabel}</span>
      </p>
      <BookSummary
        conns={conns}
        leading={
          <>
            <MiniTile value={client.liveConnections} label="Live VAs" />
            <div className="rounded-lg border border-surface-border px-3 py-2">
              <div className="py-0.5">
                <StatusBadge status={client.performance} />
              </div>
              <div className="mt-1 text-xs text-muted">This Week</div>
            </div>
          </>
        }
      />
      <CsConnectionTable rows={conns} emptyMessage="No live VA connections for this client." />
    </div>
  );
}

/** One specialist's whole book: summary, their clients (clickable), and every live connection. */
export function SpecialistDetail({
  row,
  clients,
  conns,
  weekLabel,
  onOpenClient,
}: {
  row: CsTeamRow;
  clients: CsBookClientRow[];
  conns: CsBookConnectionRow[];
  weekLabel: string;
  onOpenClient: (client: CsBookClientRow) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {row.email}
        {!row.isActive && <Badge>Inactive</Badge>}
        <span>· {weekLabel}</span>
      </p>
      <BookSummary
        conns={conns}
        leading={
          <>
            <MiniTile value={`${row.activeClients}/${row.totalClients}`} label="Active Clients" />
            <MiniTile value={row.liveConnections} label="Live VAs" />
            <MiniTile
              value={row.pendingRequests}
              label="Pending Requests"
              tone={row.pendingRequests ? "text-accent" : ""}
            />
          </>
        }
      />
      <div className="space-y-2">
        <SectionTitle>Clients — click one for its VAs</SectionTitle>
        <CsClientTable rows={clients} onOpen={(r) => onOpenClient(r as CsBookClientRow)} />
      </div>
      <div className="space-y-2">
        <SectionTitle>VA Connections</SectionTitle>
        <CsConnectionTable rows={conns} emptyMessage="No live VA connections under this specialist's clients." />
      </div>
    </div>
  );
}
