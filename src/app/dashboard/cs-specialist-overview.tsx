import Link from "next/link";
import { CsStatusTable } from "@/components/cs-status-table";
import { CsClientTable } from "@/components/cs-client-table";
import { formatWeekRange } from "@/lib/period";
import { loadCsBook } from "@/lib/cs-book";
import { countPendingStatusRequests } from "@/lib/status-requests";
import type { ScopingSession } from "@/lib/connection-scope";
import { CustomerStatus, PerformanceStatus } from "@/generated/prisma/enums";

export const STATUS_TILES = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", style: "border-success/30 text-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", style: "border-warning/30 text-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", style: "border-danger/30 text-danger" },
] as const;

export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

export function PendingRequestsTile({ count }: { count: number }) {
  return (
    <Link
      href="/dashboard/status-requests"
      className={`rounded-xl border bg-surface p-4 transition hover:bg-surface-hover ${
        count > 0 ? "border-accent/40 text-accent" : "border-surface-border"
      }`}
    >
      <div className="text-3xl font-semibold">{count}</div>
      <div className="mt-1 text-sm">Pending Status Requests</div>
    </Link>
  );
}

/**
 * CS_SPECIALIST's dashboard — their own client book (CsClientAssignment,
 * synced from the CMS's Customers.AssignedSpecialist) and this week's KPI
 * standing of every live VA connection under those clients.
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

  const activeClients = clientRows.filter((r) => r.status === CustomerStatus.ACTIVE).length;
  const weekLabel = formatWeekRange(weeklyStart);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile value={activeClients} label="Active Clients" />
        <StatTile value={connectionRows.length} label="Live VA Connections" />
        <PendingRequestsTile count={pendingRequests} />
        {STATUS_TILES.map((tile) => (
          <div key={tile.status} className={`rounded-xl border bg-surface p-4 ${tile.style}`}>
            <div className="text-3xl font-semibold">
              {connectionRows.filter((r) => r.status === tile.status).length}
            </div>
            <div className="mt-1 text-sm">{tile.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">My Clients</h2>
        <CsClientTable rows={clientRows} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase">VA Connections — {weekLabel}</h2>
        <CsStatusTable rows={connectionRows} weekLabel={weekLabel} />
      </div>
    </div>
  );
}
