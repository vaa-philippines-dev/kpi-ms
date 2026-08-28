"use client";

import type { TicketNotification } from "@/lib/realtime";

type Handler = (event: TicketNotification) => void;

// Per-tab, in-memory fan-out from TicketNotificationListener's poll loop to
// whichever TicketThread (if any) currently has that ticket open — lets an
// open thread append live instead of a jarring toast+router.refresh() while
// someone's mid-conversation. Not React state; a plain module-level map is
// enough since there's at most one thread open per tab at a time.
const handlers = new Map<string, Set<Handler>>();

export function subscribeToTicketLive(ticketId: string, handler: Handler): () => void {
  if (!handlers.has(ticketId)) handlers.set(ticketId, new Set());
  handlers.get(ticketId)!.add(handler);
  return () => {
    const set = handlers.get(ticketId);
    set?.delete(handler);
    if (set && set.size === 0) handlers.delete(ticketId);
  };
}

/** Returns true if an open thread consumed this event (caller should skip its own toast/refresh). */
export function dispatchTicketLive(event: TicketNotification): boolean {
  const set = handlers.get(event.ticketId);
  if (!set || set.size === 0) return false;
  set.forEach((handler) => handler(event));
  return true;
}
