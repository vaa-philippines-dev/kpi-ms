import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { createPublicSheet } from "@/lib/sheets-export";
import { SUBMISSIONS_SHEET_HEADERS, buildSubmissionsSheetRows } from "@/lib/submissions-sheet-export";

// Admin-only: this creates a real file (under the shared service account)
// that anyone with its link can view, so it's gated the same way other
// account-wide generate/sync actions in system settings are.
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return Response.json({ error: "Only admins can generate this sheet." }, { status: 403 });
  }

  const rows = await buildSubmissionsSheetRows();
  const title = `KPI Submissions Export — ${new Date().toISOString().slice(0, 10)}`;

  let url: string;
  try {
    url = await createPublicSheet(title, SUBMISSIONS_SHEET_HEADERS, rows);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  await logActivity(prisma, {
    actor: { id: session!.user!.id, role: session!.user!.role },
    action: "CREATE",
    entityType: "SubmissionsSheet",
    entityId: title,
    entityLabel: title,
    summary: `Generated a Google Sheet of ${rows.length} submission record${rows.length === 1 ? "" : "s"}`,
  });

  return Response.json({ url, rowCount: rows.length });
}
