"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TicketNotification } from "@/lib/realtime";
import { dispatchTicketLive } from "@/lib/ticket-live-bus";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

function describeTicketEvent(payload: TicketNotification): string {
  switch (payload.kind) {
    case "created":
      return `New ticket from ${payload.actorName}: "${payload.subject}"`;
    case "message":
      return `${payload.actorName} replied to "${payload.subject}"`;
    case "status":
      return `"${payload.subject}" is now ${TICKET_STATUS_LABELS[payload.status]}`;
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
 */
export function TicketNotificationListener() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const source = new EventSource("/api/notifications/tickets/stream");

    source.onmessage = (e) => {
      const payload = JSON.parse(e.data) as TicketNotification;
      if (dispatchTicketLive(payload)) return;
      toast(
        describeTicketEvent(payload),
        payload.kind === "status" && payload.status === "CLOSED" ? "success" : "info",
      );
      router.refresh();
    };

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
