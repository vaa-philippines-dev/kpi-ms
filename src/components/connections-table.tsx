"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  CONNECTION_STATUS_LABELS,
  TERMINAL_CONNECTION_STATUSES,
} from "@/lib/connection-labels";
import { ConnectionStatus, ConnectionType } from "@/generated/prisma/enums";
import {
  updateConnectionStatus,
  updateConnectionType,
  toggleConnectionFlag,
  updateConnectionNotes,
  deleteConnection,
} from "@/app/dashboard/connections/actions";

const TYPE_LABELS: Record<ConnectionType, string> = {
  REGULAR: "Regular",
  PROJECT_BASED: "Project-based",
};

export type ConnectionStatusEventRow = {
  status: ConnectionStatus;
  changedAt: string;
  changedByName: string;
};

export type ConnectionRow = {
  id: string;
  clientName: string;
  vaName: string;
  vaEmail: string;
  departmentName: string;
  serviceName: string | null;
  status: ConnectionStatus;
  connectionType: ConnectionType;
  isFlagged: boolean;
  notes: string | null;
  createdAt: string;
  statusEvents: ConnectionStatusEventRow[];
};

const STATUS_FILTER_OPTIONS = Object.entries(CONNECTION_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const TYPE_FILTER_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const COLUMNS: DataTableColumn<ConnectionRow>[] = [
  {
    key: "isFlagged",
    label: "",
    sortable: true,
    className: "w-6",
    render: (v) =>
      v ? <Flag className="size-3.5 fill-danger text-danger" /> : null,
  },
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
    // Mirrors legacy's Department cell, which shows Service underneath when
    // it differs from the department name (AppVAConnections.html connFilter()).
    render: (v, row) => (
      <>
        {v as string}
        {row.serviceName && row.serviceName !== row.departmentName && (
          <div className="text-xs text-muted">{row.serviceName}</div>
        )}
      </>
    ),
  },
  {
    key: "createdAt",
    label: "Since",
    sortable: true,
    className: "text-muted",
    render: (v) => new Date(v as string).toLocaleDateString(),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    filterOptions: STATUS_FILTER_OPTIONS,
    searchText: (row) => CONNECTION_STATUS_LABELS[row.status],
    render: (v) => CONNECTION_STATUS_LABELS[v as ConnectionStatus],
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
];

/**
 * Connections list, rendered through the shared DataTable — mirrors
 * legacy's VA Connections screen, itself built on `renderDataTable()`
 * (AppVAConnections.html: `connFilter()`), including its row-click-opens-
 * detail behavior (`connOpenDetail()`), ported here as a detail/edit modal
 * with the status-change form, type-change form, and status history that
 * legacy's modal showed.
 */
export function ConnectionsTable({
  connections,
  isAdmin,
}: {
  connections: ConnectionRow[];
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openConn = connections.find((c) => c.id === openId) ?? null;

  function closeAnd(action: (formData: FormData) => void | Promise<void>) {
    return async (formData: FormData) => {
      await action(formData);
      setOpenId(null);
    };
  }

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={connections}
        getRowId={(c) => c.id}
        defaultLimit={25}
        onRowClick={(c) => setOpenId(c.id)}
        emptyMessage="No connections found."
      />

      <Modal
        open={openConn !== null}
        onClose={() => setOpenId(null)}
        title={openConn?.clientName ?? ""}
      >
        {openConn && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{openConn.vaName}</p>
                <p className="text-xs text-muted">
                  {openConn.vaEmail} · {openConn.departmentName}
                  {openConn.serviceName ? ` · ${openConn.serviceName}` : ""}
                </p>
              </div>
              {isAdmin && (
                <form action={toggleConnectionFlag}>
                  <input type="hidden" name="id" value={openConn.id} />
                  <button
                    type="submit"
                    title={openConn.isFlagged ? "Unflag connection" : "Flag connection"}
                    className={`rounded-md p-1.5 transition ${
                      openConn.isFlagged
                        ? "text-danger hover:bg-danger/10"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Flag
                      className={`size-4 ${openConn.isFlagged ? "fill-danger" : ""}`}
                    />
                  </button>
                </form>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">Status</p>
                {isAdmin && !TERMINAL_CONNECTION_STATUSES.has(openConn.status) ? (
                  <form
                    action={closeAnd(updateConnectionStatus)}
                    className="flex gap-1.5"
                  >
                    <input type="hidden" name="id" value={openConn.id} />
                    <Select name="status" defaultValue={openConn.status} className="py-1.5">
                      {Object.values(ConnectionStatus).map((s) => (
                        <option key={s} value={s}>
                          {CONNECTION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" className="shrink-0 px-3 py-1.5 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm">{CONNECTION_STATUS_LABELS[openConn.status]}</p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">Type</p>
                {isAdmin ? (
                  <form action={closeAnd(updateConnectionType)} className="flex gap-1.5">
                    <input type="hidden" name="id" value={openConn.id} />
                    <Select
                      name="connectionType"
                      defaultValue={openConn.connectionType}
                      className="py-1.5"
                    >
                      {Object.values(ConnectionType).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" className="shrink-0 px-3 py-1.5 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm">{TYPE_LABELS[openConn.connectionType]}</p>
                )}
              </div>
            </div>

            {openConn.statusEvents.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">
                  Status history
                </p>
                <ul className="space-y-1 text-xs text-muted">
                  {openConn.statusEvents.map((e, i) => (
                    <li key={i}>
                      {CONNECTION_STATUS_LABELS[e.status]} —{" "}
                      {new Date(e.changedAt).toLocaleString()} by {e.changedByName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted uppercase">Notes</p>
              {isAdmin ? (
                <form action={updateConnectionNotes} className="space-y-1.5">
                  <input type="hidden" name="id" value={openConn.id} />
                  <Textarea
                    name="notes"
                    defaultValue={openConn.notes ?? ""}
                    rows={2}
                    placeholder="Free-text note about this connection…"
                    className="w-full"
                  />
                  <Button type="submit" className="px-3 py-1.5 text-xs">
                    Save note
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted">{openConn.notes || "—"}</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-surface-border pt-4">
              <Link
                href={`/dashboard/connections/kpi-config?connectionId=${openConn.id}`}
                className="text-xs text-accent hover:underline"
              >
                KPI Config →
              </Link>
              {isAdmin && (
                <ConfirmSubmitButton
                  action={deleteConnection}
                  fields={{ id: openConn.id }}
                  label="Delete connection"
                  successMessage="Connection deleted."
                  onSuccess={() => setOpenId(null)}
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
