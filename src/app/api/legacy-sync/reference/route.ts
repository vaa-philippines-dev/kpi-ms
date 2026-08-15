import { auth } from "@/auth";
import { runReferenceSync } from "@/lib/legacy-sync/reference-sync";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const report = await runReferenceSync(session.user.id);
    return Response.json({ report });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
