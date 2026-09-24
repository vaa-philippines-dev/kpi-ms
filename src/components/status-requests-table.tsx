"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CONNECTION_STATUS_LABELS, CONNECTION_STATUS_TONE } from "@/lib/connection-labels";
import type { ConnectionStatus, StatusChangeRequestState } from "@/generated/prisma/enums";
import {
  approveStatusChangeRequest,
  rejectStatusChangeRequest,
} from "@/app/dashboard/status-requests/actions";

export type StatusRequestRow = {
  id: string;
  connectionId: string;
  clientName: string;
  shortCode: string | null;
  vaName: string;
  departmentName: string;
  currentStatus: ConnectionStatus;
  fromStatus: ConnectionStatus;
  requestedStatus: ConnectionStatus;
  effectiveDate: string | null;
  reason: string;
  requestedByName: string;
  createdAt: string;
  state: StatusChangeRequestState;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  csNames: string;
};

export const REQUEST_STATE_LABELS: Record<StatusChangeRequestState, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const REQUEST_STATE_TONE: Record<StatusChangeRequestState, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function StatusChange({ from, to }: { from: ConnectionStatus; to: ConnectionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={CONNECTION_STATUS_TONE[from]}>{CONNECTION_STATUS_LABELS[from]}</Badge>
      <ArrowRight className="size-3 text-muted" />
      <Badge tone={CONNECTION_STATUS_TONE[to]}>{CONNECTION_STATUS_LABELS[to]}</Badge>
    </span>
  );
}

function getColumns(mode: "pending" | "history"): DataTableColumn<StatusRequestRow>[] {
  const common: DataTableColumn<StatusRequestRow>[] = [
    { key: "clientName", label: "Client", sortable: true, filterable: true },
    { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
    { key: "departmentName", label: "Department", sortable: true, filterable: "select" },
    {
      key: "requestedStatus",
      label: "Change",
      sortable: true,
      searchText: (r) => `${CONNECTION_STATUS_LABELS[r.fromStatus]} ${CONNECTION_STATUS_LABELS[r.requestedStatus]}`,
      render: (_v, r) => <StatusChange from={r.fromStatus} to={r.requestedStatus} />,
    },
    { key: "requestedByName", label: "Requested by", sortable: true, filterable: true },
  ];
  if (mode === "pending") {
    return [
      ...common,
      { key: "csNames", label: "CS", filterable: true, className: "text-muted" },
      { key: "createdAt", label: "Requested", sortable: true, render: (v) => fmtDate(v as string) },
    ];
  }
  return [
    ...common,
    {
      key: "state",
      label: "Outcome",
      sortable: true,
      filterable: "select",
      filterOptions: Object.entries(REQUEST_STATE_LABELS)
        .filter(([v]) => v !== "PENDING")
        .map(([value, label]) => ({ value, label })),
      searchText: (r) => REQUEST_STATE_LABELS[r.state],
      render: (v) => (
        <Badge tone={REQUEST_STATE_TONE[v as StatusChangeRequestState]}>
          {REQUEST_STATE_LABELS[v as StatusChangeRequestState]}
        </Badge>
      ),
    },
    { key: "resolvedByName", label: "Handled by", sortable: true, filterable: true },
    { key: "resolvedAt", label: "Handled", sortable: true, render: (v) => fmtDate(v as string | null) },
  ];
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function ResolveForm({ request, onDone }: { request: StatusRequestRow; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const { toast } = useToast();

  function run(kind: "approve" | "reject") {
    const formData = new FormData();
    formData.set("requestId", request.id);
    formData.set("note", note);
    setBusy(kind);
    startTransition(async () => {
      try {
        await (kind === "approve" ? approveStatusChangeRequest : rejectStatusChangeRequest)(formData);
        toast(
          kind === "approve"
            ? `Approved — ${request.clientName} is now ${CONNECTION_STATUS_LABELS[request.requestedStatus]}.`
            : "Request rejected.",
          "success",
        );
        onDone();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-2 border-t border-surface-border pt-4">
      <label className="block text-xs font-medium text-muted uppercase">
        Note <span className="normal-case">(required to reject)</span>
      </label>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Confirmed with the client on the call…"
        className="w-full"
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          loading={busy === "reject"}
          onClick={() => run("reject")}
          className="px-3 py-1.5 text-xs"
        >
          Reject
        </Button>
        <Button
          disabled={isPending}
          loading={busy === "approve"}
          onClick={() => run("approve")}
          className="px-3 py-1.5 text-xs"
        >
          Approve &amp; apply
        </Button>
      </div>
      <p className="text-xs text-muted">
        Approving changes the connection to{" "}
        <strong>{CONNECTION_STATUS_LABELS[request.requestedStatus]}</strong> right away.
      </p>
    </div>
  );
}

/**
 * CS Specialist's Status Requests queue ("pending") and History log
 * ("history") — same table, different columns; a row opens the full
 * request, with Approve/Reject for a pending one when `canResolve`.
 */
export function StatusRequestsTable({
  rows,
  mode,
  canResolve,
}: {
  rows: StatusRequestRow[];
  mode: "pending" | "history";
  canResolve: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <DataTable
        columns={getColumns(mode)}
        data={rows}
        getRowId={(r) => r.id}
        defaultLimit={25}
        onRowClick={(r) => setOpenId(r.id)}
        emptyMessage={mode === "pending" ? "No pending status requests." : "No resolved requests yet."}
      />
      <Modal open={open !== null} onClose={() => setOpenId(null)} title={open?.clientName ?? ""} size="lg">
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusChange from={open.fromStatus} to={open.requestedStatus} />
              <Badge tone={REQUEST_STATE_TONE[open.state]}>{REQUEST_STATE_LABELS[open.state]}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Detail label="VA">{open.vaName}</Detail>
              <Detail label="Department">{open.departmentName}</Detail>
              <Detail label="Connection ID">{open.shortCode ?? "—"}</Detail>
              <Detail label="Current status">
                <Badge tone={CONNECTION_STATUS_TONE[open.currentStatus]}>
                  {CONNECTION_STATUS_LABELS[open.currentStatus]}
                </Badge>
              </Detail>
              {open.effectiveDate && <Detail label="End date">{fmtDate(open.effectiveDate)}</Detail>}
              <Detail label="CS">{open.csNames}</Detail>
              <Detail label="Requested by">{open.requestedByName}</Detail>
              <Detail label="Requested">{fmtDateTime(open.createdAt)}</Detail>
              {open.resolvedAt && (
                <Detail label="Handled">
                  {fmtDateTime(open.resolvedAt)} by {open.resolvedByName ?? "—"}
                </Detail>
              )}
            </div>
            <Detail label="Reason">
              <p className="whitespace-pre-wrap">{open.reason}</p>
            </Detail>
            {open.resolutionNote && (
              <Detail label="Resolution note">
                <p className="whitespace-pre-wrap">{open.resolutionNote}</p>
              </Detail>
            )}
            <Link
              href={`/dashboard/connections?open=${open.connectionId}`}
              className="inline-block text-xs text-accent hover:underline"
            >
              Open connection →
            </Link>
            {canResolve && open.state === "PENDING" && (
              <ResolveForm request={open} onDone={() => setOpenId(null)} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
