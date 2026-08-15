import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod } from "@/generated/prisma/enums";

// Cross-references this week's worst-case KPI status per connection with
// any interventions logged during the week — mirrors legacy
// getWeeklyInterventionsReport().
export default async function WeeklyInterventionsReportPage() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weekStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: {
        where: { period: KpiPeriod.WEEKLY, periodStart: weekStart },
      },
      interventions: {
        where: { createdAt: { gte: weekStart, lt: weekEnd } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { clientName: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Weekly Interventions Report"
        description={`Week of ${weekStart.toLocaleDateString()} — KPI status vs. interventions logged.`}
      />

      {connections.length > 0 && (
        <a
          href="/api/export/weekly-interventions"
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
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Department</Th>
                <Th>Weekly Status</Th>
                <Th>Interventions</Th>
              </tr>
            </TableHead>
            <tbody>
              {connections.map((c) => {
                const status =
                  c.performanceSummaries.length > 0
                    ? rollupStatus(c.performanceSummaries.map((s) => s.status))
                    : null;
                return (
                  <Tr key={c.id} className="align-top">
                    <Td>{c.vaUser.name ?? c.vaUser.email}</Td>
                    <Td>{c.clientName}</Td>
                    <Td className="text-muted">{c.department.name}</Td>
                    <Td>
                      {status ? (
                        <StatusBadge status={status} />
                      ) : (
                        <span className="text-xs text-muted">Not submitted</span>
                      )}
                    </Td>
                    <Td className="text-muted">
                      {c.interventions.length === 0
                        ? "—"
                        : c.interventions.map((iv) => iv.type).join(", ")}
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
