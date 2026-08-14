import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod } from "@/generated/prisma/enums";

export default async function PerformancePage() {
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const summaries = await prisma.performanceSummary.findMany({
    where: {
      OR: [
        { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
        { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
      ],
    },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    include: {
      connection: { include: { department: true } },
      kpiDefinition: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Performance"
        description="Actual vs. target per connection, for the current week/month."
      />

      {summaries.length === 0 ? (
        <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
      ) : (
        <div className="max-w-5xl">
          <Table>
            <TableHead>
              <tr>
                <Th>Status</Th>
                <Th>VA / Client</Th>
                <Th>Department</Th>
                <Th>KPI</Th>
                <Th>Period</Th>
                <Th>Actual</Th>
                <Th>Target</Th>
                <Th>%</Th>
              </tr>
            </TableHead>
            <tbody>
              {summaries.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>
                    {s.connection.vaName}
                    <div className="text-xs text-muted">
                      {s.connection.clientName}
                    </div>
                  </Td>
                  <Td className="text-muted">{s.connection.department.name}</Td>
                  <Td>{s.kpiDefinition.name}</Td>
                  <Td className="text-muted">{s.period}</Td>
                  <Td className="text-muted">{s.actualValue}</Td>
                  <Td className="text-muted">{s.targetValue}</Td>
                  <Td className="text-muted">{s.pct.toFixed(1)}%</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
