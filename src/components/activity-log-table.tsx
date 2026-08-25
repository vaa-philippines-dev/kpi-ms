"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { roleLabel } from "@/lib/roles";

export type ActivityChangeRow = { field: string; oldValue: string | null; newValue: string | null };

export type ActivityLogRow = {
  id: string;
  createdAtMs: number;
  createdAtLabel: string;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityLabel: string;
  summary: string;
  departmentName: string | null;
  changes: ActivityChangeRow[] | null;
};

const ACTION_TONE = {
  CREATE: "success",
  UPDATE: "warning",
  DELETE: "danger",
} as const;

const ACTION_FILTER_OPTIONS = [
  { value: "CREATE", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  KpiDefinition: "KPI Definition",
  KpiConfig: "KPI Config",
  Connection: "Connection",
  Department: "Department",
  Service: "Service",
  Team: "Team",
  User: "User",
  Intervention: "Intervention",
  Submission: "Submission",
  Setting: "Setting",
};

function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

const ENTITY_TYPE_FILTER_OPTIONS = Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const COLUMNS: DataTableColumn<ActivityLogRow>[] = [
  {
    key: "createdAtMs",
    label: "Time",
    sortable: true,
    className: "text-muted whitespace-nowrap",
    render: (_v, row) => row.createdAtLabel,
  },
  {
    key: "actorName",
    label: "Actor",
    sortable: true,
    filterable: true,
    searchText: (row) => `${row.actorName} ${row.actorEmail ?? ""} ${roleLabel(row.actorRole ?? "")}`,
    render: (v, row) => (
      <>
        <span className="font-medium text-foreground">{v as string}</span>
        {row.actorRole && <div className="text-xs text-muted">{roleLabel(row.actorRole)}</div>}
      </>
    ),
  },
  {
    key: "action",
    label: "Action",
    sortable: true,
    filterable: "select",
    filterOptions: ACTION_FILTER_OPTIONS,
    searchText: (row) => row.action,
    render: (v) => {
      const action = v as ActivityLogRow["action"];
      return <Badge tone={ACTION_TONE[action]}>{action.charAt(0) + action.slice(1).toLowerCase()}</Badge>;
    },
  },
  {
    key: "entityType",
    label: "Entity Type",
    sortable: true,
    filterable: "select",
    filterOptions: ENTITY_TYPE_FILTER_OPTIONS,
    className: "text-muted whitespace-nowrap",
    searchText: (row) => entityTypeLabel(row.entityType),
    render: (v) => entityTypeLabel(v as string),
  },
  {
    key: "summary",
    label: "Summary",
    filterable: true,
    className: "max-w-md truncate",
  },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted whitespace-nowrap",
    render: (v) => (v as string | null) ?? "—",
  },
];

/**
 * Unified activity/audit trail — every logged mutation (KPI edits,
 * submissions, deletions, connection/team/user changes, etc.), rendered
 * through the shared DataTable like every other report in the app. Row
 * click opens a detail modal with the full before/after field diff, when
 * one was recorded.
 */
export function ActivityLogTable({ rows }: { rows: ActivityLogRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        defaultLimit={25}
        defaultSort={{ key: "createdAtMs", dir: "desc" }}
        onRowClick={(r) => setOpenId(r.id)}
        emptyMessage="No activity recorded yet."
      />

      <Modal open={open !== null} onClose={() => setOpenId(null)} title="Activity Detail" size="lg">
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ACTION_TONE[open.action]}>
                {open.action.charAt(0) + open.action.slice(1).toLowerCase()}
              </Badge>
              <span className="text-xs text-muted">{entityTypeLabel(open.entityType)}</span>
              {open.departmentName && (
                <span className="text-xs text-muted">· {open.departmentName}</span>
              )}
            </div>

            <p className="text-sm font-medium text-foreground">{open.summary}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Actor</dt>
              <dd className="text-right">
                {open.actorName}
                {open.actorEmail && <span className="text-muted"> ({open.actorEmail})</span>}
              </dd>
              <dt className="text-muted">Role</dt>
              <dd className="text-right">{open.actorRole ? roleLabel(open.actorRole) : "—"}</dd>
              <dt className="text-muted">When</dt>
              <dd className="text-right">{open.createdAtLabel}</dd>
              <dt className="text-muted">Affected record</dt>
              <dd className="text-right">{open.entityLabel}</dd>
            </dl>

            {open.changes && open.changes.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  Field changes
                </h3>
                <Table>
                  <TableHead>
                    <tr>
                      <Th>Field</Th>
                      <Th>Old Value</Th>
                      <Th>New Value</Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {open.changes.map((c, i) => (
                      <Tr key={i}>
                        <Td className="font-medium">{c.field}</Td>
                        <Td className="text-muted">{c.oldValue ?? "—"}</Td>
                        <Td>{c.newValue ?? "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted">No detailed field changes recorded for this event.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
