import { NextRequest } from "next/server";
import { requireSession } from "@/lib/connection-scope";
import { onSystemMessageNotification } from "@/lib/realtime";
import type { SystemMessage } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed for the admin-configured system message banner
 * (System Settings). Every signed-in user is a recipient — no scoping, so
 * unlike the submission/ticket streams there's no recipientIds filter here.
 */
export async function GET(request: NextRequest) {
  await requireSession();

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SystemMessage) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const unsubscribe = onSystemMessageNotification(send);

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
