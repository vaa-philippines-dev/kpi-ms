import { auth } from "@/auth";
import { runPerformanceSync } from "@/lib/legacy-sync/performance-sync";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  // Optional ?dryRun=1 — runs the full read/match/report pipeline with
  // every write skipped, so an admin can see exactly what a real run would
  // create/update before committing to it.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const report = await runPerformanceSync(
          (phase, done, total) => send({ type: "progress", phase, done, total }),
          { dryRun },
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
