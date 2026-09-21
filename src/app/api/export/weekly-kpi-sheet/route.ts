import { auth } from "@/auth";
import { runWeeklyKpiSheetExport } from "@/lib/weekly-kpi-sheet";

// Admin-only manual trigger for the same refresh the Monday cron runs —
// lets an admin pull last week's numbers in immediately without waiting.
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Only admins can refresh this sheet." }, { status: 403 });
  }

  try {
    const result = await runWeeklyKpiSheetExport();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
