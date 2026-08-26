import { NextRequest } from "next/server";
import { requireSession, SUBMISSION_WATCHER_ROLES } from "@/lib/connection-scope";
import { onSubmissionNotification, type SubmissionNotification } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed of real-time submission notifications, scoped to
 * this session's department/team the same way every other view in the app
 * is (see getSubmissionWatcherIds) — the filtering happens server-side per
 * event, so a connection never sees a payload outside its own scope even
 * transiently.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!SUBMISSION_WATCHER_ROLES.includes(session.role as (typeof SUBMISSION_WATCHER_ROLES)[number])) {
    return new Response(null, { status: 204 });
  }

  const encoder = new TextEncoder();
  // Cleanup can be triggered two ways — the request's abort signal (a
  // client disconnect) or the stream's own cancel() (the platform tearing
  // down the response) — and either can fire first, so it's guarded to run
  // only once instead of double-unsubscribing.
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SubmissionNotification) => {
        if (!event.recipientIds.includes(session.id)) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const unsubscribe = onSubmissionNotification(send);

      // Keeps intermediary proxies/load balancers from closing an
      // otherwise-idle connection, and lets the client detect a dead stream.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25000);

      cleanup = () => {
        cleanup = null;
        unsubscribe();
        clearInterval(heartbeat);
      };
      request.signal.addEventListener("abort", () => {
        cleanup?.();
        controller.close();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
