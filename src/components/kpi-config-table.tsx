"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { KpiConfigPanel } from "@/components/kpi-config-panel";

export type ConnectionConfigRow = {
  id: string;
  clientName: string;
  vaName: string;
  departmentName: string;
  serviceName: string | null;
  hasConfig: boolean;
};

const COLUMNS: DataTableColumn<ConnectionConfigRow>[] = [
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "serviceName",
    label: "Service",
    sortable: true,
    filterable: "select",
    className: "text-muted",
    render: (v) => (v as string | null) ?? "—",
  },
  {
    key: "hasConfig",
    label: "Config",
    sortable: true,
    filterable: "select",
    filterOptions: [
      { value: "true", label: "Custom Config" },
      { value: "false", label: "Using Defaults" },
    ],
    searchText: (row) => (row.hasConfig ? "Custom Config" : "Using Defaults"),
    render: (v) =>
      v ? <Badge tone="success">Custom Config</Badge> : <Badge tone="warning">Using Defaults</Badge>,
  },
];

/**
 * KPI Config, rendered through the shared DataTable — mirrors legacy's KPI
 * Configuration screen (AppKPIConfig.html: `renderKPIConfig()`), which is a
 * system-wide connection list (not a pick-one-connection-first form) with a
 * per-row "View / Edit" that opens a KPI override editor
 * (`openKPIConfigEditor()`), ported here as a row-click modal. That
 * modal's data is fetched lazily on open rather than preloaded for every
 * connection — this system has roughly 11k KpiConfig rows in total, far
 * more than's reasonable to ship to the browser up front.
 */
export function KpiConfigTable({
  connections,
  isAdmin,
  initialConnectionId,
}: {
  connections: ConnectionConfigRow[];
  isAdmin: boolean;
  initialConnectionId?: string;
}) {
  // Deep link from Connections' "KPI Config →" — auto-opens the row the
  // user came from, same as clicking it directly. Computed as the initial
  // state (not set via an effect), since it only depends on props present
  // at mount.
  const [openId, setOpenId] = useState<string | null>(() =>
    initialConnectionId && connections.some((c) => c.id === initialConnectionId)
      ? initialConnectionId
      : null,
  );
  const openConn = connections.find((c) => c.id === openId) ?? null;

  function close() {
    setOpenId(null);
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
        onClose={close}
        title={openConn?.clientName ?? ""}
        size="xl"
      >
        {openConn && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              {openConn.vaName} · {openConn.departmentName}
            </p>
            <KpiConfigPanel connectionId={openConn.id} isAdmin={isAdmin} />
          </div>
        )}
      </Modal>
    </>
  );
}
