import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { LifetimeValueTables, type LifetimeValueCustomer } from "@/components/lifetime-value-tables";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { daysSince, formatDuration, currentPeriodStart } from "@/lib/period";
import { getWeekStartDay, getInterventionTypes } from "@/lib/settings";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

// Worst-first rollup, mirroring legacy getLifetimeValueReport()'s customer
// perfStatus rank (Critical > At Risk > On Target > No Data).
const PERF_RANK: Record<PerformanceStatus, number> = {
  [PerformanceStatus.CRITICAL]: 4,
  [PerformanceStatus.AT_RISK]: 3,
  [PerformanceStatus.ON_TARGET]: 2,
  [PerformanceStatus.NO_DATA]: 1,
};

type Customer = LifetimeValueCustomer & {
  department: string;
  totalConnections: number;
};

export default async function LifetimeValuePage(
  props: PageProps<"/dashboard/reports/lifetime-value">,
) {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const searchParams = await props.searchParams;
  const sort = searchParams.sort === "asc" ? "asc" : "desc";

  // Rows here open the same "KPI Submissions" modal as the Performance
  // page's Per Connection tab — mirrors that page's isManager gate (who can
  // log an intervention from the modal) and its WEEKLY-current-period
  // default, since Lifetime Value has no period selector of its own.
  const isManager =
    session.role === "ADMIN" ||
    session.role === "DM" ||
    session.role === "OPS_MANAGER" ||
    session.role === "OM";
  const weekStartDay = await getWeekStartDay();
  const periodStart = currentPeriodStart(KpiPeriod.WEEKLY, new Date(), weekStartDay);
  const interventionTypes = await getInterventionTypes();

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      department: { select: { name: true } },
      performanceSummaries: {
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = connections.map((c) => ({
    connectionId: c.id,
    clientName: c.clientName,
    secondaryName: c.secondaryName,
    department: c.department.name,
    status: c.status,
    tenureDays: daysSince(c.startDate ?? c.createdAt),
    latestStatus: c.performanceSummaries[0]?.status ?? PerformanceStatus.NO_DATA,
  }));

  const customerMap = new Map<string, Customer>();
  for (const row of rows) {
    const existing = customerMap.get(row.clientName);
    const cust: Customer = existing ?? {
      clientName: row.clientName,
      secondaryName: row.secondaryName,
      department: row.department,
      activeConnections: 0,
      totalConnections: 0,
      maxDays: 0,
      longestStatus: row.status,
      perfStatus: PerformanceStatus.NO_DATA,
      // Whichever connection is currently longest-running for this client —
      // the row's "KPI Submissions" click target, kept in sync with maxDays
      // below since a client can have several connections (one per service).
      sampleConnectionId: row.connectionId,
    };
    cust.totalConnections += 1;
    if (row.status === ConnectionStatus.ACTIVE) cust.activeConnections += 1;
    if (row.tenureDays > cust.maxDays) {
      cust.maxDays = row.tenureDays;
      cust.longestStatus = row.status;
      cust.sampleConnectionId = row.connectionId;
    }
    if (PERF_RANK[row.latestStatus] > PERF_RANK[cust.perfStatus]) {
      cust.perfStatus = row.latestStatus;
    }
    customerMap.set(row.clientName, cust);
  }
  const customers = Array.from(customerMap.values());

  const totalConnections = rows.length;
  const activeNow = rows.filter((r) => r.status === ConnectionStatus.ACTIVE).length;
  const avgDays = customers.length
    ? Math.round(customers.reduce((sum, c) => sum + c.maxDays, 0) / customers.length)
    : 0;
  const longestDays = customers.length ? Math.max(...customers.map((c) => c.maxDays)) : 0;

  const allClients = [...customers].sort((a, b) =>
    sort === "asc" ? a.maxDays - b.maxDays : b.maxDays - a.maxDays,
  );
  const top10Longest = [...customers]
    .filter((c) => c.maxDays > 0)
    .sort((a, b) => b.maxDays - a.maxDays)
    .slice(0, 10);
  const top10Shortest = [...customers]
    .filter((c) => c.maxDays > 0 && c.activeConnections > 0)
    .sort((a, b) => a.maxDays - b.maxDays)
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Lifetime Value"
        description="Tenure and retention per client connection."
      />

      {rows.length > 0 && (
        <a
          href="/api/export/lifetime-value"
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      {rows.length === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{totalConnections}</div>
              <div className="mt-1 text-sm text-muted">Total Connections</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{activeNow}</div>
              <div className="mt-1 text-sm text-muted">Active Now</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-lg font-semibold">{formatDuration(avgDays)}</div>
              <div className="mt-1 text-sm text-muted">Avg Duration</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-lg font-semibold">{formatDuration(longestDays)}</div>
              <div className="mt-1 text-sm text-muted">Longest Client</div>
            </div>
          </div>

          <LifetimeValueTables
            allClients={allClients}
            top10Longest={top10Longest}
            top10Shortest={top10Shortest}
            sort={sort}
            periodStart={periodStart.toISOString()}
            period={KpiPeriod.WEEKLY}
            isManager={isManager}
            interventionTypes={interventionTypes}
          />
        </div>
      )}
    </>
  );
}
