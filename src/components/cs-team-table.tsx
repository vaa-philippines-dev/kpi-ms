"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { CONNECTION_STATUS_LABELS, CONNECTION_STATUS_TONE } from "@/lib/connection-labels";
import { formatDuration } from "@/lib/period";
import { formatKpiValue } from "@/lib/kpi-format";
import type { CsBookConnectionRow } from "@/lib/cs-book";
import { PerformanceStatus } from "@/generated/prisma/enums";

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
  /** This specialist's live VA connections — shown in the detail modal. */
  connections: CsBookConnectionRow[];
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

/**
 * CS Manager's per-specialist breakdown — one row per CS on the team. A row
 * opens that specialist's book: every live VA connection with its start
 * date, lifetime value, departments, and this week's target vs actual.
 */
export function CsTeamTable({ rows, weekLabel }: { rows: CsTeamRow[]; weekLabel: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        defaultLimit={25}
        defaultSort={{ key: "liveConnections", dir: "desc" }}
        onRowClick={(r) => setOpenId(r.id)}
        emptyMessage="No CS Specialists yet — run Sync CS Specialists & Clients in Settings."
      />
      <Modal open={open !== null} onClose={() => setOpenId(null)} title={open?.name ?? ""} size="xl">
        {open && <SpecialistDetail row={open} weekLabel={weekLabel} />}
      </Modal>
    </>
  );
}

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

const CONNECTION_COLUMNS: DataTableColumn<CsBookConnectionRow>[] = [
  {
    key: "clientName",
    label: "Client",
    sortable: true,
    filterable: true,
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
    className: "whitespace-nowrap tabular-nums",
    render: (v) => DATE_FORMAT.format(new Date(String(v))),
  },
  {
    key: "tenureDays",
    label: "Lifetime Value",
    sortable: true,
    className: "whitespace-nowrap",
    render: (v) => formatDuration(Number(v)),
  },
  {
    key: "kpiRows",
    label: "Target / Actual",
    render: (_, r) =>
      r.kpiRows.length === 0 ? (
        <span className="text-xs text-muted">No KPIs this week</span>
      ) : (
        <div className="min-w-48 space-y-0.5 text-xs">
          {r.kpiRows.map((k) => (
            <div key={k.name} className="flex items-center justify-between gap-3">
              <span className="truncate text-muted" title={k.name}>
                {k.name}
              </span>
              <span className={`shrink-0 tabular-nums ${STATUS_TEXT[k.status]}`}>
                {formatKpiValue(k.target, k.unit)} / {formatKpiValue(k.actual, k.unit)}
              </span>
            </div>
          ))}
        </div>
      ),
  },
  {
    key: "status",
    label: "This Week",
    sortable: true,
    filterable: "select",
    filterOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    searchText: (r) => STATUS_LABEL[r.status],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  {
    key: "connectionStatus",
    label: "Connection",
    sortable: true,
    render: (_, r) => (
      <Badge tone={CONNECTION_STATUS_TONE[r.connectionStatus]}>
        {CONNECTION_STATUS_LABELS[r.connectionStatus]}
      </Badge>
    ),
  },
];

function MiniTile({ value, label, tone = "" }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-surface-border px-3 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function SpecialistDetail({ row, weekLabel }: { row: CsTeamRow; weekLabel: string }) {
  const conns = row.connections;
  const avgTenure = conns.length ? Math.round(conns.reduce((sum, c) => sum + c.tenureDays, 0) / conns.length) : 0;
  const longest = conns.length ? Math.max(...conns.map((c) => c.tenureDays)) : 0;
  const byDepartment = new Map<string, number>();
  for (const c of conns) for (const d of c.departments) byDepartment.set(d, (byDepartment.get(d) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {row.email}
        {!row.isActive && <Badge>Inactive</Badge>}
        <span>· {weekLabel}</span>
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <MiniTile value={`${row.activeClients}/${row.totalClients}`} label="Active Clients" />
        <MiniTile value={row.liveConnections} label="Live VAs" />
        <MiniTile value={row.pendingRequests} label="Pending Requests" tone={row.pendingRequests ? "text-accent" : ""} />
        <MiniTile value={formatDuration(avgTenure)} label="Avg Lifetime" />
        <MiniTile value={formatDuration(longest)} label="Longest Lifetime" />
        <MiniTile value={row.onTarget} label="On Target" tone="text-success" />
        <MiniTile value={row.atRisk} label="At Risk" tone="text-warning" />
        <MiniTile value={row.critical} label="Critical" tone="text-danger" />
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

      <DataTable
        columns={CONNECTION_COLUMNS}
        data={conns}
        getRowId={(r) => r.id}
        defaultLimit={10}
        defaultSort={{ key: "clientName", dir: "asc" }}
        emptyMessage="No live VA connections under this specialist's clients."
      />
    </div>
  );
}
