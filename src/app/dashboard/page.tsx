import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const TILES = [
  {
    status: PerformanceStatus.ON_TARGET,
    label: "On Target",
    icon: CheckCircle2,
    style: "border-success/30 text-success",
  },
  {
    status: PerformanceStatus.AT_RISK,
    label: "At Risk",
    icon: AlertTriangle,
    style: "border-warning/30 text-warning",
  },
  {
    status: PerformanceStatus.CRITICAL,
    label: "Critical",
    icon: XCircle,
    style: "border-danger/30 text-danger",
  },
] as const;

export default async function DashboardOverviewPage() {
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);

  const summaries = await prisma.performanceSummary.findMany({
    where: {
      OR: [
        { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
        { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
      ],
    },
    include: { connection: { include: { department: true } } },
  });

  const counts = {
    [PerformanceStatus.ON_TARGET]: 0,
    [PerformanceStatus.AT_RISK]: 0,
    [PerformanceStatus.CRITICAL]: 0,
  };
  const byDepartment = new Map<string, typeof counts>();

  for (const s of summaries) {
    counts[s.status]++;
    const deptName = s.connection.department.name;
    if (!byDepartment.has(deptName)) {
      byDepartment.set(deptName, {
        [PerformanceStatus.ON_TARGET]: 0,
        [PerformanceStatus.AT_RISK]: 0,
        [PerformanceStatus.CRITICAL]: 0,
      });
    }
    byDepartment.get(deptName)![s.status]++;
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Weekly / monthly performance across all departments."
      />

      {summaries.length === 0 ? (
        <ComingSoon note="No performance data for the current period yet — it's computed automatically as submissions come in." />
      ) : (
        <div className="max-w-4xl space-y-8">
          <div className="grid grid-cols-3 gap-4">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.status}
                  className={`rounded-xl border bg-surface p-4 ${tile.style}`}
                >
                  <Icon className="size-5" />
                  <div className="mt-3 text-3xl font-semibold">
                    {counts[tile.status]}
                  </div>
                  <div className="mt-1 text-sm">{tile.label}</div>
                </div>
              );
            })}
          </div>

          <Table>
            <TableHead>
              <tr>
                <Th>Department</Th>
                <Th>On Target</Th>
                <Th>At Risk</Th>
                <Th>Critical</Th>
              </tr>
            </TableHead>
            <tbody>
              {[...byDepartment.entries()].map(([dept, c]) => (
                <Tr key={dept}>
                  <Td>{dept}</Td>
                  <Td className="text-success">
                    {c[PerformanceStatus.ON_TARGET]}
                  </Td>
                  <Td className="text-warning">
                    {c[PerformanceStatus.AT_RISK]}
                  </Td>
                  <Td className="text-danger">
                    {c[PerformanceStatus.CRITICAL]}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
