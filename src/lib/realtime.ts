import { EventEmitter } from "events";

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
