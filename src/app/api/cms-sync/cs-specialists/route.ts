import { auth } from "@/auth";
import { runCmsCsSync } from "@/lib/cms-sync/cs-sync";

// Admin-only — unlike the connection sync, this creates user accounts and
// re-routes which CS sees which clients.
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { report, notes } = await runCmsCsSync((phase, done, total) =>
          send({ type: "progress", phase, done, total }),
        );
        send({ type: "done", report, notes });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
