"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TicketNotification } from "@/lib/realtime";
import { dispatchTicketLive } from "@/lib/ticket-live-bus";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

function describeTicketEvent(payload: TicketNotification): { title: string; message: string } {
  switch (payload.kind) {
    case "created":
      return { title: "New ticket", message: `${payload.actorName} — "${payload.subject}"` };
    case "message":
      return { title: `${payload.actorName} replied`, message: `"${payload.subject}"` };
    case "status":
      return {
        title: "Ticket updated",
        message: `"${payload.subject}" is now ${TICKET_STATUS_LABELS[payload.status]}`,
      };
  }
}

/**
 * Opens the SSE feed from /api/notifications/tickets/stream. Every signed-in
 * role can be a ticket participant (unlike submissions, which only managers
 * watch), so this is mounted unconditionally in the dashboard layout. If the
 * event's ticket is currently open in a TicketThread on this tab (see
 * ticket-live-bus.ts), that thread appends it directly instead — otherwise
 * this pops a toast and refreshes the current route so Inbox/Tickets list
 * rows and counts go live.
 *
 * The refresh is debounced: a burst of events (e.g. several messages landing
 * within a second or two) collapses into a single router.refresh() instead
 * of one per event, since each refresh re-runs every server component on
 * the current route (see the dashboard overview queries this feeds into).
 */
export function TicketNotificationListener() {
  const router = useRouter();
  const { toast } = useToast();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/notifications/tickets/stream");

    source.onmessage = (e) => {
      const payload = JSON.parse(e.data) as TicketNotification;
      if (dispatchTicketLive(payload)) return;
      const { title, message } = describeTicketEvent(payload);
      toast(
        message,
        payload.kind === "status" && payload.status === "CLOSED" ? "success" : "info",
        { title, onClick: () => router.push(`/dashboard/dev/tickets/${payload.ticketId}`) },
      );
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 1500);
    };

    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
