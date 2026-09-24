"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_TONE,
  TERMINAL_CONNECTION_STATUSES,
} from "@/lib/connection-labels";
import { ConnectionStatus } from "@/generated/prisma/enums";
import {
  createStatusChangeRequest,
  cancelStatusChangeRequest,
} from "@/app/dashboard/status-requests/actions";

export type PendingStatusRequest = {
  id: string;
  requestedStatus: ConnectionStatus;
  reason: string;
  requestedByName: string;
  createdAt: string;
  canCancel: boolean;
};

/** Top-right trigger in the connection detail modal. */
export function RequestStatusChangeButton({
  onClick,
  disabled,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="gap-1.5 px-3 py-1.5 text-xs"
    >
      <ArrowLeftRight className="size-3.5" />
      Request status change
    </Button>
  );
}

/** Shown in place of the form while a request is still waiting on the CS. */
export function PendingStatusRequestBanner({
  request,
  currentStatus,
  csNames,
}: {
  request: PendingStatusRequest;
  currentStatus: ConnectionStatus;
  csNames: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          Status change requested:
          <Badge tone={CONNECTION_STATUS_TONE[currentStatus]}>{CONNECTION_STATUS_LABELS[currentStatus]}</Badge>
          <ArrowRight className="size-3 text-muted" />
          <Badge tone={CONNECTION_STATUS_TONE[request.requestedStatus]}>
            {CONNECTION_STATUS_LABELS[request.requestedStatus]}
          </Badge>
        </p>
        <p className="text-xs text-muted">
          By {request.requestedByName} on {new Date(request.createdAt).toLocaleDateString()} · waiting on{" "}
          {csNames ?? "an admin (no CS assigned to this client)"}
        </p>
        <p className="text-xs whitespace-pre-wrap">&ldquo;{request.reason}&rdquo;</p>
      </div>
      {request.canCancel && (
        <Button
          type="button"
          variant="outline"
          loading={isPending}
          className="px-3 py-1.5 text-xs"
          onClick={() => {
            const formData = new FormData();
            formData.set("requestId", request.id);
            startTransition(async () => {
              try {
                await cancelStatusChangeRequest(formData);
                toast("Request cancelled.", "success");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Something went wrong.", "error");
              }
            });
          }}
        >
          Cancel request
        </Button>
      )}
    </div>
  );
}

/**
 * The request form itself — routed to the CS Specialist assigned to this
 * connection's client (their Status Requests tab), who approves or rejects.
 */
export function StatusRequestForm({
  connectionId,
  currentStatus,
  csNames,
  onDone,
}: {
  connectionId: string;
  currentStatus: ConnectionStatus;
  csNames: string | null;
  onDone: () => void;
}) {
  const options = Object.values(ConnectionStatus).filter((s) => s !== currentStatus);
  const [status, setStatus] = useState<ConnectionStatus>(options[0]);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          try {
            await createStatusChangeRequest(formData);
            toast("Status change requested — sent to the client's CS Specialist.", "success");
            onDone();
          } catch (err) {
            toast(err instanceof Error ? err.message : "Something went wrong.", "error");
          }
        })
      }
      className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <input type="hidden" name="connectionId" value={connectionId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Request status change</p>
        <p className="text-xs text-muted">
          Goes to: <span className="text-foreground">{csNames ?? "an admin (no CS assigned to this client)"}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted uppercase">Change to</label>
          <Select
            name="requestedStatus"
            value={status}
            onChange={(e) => setStatus(e.target.value as ConnectionStatus)}
            className="w-full py-1.5"
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {CONNECTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {TERMINAL_CONNECTION_STATUSES.has(status) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">End date</label>
            <Input name="effectiveDate" type="date" defaultValue={today} className="w-full" />
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted uppercase">Reason (required)</label>
        <Textarea
          name="reason"
          rows={2}
          required
          placeholder="e.g. Client asked to pause for 2 weeks while they restock…"
          className="w-full"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} className="px-3 py-1.5 text-xs">
          Cancel
        </Button>
        <Button type="submit" loading={isPending} className="px-3 py-1.5 text-xs">
          Send request
        </Button>
      </div>
    </form>
  );
}
