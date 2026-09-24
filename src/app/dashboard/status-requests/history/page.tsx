import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusRequestsTable } from "@/components/status-requests-table";
import { requireSession } from "@/lib/connection-scope";
import { loadStatusRequestRows, STATUS_REQUEST_VIEWER_ROLES } from "@/lib/status-requests";
import { StatusChangeRequestState } from "@/generated/prisma/enums";

export default async function StatusRequestHistoryPage() {
  const session = await requireSession();
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
      <StatusRequestsTable rows={rows} mode="history" canResolve={false} />
    </>
  );
}
