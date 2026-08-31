"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TicketNotification } from "@/lib/realtime";
import { dispatchTicketLive } from "@/lib/ticket-live-bus";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

const POLL_INTERVAL_MS = 90_000;

/**
 * How far back a resuming tab is allowed to look. These toasts are a "just
 * happened" nudge, not a durable inbox — Inbox/Tickets are the source of
 * truth for anything older. Without this clamp, a tab that sat hidden
 * overnight would come back and dump every event since it was last visible
 * as a burst of toasts.
 */
const MAX_CATCHUP_MS = 5 * 60_000;

/**
 * Floor on how soon a resume can trigger its catch-up poll. Becoming visible
 * polls immediately, and someone working in another app while referencing the
 * dashboard can alt-tab back dozens of times an hour — without this, that
 * pattern alone would out-request the fixed timer this replaced, which is the
 * whole thing the visibility gate exists to avoid. Well under the interval, so
 * a normal return still feels instant.
 */
const MIN_POLL_GAP_MS = 15_000;

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
 * billed as continuous compute time on Vercel.
 *
 * The poll only runs while the tab is actually visible, and fires once
 * immediately on becoming visible again. Trading the timer for a
 * visibilitychange listener is what makes the polling affordable: on a fixed
 * interval this ran around the clock, so a tab left open overnight or over a
 * weekend billed ~80 invocations an hour to notify nobody, and the two
 * dashboard pollers together accounted for essentially the project's whole
 * Vercel invocation quota. It also reads *better* than the old fixed timer —
 * returning to the tab surfaces anything waiting right away instead of up to
 * one interval later — which is why the interval could be relaxed to 90s.
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
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastPollAt = 0;

    const poll = async () => {
      lastPollAt = Date.now();
      // A tab that's been hidden for a while has a stale `since`; don't ask
      // the server for (or toast) more history than MAX_CATCHUP_MS.
      const floor = Date.now() - MAX_CATCHUP_MS;
      if (Date.parse(since) < floor) since = new Date(floor).toISOString();

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

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const start = () => {
      if (interval) return;
      if (Date.now() - lastPollAt >= MIN_POLL_GAP_MS) poll();
      interval = setInterval(poll, POLL_INTERVAL_MS);
    };

    const syncToVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    // Covers the initial mount too: a tab restored in the background (e.g.
    // a session restore) shouldn't start polling until it's actually looked at.
    syncToVisibility();
    document.addEventListener("visibilitychange", syncToVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", syncToVisibility);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
