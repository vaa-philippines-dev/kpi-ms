"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TicketNotification } from "@/lib/realtime";
import { dispatchTicketLive } from "@/lib/ticket-live-bus";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

const POLL_INTERVAL_MS = 45_000;

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
 * Polls /api/notifications/tickets/poll. Every signed-in role can be a
 * ticket participant (unlike submissions, which only managers watch), so
 * this is mounted unconditionally in the dashboard layout. If the event's
 * ticket is currently open in a TicketThread on this tab (see
 * ticket-live-bus.ts), that thread appends it directly instead — otherwise
 * this pops a toast and refreshes the current route so Inbox/Tickets list
 * rows and counts go live.
 *
 * Polling (not an SSE push) so each check is a millisecond-scale request
 * instead of a connection held open for the life of the tab — the latter is
 * billed as continuous compute time on Vercel and was burning the plan's
 * function-duration quota with tabs left open all day.
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
    let cancelled = false;
    let since = new Date().toISOString();

    const poll = async () => {
      let data: { events: TicketNotification[]; serverTime: string };
      try {
        const res = await fetch(`/api/notifications/tickets/poll?since=${encodeURIComponent(since)}`);
        if (!res.ok) return;
        data = await res.json();
      } catch {
        return;
      }
      if (cancelled) return;
      since = data.serverTime;

      let sawUnhandledEvent = false;
      for (const payload of data.events) {
        if (dispatchTicketLive(payload)) continue;
        sawUnhandledEvent = true;
        const { title, message } = describeTicketEvent(payload);
        toast(
          message,
          payload.kind === "status" && payload.status === "CLOSED" ? "success" : "info",
          { title, onClick: () => router.push(`/dashboard/dev/tickets/${payload.ticketId}`) },
        );
      }
      if (sawUnhandledEvent) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 1500);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
