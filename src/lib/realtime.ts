import { EventEmitter } from "events";
import type { TicketStatus } from "@/generated/prisma/enums";
import type { SystemMessage } from "@/lib/settings";

export type SubmissionNotification = {
  connectionId: string;
  clientName: string;
  departmentName: string;
  period: string;
  cluster?: string;
  submittedAt: string;
  // Computed once at emit time (see getSubmissionWatcherIds) rather than
  // re-derived per listener — every SSE connection just checks membership.
  recipientIds: string[];
};

// Single Node process (no Redis/queue in this stack — see rate-limit.ts),
// so an in-memory emitter is enough to fan events out to every open SSE
// connection. Stashed on globalThis for the same reason as lib/prisma.ts's
// client: `next dev`'s module reloads would otherwise spawn a fresh emitter
// (and drop existing listeners) on every edit.
const globalForEvents = globalThis as unknown as {
  submissionEmitter: EventEmitter | undefined;
};

export const submissionEmitter = globalForEvents.submissionEmitter ?? new EventEmitter();
// Unbounded — one listener per open manager dashboard tab, not a leak.
submissionEmitter.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForEvents.submissionEmitter = submissionEmitter;
}

const SUBMISSION_EVENT = "submission";

export function emitSubmissionNotification(payload: SubmissionNotification) {
  submissionEmitter.emit(SUBMISSION_EVENT, payload);
}

export function onSubmissionNotification(listener: (payload: SubmissionNotification) => void) {
  submissionEmitter.on(SUBMISSION_EVENT, listener);
  return () => submissionEmitter.off(SUBMISSION_EVENT, listener);
}

export type TicketNotification = {
  ticketId: string;
  subject: string;
  kind: "created" | "message" | "status";
  status: TicketStatus;
  actorName: string;
  createdAt: string;
  // Full message payload for kind "message" — lets an open TicketThread
  // (see ticket-live-bus.ts) append it directly without a refetch. Absent
  // for "created"/"status", which have nothing extra to render inline.
  message?: {
    id: string;
    senderId: string;
    senderName: string;
    body: string;
    attachmentUrl: string | null;
  };
  // Computed once at emit time (see getTicketWatcherIds) — same reasoning as
  // SubmissionNotification.recipientIds above.
  recipientIds: string[];
};

// Separate emitter from submissionEmitter — tickets have a different
// recipient shape (every role can be a participant, not just managers) and
// keeping the two independent avoids the submission code path having to
// know anything about tickets.
const globalForTicketEvents = globalThis as unknown as {
  ticketEmitter: EventEmitter | undefined;
};

export const ticketEmitter = globalForTicketEvents.ticketEmitter ?? new EventEmitter();
ticketEmitter.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForTicketEvents.ticketEmitter = ticketEmitter;
}

const TICKET_EVENT = "ticket";

export function emitTicketNotification(payload: TicketNotification) {
  ticketEmitter.emit(TICKET_EVENT, payload);
}

export function onTicketNotification(listener: (payload: TicketNotification) => void) {
  ticketEmitter.on(TICKET_EVENT, listener);
  return () => ticketEmitter.off(TICKET_EVENT, listener);
}

// Broadcast to every signed-in user — unlike submissions/tickets there's no
// recipient scoping, so no recipientIds field is needed here.
const globalForSystemMessageEvents = globalThis as unknown as {
  systemMessageEmitter: EventEmitter | undefined;
};

export const systemMessageEmitter =
  globalForSystemMessageEvents.systemMessageEmitter ?? new EventEmitter();
systemMessageEmitter.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForSystemMessageEvents.systemMessageEmitter = systemMessageEmitter;
}

const SYSTEM_MESSAGE_EVENT = "system-message";

export function emitSystemMessageNotification(payload: SystemMessage) {
  systemMessageEmitter.emit(SYSTEM_MESSAGE_EVENT, payload);
}

export function onSystemMessageNotification(listener: (payload: SystemMessage) => void) {
  systemMessageEmitter.on(SYSTEM_MESSAGE_EVENT, listener);
  return () => systemMessageEmitter.off(SYSTEM_MESSAGE_EVENT, listener);
}
