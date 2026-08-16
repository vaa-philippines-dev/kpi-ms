import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { PeriodNav } from "@/components/period-nav";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { CONNECTION_STATUS_LABELS } from "@/lib/connection-labels";
import { KpiPeriod } from "@/generated/prisma/enums";

// Per-client rollup across all connections — mirrors legacy
// getCustomerOverviewReport(): one row per connection with its current
// contract status plus its current-period worst-case KPI status.
export default async function CustomerOverviewPage(
  props: PageProps<"/dashboard/reports/customer-overview">,
) {
  const searchParams = await props.searchParams;
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY, anchor);

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Customer Overview"
          description="Every connection's contract status and current-period performance."
          className="mb-0"
        />
        <PeriodNav
          anchor={weeklyStart}
          weekStartDay={weekStartDay}
          basePath="/dashboard/reports/customer-overview"
        />
      </div>

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
                    <Td className="text-muted">{CONNECTION_STATUS_LABELS[c.status]}</Td>
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
