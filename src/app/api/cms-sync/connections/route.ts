import { auth } from "@/auth";
import { runCmsConnectionSync } from "@/lib/cms-sync/connection-sync";

// Broader than the legacy-sync routes (Admin-only): DM and OPS_MANAGER can
// also pull new Connection IDs in from the CMS, per the user's explicit
// request — this button is meant to be usable from the Connections page
// too, which those roles already manage within their own department.
const ALLOWED_ROLES = new Set(["ADMIN", "DM", "OPS_MANAGER"]);

export async function POST() {
  const session = await auth();
  if (!session?.user?.role || !ALLOWED_ROLES.has(session.user.role)) {
    return Response.json({ error: "Admin, DM, or Operations Manager only." }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const report = await runCmsConnectionSync(session.user!.id, (phase, done, total) =>
          send({ type: "progress", phase, done, total }),
        );
        send({ type: "done", report });
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
