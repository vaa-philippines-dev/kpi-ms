import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { daysSince } from "@/lib/period";
import { PerformanceStatus } from "@/generated/prisma/enums";

// Tenure + historical consistency per connection, as a proxy for how much
// value/retention a client relationship represents — mirrors legacy
// getLifetimeValueReport(). Legacy's exact LTV formula wasn't recoverable
// from the Apps Script source, so this uses the closest well-defined
// signals available: tenure, submission volume, and on-target rate.
export default async function LifetimeValuePage() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      performanceSummaries: true,
      _count: { select: { interventions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = connections.map((c) => {
    const tenureDays = daysSince(c.startDate ?? c.createdAt);
    const periods = new Set(
      c.performanceSummaries.map((s) => `${s.period}:${s.periodStart.toISOString()}`),
    );
    const withData = c.performanceSummaries.filter(
      (s) => s.status !== PerformanceStatus.NO_DATA,
    );
    const onTarget = withData.filter(
      (s) => s.status === PerformanceStatus.ON_TARGET,
    ).length;
    const onTargetPct = withData.length > 0 ? (onTarget / withData.length) * 100 : null;

    return {
      id: c.id,
      va: c.vaUser.name ?? c.vaUser.email,
      client: c.clientName,
      department: c.department.name,
      tenureDays,
      totalPeriods: periods.size,
      onTargetPct,
      interventionCount: c._count.interventions,
    };
  });

  return (
    <>
      <PageHeader
        title="Lifetime Value"
        description="Tenure, submission volume, and on-target rate per connection."
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
        <div className="max-w-5xl">
          <Table>
            <TableHead>
              <tr>
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Department</Th>
                <Th>Tenure (days)</Th>
                <Th>Periods Submitted</Th>
                <Th>On-Target %</Th>
                <Th>Interventions</Th>
              </tr>
            </TableHead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.va}</Td>
                  <Td>{r.client}</Td>
                  <Td className="text-muted">{r.department}</Td>
                  <Td className="text-muted">{r.tenureDays}</Td>
                  <Td className="text-muted">{r.totalPeriods}</Td>
                  <Td className="text-muted">
                    {r.onTargetPct !== null ? `${r.onTargetPct.toFixed(0)}%` : "—"}
                  </Td>
                  <Td className="text-muted">{r.interventionCount}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
