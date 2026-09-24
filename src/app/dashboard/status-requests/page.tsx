import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { StatusRequestsTable } from "@/components/status-requests-table";
import { requireSession } from "@/lib/connection-scope";
import { loadStatusRequestRows, STATUS_REQUEST_VIEWER_ROLES } from "@/lib/status-requests";
import { StatusChangeRequestState } from "@/generated/prisma/enums";

export default async function StatusRequestsPage() {
  const [session, real] = await Promise.all([requireSession(), auth()]);
  if (!STATUS_REQUEST_VIEWER_ROLES.has(session.role)) redirect("/dashboard");

  const rows = await loadStatusRequestRows(session, [StatusChangeRequestState.PENDING]);
  // Resolving is checked against the REAL role in the actions themselves —
  // an admin previewing as a CS can still act (as the admin), an Executive
  // never can.
  const realRole = real?.user?.role;
  const canResolve = realRole === "CS_SPECIALIST" || realRole === "CS_MANAGER" || realRole === "ADMIN";

  return (
    <>
      <PageHeader
        title="Status Requests"
        description="Status changes requested by managers for your clients' connections. Approving applies the change to the connection."
      />
      <StatusRequestsTable rows={rows} mode="pending" canResolve={canResolve} />
    </>
  );
}
