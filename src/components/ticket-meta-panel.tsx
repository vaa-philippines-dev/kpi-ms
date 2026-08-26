"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateTicketStatus, updateTicketMeta } from "@/app/dashboard/dev/actions";
import { subscribeToTicketLive } from "@/lib/ticket-live-bus";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_TONE,
  TICKET_PRIORITY_TONE,
} from "@/lib/ticket-labels";
import { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

/**
 * Read-only for everyone, editable status/priority/category selects for
 * ADMIN only (enforced server-side too, in dev/actions.ts — this is just
 * the UI gate). Subscribes to the same live bus as TicketThread
 * (ticket-live-bus.ts) so a status change from elsewhere (e.g. the actor's
 * own action, or another tab) reflects here without a page refresh.
 */
export function TicketMetaPanel({
  ticketId,
  subject,
  requesterName,
  requesterRole,
  createdAt,
  status: initialStatus,
  priority: initialPriority,
  category: initialCategory,
  canModerate,
}: {
  ticketId: string;
  subject: string;
  requesterName: string;
  requesterRole: string;
  createdAt: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  canModerate: boolean;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [category, setCategory] = useState(initialCategory);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    return subscribeToTicketLive(ticketId, (event) => {
      if (event.kind === "status") setStatus(event.status);
    });
  }, [ticketId]);

  async function handleStatusChange(next: TicketStatus) {
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    try {
      await updateTicketStatus(ticketId, next);
    } catch (e) {
      setStatus(previous);
      toast(e instanceof Error ? e.message : "Failed to update status.", "error");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handlePriorityChange(next: TicketPriority) {
    const previous = priority;
    setPriority(next);
    setSavingMeta(true);
    try {
      await updateTicketMeta(ticketId, { priority: next });
    } catch (e) {
      setPriority(previous);
      toast(e instanceof Error ? e.message : "Failed to update ticket.", "error");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleCategoryChange(next: TicketCategory) {
    const previous = category;
    setCategory(next);
    setSavingMeta(true);
    try {
      await updateTicketMeta(ticketId, { category: next });
    } catch (e) {
      setCategory(previous);
      toast(e instanceof Error ? e.message : "Failed to update ticket.", "error");
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="w-full shrink-0 space-y-4 rounded-2xl border border-surface-border bg-surface p-5 xl:w-72">
      <div>
        <p className="text-xs font-medium text-muted uppercase">Subject</p>
        <p className="mt-1 text-sm font-medium">{subject}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted uppercase">Requester</p>
        <p className="mt-1 text-sm">
          {requesterName} <span className="text-muted">· {requesterRole}</span>
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted uppercase">Opened</p>
        <p className="mt-1 text-sm text-muted">{new Date(createdAt).toLocaleString()}</p>
      </div>

      <div className="space-y-4 border-t border-surface-border pt-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted uppercase">Status</p>
          {canModerate ? (
            <Select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
              disabled={savingStatus}
              className="w-full"
            >
              {Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone={TICKET_STATUS_TONE[status]}>{TICKET_STATUS_LABELS[status]}</Badge>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted uppercase">Priority</p>
          {canModerate ? (
            <Select
              value={priority}
              onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
              disabled={savingMeta}
              className="w-full"
            >
              {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone={TICKET_PRIORITY_TONE[priority]}>{TICKET_PRIORITY_LABELS[priority]}</Badge>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted uppercase">Category</p>
          {canModerate ? (
            <Select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as TicketCategory)}
              disabled={savingMeta}
              className="w-full"
            >
              {Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm">{TICKET_CATEGORY_LABELS[category]}</p>
          )}
        </div>
      </div>
    </div>
  );
}
