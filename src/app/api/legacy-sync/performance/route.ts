import { auth } from "@/auth";
import { runPerformanceSync } from "@/lib/legacy-sync/performance-sync";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const report = await runPerformanceSync();
    return Response.json({ report });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
