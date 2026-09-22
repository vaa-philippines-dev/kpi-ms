import { prisma } from "@/lib/prisma";
import { KpiPeriod } from "@/generated/prisma/enums";
import { createPublicSheet, updatePublicSheet } from "@/lib/sheets-export";
import { SUBMISSIONS_SHEET_HEADERS, buildSubmissionsSheetRows } from "@/lib/submissions-sheet-export";
import { currentPeriodStart, addDays, toDateParam } from "@/lib/period";
import { getWeekStartDay, getWeeklyKpiSheetId, setWeeklyKpiSheetId } from "@/lib/settings";

const SPREADSHEET_TITLE = "KPI Submissions — Weekly Export";

function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

function extractSpreadsheetId(url: string): string | null {
  return url.match(/\/d\/([^/]+)/)?.[1] ?? null;
}

/**
 * Refreshes the standing "weekly KPI sheet" with the previous week's
 * submissions — same link every run (create once, then update that same
 * file in place) so a bookmarked link always shows the latest week rather
 * than going stale or multiplying into a new file each time. Driven by the
 * Monday cron route (api/cron/weekly-kpi-sheet) and by an admin's manual
 * "Refresh now" in Settings.
 */
export async function runWeeklyKpiSheetExport(): Promise<{ url: string; rowCount: number }> {
  const weekStartDay = await getWeekStartDay();
  const thisWeekStart = currentPeriodStart(KpiPeriod.WEEKLY, new Date(), weekStartDay);
  const lastWeekStart = addDays(thisWeekStart, -7);

  const rows = await buildSubmissionsSheetRows(KpiPeriod.WEEKLY, lastWeekStart);

  let spreadsheetId = await getWeeklyKpiSheetId();
  if (spreadsheetId) {
    try {
      await updatePublicSheet(spreadsheetId, SUBMISSIONS_SHEET_HEADERS, rows);
    } catch {
      // Most likely the file was removed from the Shared Drive out from
      // under us — fall through to creating a fresh one rather than leaving
      // the weekly export permanently broken.
      spreadsheetId = null;
    }
  }

  if (!spreadsheetId) {
    const url = await createPublicSheet(SPREADSHEET_TITLE, SUBMISSIONS_SHEET_HEADERS, rows);
    spreadsheetId = extractSpreadsheetId(url);
    if (spreadsheetId) await setWeeklyKpiSheetId(spreadsheetId);
  }

  await prisma.activityLog.create({
    data: {
      action: "UPDATE",
      entityType: "WeeklyKpiSheet",
      entityId: spreadsheetId ?? SPREADSHEET_TITLE,
      entityLabel: SPREADSHEET_TITLE,
      summary: `Refreshed the weekly KPI sheet (week of ${toDateParam(lastWeekStart)}) with ${rows.length} record${rows.length === 1 ? "" : "s"}`,
    },
  });

  return { url: spreadsheetId ? spreadsheetUrl(spreadsheetId) : "", rowCount: rows.length };
}
