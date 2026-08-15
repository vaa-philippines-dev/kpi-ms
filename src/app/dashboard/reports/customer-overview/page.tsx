import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, ConnectionStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  END_OF_CONTRACT: "End of Contract",
  END_OF_PROJECT: "End of Project",
  PENDING: "Pending",
};

// Per-client rollup across all connections — mirrors legacy
// getCustomerOverviewReport(): one row per connection with its current
// contract status plus its current-period worst-case KPI status.
export default async function CustomerOverviewPage() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: {
        where: {
          OR: [
            { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
            { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
          ],
        },
      },
    },
    orderBy: { clientName: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Customer Overview"
        description="Every connection's contract status and current-period performance."
      />

      {connections.length > 0 && (
        <a
          href="/api/export/customer-overview"
          className="mb-6 inline-block text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      )}

      {connections.length === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="max-w-5xl">
          <Table>
            <TableHead>
              <tr>
                <Th>Client</Th>
                <Th>VA</Th>
                <Th>Department</Th>
                <Th>Contract Status</Th>
                <Th>Current Performance</Th>
                <Th />
              </tr>
            </TableHead>
            <tbody>
              {connections.map((c) => {
                const worst =
                  c.performanceSummaries.length > 0
                    ? rollupStatus(c.performanceSummaries.map((s) => s.status))
                    : null;
                return (
                  <Tr key={c.id}>
                    <Td>{c.clientName}</Td>
                    <Td className="text-muted">{c.vaUser.name ?? c.vaUser.email}</Td>
                    <Td className="text-muted">{c.department.name}</Td>
                    <Td className="text-muted">{STATUS_LABELS[c.status]}</Td>
                    <Td>
                      {worst ? (
                        <StatusBadge status={worst} />
                      ) : (
                        <span className="text-xs text-muted">No data</span>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/dashboard/reports/client-detail?connectionId=${c.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        View detail →
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
