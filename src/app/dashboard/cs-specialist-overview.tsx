import { CsDashboard } from "@/components/cs-dashboard";
import { formatWeekRange } from "@/lib/period";
import { loadCsBook } from "@/lib/cs-book";
import { countPendingStatusRequests } from "@/lib/status-requests";
import type { ScopingSession } from "@/lib/connection-scope";

/**
 * CS_SPECIALIST's dashboard — their own client book (CsClientAssignment,
 * synced from the CMS's Customers.AssignedSpecialist) and this week's KPI
 * standing of every live VA connection under those clients. Tiles and
 * client rows open drill-downs (see CsDashboard).
 */
export async function CsSpecialistOverview({
  session,
  weeklyStart,
}: {
  session: ScopingSession;
  weeklyStart: Date;
}) {
  const [{ clientRows, connectionRows }, pendingRequests] = await Promise.all([
    loadCsBook({ csUserId: session.id, isActive: true }, weeklyStart),
    countPendingStatusRequests(session),
  ]);

  return (
    <CsDashboard
      mode="specialist"
      clientRows={clientRows}
      connectionRows={connectionRows}
      pendingCount={pendingRequests}
      weekLabel={formatWeekRange(weeklyStart)}
    />
  );
}
