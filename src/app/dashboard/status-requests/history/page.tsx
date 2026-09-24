import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { StatusRequestsTable } from "@/components/status-requests-table";
import { requireSession } from "@/lib/connection-scope";
import { loadStatusRequestRows, STATUS_REQUEST_VIEWER_ROLES } from "@/lib/status-requests";
import { StatusChangeRequestState } from "@/generated/prisma/enums";

export default async function StatusRequestHistoryPage() {
  const [session, real] = await Promise.all([requireSession(), auth()]);
  if (!STATUS_REQUEST_VIEWER_ROLES.has(session.role)) redirect("/dashboard");

  const rows = await loadStatusRequestRows(session, [
    StatusChangeRequestState.APPROVED,
    StatusChangeRequestState.REJECTED,
    StatusChangeRequestState.CANCELLED,
  ]);

  return (
    <>
      <PageHeader
        title="History"
        description="Every resolved status request for your clients: approved, rejected, or cancelled, with who handled it and when."
      />
      <StatusRequestsTable
        rows={rows}
        mode="history"
        canResolve={false}
        // The REAL role, so an admin previewing as a CS still gets it, and an
        // Executive (read-only admin) never does.
        canDelete={real?.user?.role === "ADMIN"}
      />
    </>
  );
}
