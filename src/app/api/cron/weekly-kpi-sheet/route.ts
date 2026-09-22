import { NextRequest } from "next/server";
import { runWeeklyKpiSheetExport } from "@/lib/weekly-kpi-sheet";

// Invoked by Vercel Cron on the schedule in vercel.json, which sends
// `Authorization: Bearer ${CRON_SECRET}` — reject anything else so this
// URL can't be used by a third party to force an off-schedule export.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyKpiSheetExport();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
