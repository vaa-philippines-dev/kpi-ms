import { NextRequest } from "next/server";
import { requireSession } from "@/lib/connection-scope";
import { onTicketNotification, type TicketNotification } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed of real-time ticket notifications. Unlike the
 * submission stream (src/app/api/notifications/stream/route.ts), there's no
 * role gate here — any signed-in user can be a ticket participant (creator,
 * ADMIN triaging the Inbox, or a DM/OPS_MANAGER/OM watching their scope) —
 * getTicketWatcherIds (src/lib/ticket-scope.ts) decides who actually
 * receives a given event via recipientIds, filtered server-side per event.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: TicketNotification) => {
        if (!event.recipientIds.includes(session.id)) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const unsubscribe = onTicketNotification(send);

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
