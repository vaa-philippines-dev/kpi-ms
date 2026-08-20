import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { daysSince, formatDuration } from "@/lib/period";
import { ConnectionStatus, PerformanceStatus } from "@/generated/prisma/enums";

const CONNECTION_STATUS_TONE: Record<ConnectionStatus, "success" | "warning" | "danger" | "neutral"> = {
  [ConnectionStatus.ACTIVE]: "success",
  [ConnectionStatus.PAUSED]: "warning",
  [ConnectionStatus.PENDING]: "neutral",
  [ConnectionStatus.END_OF_CONTRACT]: "danger",
  [ConnectionStatus.END_OF_PROJECT]: "danger",
};

// Worst-first rollup, mirroring legacy getLifetimeValueReport()'s customer
// perfStatus rank (Critical > At Risk > On Target > No Data).
const PERF_RANK: Record<PerformanceStatus, number> = {
  [PerformanceStatus.CRITICAL]: 4,
  [PerformanceStatus.AT_RISK]: 3,
  [PerformanceStatus.ON_TARGET]: 2,
  [PerformanceStatus.NO_DATA]: 1,
};

type Customer = {
  clientName: string;
  secondaryName: string | null;
  department: string;
  activeConnections: number;
  totalConnections: number;
  maxDays: number;
  longestStatus: ConnectionStatus;
  perfStatus: PerformanceStatus;
};

export default async function LifetimeValuePage(
  props: PageProps<"/dashboard/reports/lifetime-value">,
) {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const searchParams = await props.searchParams;
  const sort = searchParams.sort === "asc" ? "asc" : "desc";

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      department: true,
      performanceSummaries: {
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = connections.map((c) => ({
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
    };
    cust.totalConnections += 1;
    if (row.status === ConnectionStatus.ACTIVE) cust.activeConnections += 1;
    if (row.tenureDays > cust.maxDays) {
      cust.maxDays = row.tenureDays;
      cust.longestStatus = row.status;
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

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">All Clients</h2>
                <p className="text-xs text-muted">
                  One row per client · {sort === "asc" ? "shortest" : "longest"} first
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <Link
                  href="?sort=desc"
                  className={`rounded-full px-2 py-1 ${sort === "desc" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
                >
                  Longest first
                </Link>
                <Link
                  href="?sort=asc"
                  className={`rounded-full px-2 py-1 ${sort === "asc" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
                >
                  Shortest first
                </Link>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Active</Th>
                    <Th>Longest Duration</Th>
                    <Th>Status</Th>
                    <Th>Performance</Th>
                  </tr>
                </TableHead>
                <tbody>
                  {allClients.map((c) => (
                    <Tr key={c.clientName}>
                      <Td>
                        <span className="font-medium text-accent">{c.clientName}</span>
                        {c.secondaryName && (
                          <div className="text-xs text-muted">{c.secondaryName}</div>
                        )}
                      </Td>
                      <Td>
                        <Badge tone="success">{c.activeConnections}</Badge>
                      </Td>
                      <Td className="font-medium">{formatDuration(c.maxDays)}</Td>
                      <Td>
                        <Badge tone={CONNECTION_STATUS_TONE[c.longestStatus]}>
                          {c.longestStatus.replaceAll("_", " ")}
                        </Badge>
                      </Td>
                      <Td>
                        <StatusBadge status={c.perfStatus} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopClientsCard title="Top 10 Longest-Running" subtitle="" customers={top10Longest} />
            <TopClientsCard
              title="Top 10 Shortest-Running"
              subtitle="Active connections only"
              customers={top10Shortest}
            />
          </div>
        </div>
      )}
    </>
  );
}

function TopClientsCard({
  title,
  subtitle,
  customers,
}: {
  title: string;
  subtitle: string;
  customers: Customer[];
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-muted">{subtitle}</p>}
      {customers.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data.</p>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>#</Th>
              <Th>Client</Th>
              <Th>Active</Th>
              <Th>Longest Duration</Th>
              <Th>Performance</Th>
            </tr>
          </TableHead>
          <tbody>
            {customers.map((c, idx) => (
              <Tr key={c.clientName}>
                <Td className="font-semibold text-muted">{idx + 1}</Td>
                <Td>
                  <span className="font-medium">{c.clientName}</span>
                  {c.secondaryName && (
                    <div className="text-xs text-muted">{c.secondaryName}</div>
                  )}
                </Td>
                <Td>
                  <Badge tone="success">{c.activeConnections}</Badge>
                </Td>
                <Td className="font-medium text-accent">{formatDuration(c.maxDays)}</Td>
                <Td>
                  <StatusBadge status={c.perfStatus} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
