"use client";

import { useState, useTransition } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { reassignClientCs, resetClientCsToCms } from "@/app/dashboard/cs-clients/actions";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import type { CsAssignmentSource, CustomerStatus, PerformanceStatus } from "@/generated/prisma/enums";

export type CsClientRow = {
  id: string;
  customerId: string;
  /** CMS = follows the CMS sheet; MANUAL = reassigned in KPI (sync skips it). */
  source: CsAssignmentSource;
  clientName: string;
  assignmentCode: string;
  status: CustomerStatus;
  cmsStatus: string;
  liveConnections: number;
  vaNames: string;
  performance: PerformanceStatus;
  /** Assigned CS — only shown (with its own filter) when `showCs` is set. */
  csName?: string;
};

const COLUMNS: DataTableColumn<CsClientRow>[] = [
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    filterable: "select",
    defaultValue: "ACTIVE",
    filterOptions: [
      { value: "ACTIVE", label: "Active" },
      { value: "INACTIVE", label: "Inactive" },
    ],
    render: (v, row) => (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={v === "ACTIVE" ? "success" : "neutral"}>{v === "ACTIVE" ? "Active" : "Inactive"}</Badge>
        {/* KPI is the source of truth for status — flag where the CMS disagrees. */}
        {v === "INACTIVE" && row.cmsStatus === "Active" && (
          <span className="text-xs text-warning" title="The CMS still lists this client as Active, but none of its KPI connections are live.">
            CMS: Active
          </span>
        )}
      </span>
    ),
  },
  { key: "liveConnections", label: "Live VAs", sortable: true, className: "tabular-nums" },
  { key: "vaNames", label: "VAs", filterable: true, className: "text-muted" },
  {
    key: "performance",
    label: "This Week",
    sortable: true,
    filterable: "select",
    filterOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    searchText: (row) => STATUS_LABEL[row.performance],
    render: (v) => <StatusBadge status={v as PerformanceStatus} />,
  },
  { key: "assignmentCode", label: "CS-Client ID", sortable: true, filterable: true, className: "font-mono text-xs text-muted" },
];

const CS_COLUMN: DataTableColumn<CsClientRow> = {
  key: "csName",
  label: "CS",
  sortable: true,
  filterable: "select",
  filterPlaceholder: "All specialists",
  render: (v, row) => (
    <span className="inline-flex items-center gap-1.5">
      {String(v ?? "—")}
      {row.source === "MANUAL" && (
        <span title="Reassigned in KPI — the CMS sync won't change it">
          <Badge>Manual</Badge>
        </span>
      )}
    </span>
  ),
};

export type CsOption = { id: string; name: string };

/**
 * A CS client book — one row per CsClientAssignment. With `specialists`
 * (CS Manager / Admin), a row opens the reassign-to-another-CS modal.
 */
export function CsClientTable({
  rows,
  showCs = false,
  specialists,
}: {
  rows: CsClientRow[];
  showCs?: boolean;
  specialists?: CsOption[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <DataTable
        columns={showCs ? [COLUMNS[0], CS_COLUMN, ...COLUMNS.slice(1)] : COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        defaultLimit={25}
        defaultSort={{ key: "clientName", dir: "asc" }}
        onRowClick={specialists ? (r) => setOpenId(r.id) : undefined}
        emptyMessage="No clients assigned in the CMS yet."
      />
      {specialists && (
        <Modal open={open !== null} onClose={() => setOpenId(null)} title={open?.clientName ?? ""}>
          {open && (
            <ReassignClientForm
              key={open.id}
              row={open}
              specialists={specialists}
              onDone={() => setOpenId(null)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function ReassignClientForm({
  row,
  specialists,
  onDone,
}: {
  row: CsClientRow;
  specialists: CsOption[];
  onDone: () => void;
}) {
  const others = specialists.filter((s) => s.name !== row.csName);
  const [csUserId, setCsUserId] = useState(others[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function run(action: (fd: FormData) => Promise<void>, message: string) {
    const fd = new FormData();
    fd.set("customerId", row.customerId);
    fd.set("csUserId", csUserId);
    startTransition(async () => {
      try {
        await action(fd);
        toast(message, "success");
        onDone();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-muted uppercase">Current CS</p>
          <p className="mt-0.5 flex items-center gap-1.5">
            {row.csName ?? "—"} {row.source === "MANUAL" && <Badge>Manual</Badge>}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase">Live VAs</p>
          <p className="mt-0.5">{row.liveConnections}</p>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted uppercase">Reassign to</label>
        <Select value={csUserId} onChange={(e) => setCsUserId(e.target.value)} className="w-full py-1.5">
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-muted">
          Moves this client, its VA connections, and any open status requests to the new CS. The CMS
          sync won&apos;t change it back — use &ldquo;Follow CMS again&rdquo; to undo that.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {row.source === "MANUAL" && (
          <Button
            variant="outline"
            disabled={isPending}
            className="px-3 py-1.5 text-xs"
            onClick={() => run(resetClientCsToCms, "This client will follow the CMS again on the next sync.")}
          >
            Follow CMS again
          </Button>
        )}
        <Button
          loading={isPending}
          disabled={!csUserId}
          className="px-3 py-1.5 text-xs"
          onClick={() => run(reassignClientCs, "Client reassigned.")}
        >
          Reassign
        </Button>
      </div>
    </div>
  );
}
