import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const TILES: { status: PerformanceStatus; label: string; style: string }[] = [
  {
    status: PerformanceStatus.ON_TARGET,
    label: "On Target",
    style: "border-emerald-500/30 text-emerald-400",
  },
  {
    status: PerformanceStatus.AT_RISK,
    label: "At Risk",
    style: "border-amber-500/30 text-amber-400",
  },
  {
    status: PerformanceStatus.CRITICAL,
    label: "Critical",
    style: "border-red-500/30 text-red-400",
  },
];

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
            {TILES.map((tile) => (
              <div
                key={tile.status}
                className={`rounded-lg border bg-surface p-4 ${tile.style}`}
              >
                <div className="text-3xl font-semibold">
                  {counts[tile.status]}
                </div>
                <div className="mt-1 text-sm">{tile.label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">On Target</th>
                  <th className="px-4 py-2 font-medium">At Risk</th>
                  <th className="px-4 py-2 font-medium">Critical</th>
                </tr>
              </thead>
              <tbody>
                {[...byDepartment.entries()].map(([dept, c]) => (
                  <tr key={dept} className="border-t border-surface-border">
                    <td className="px-4 py-2">{dept}</td>
                    <td className="px-4 py-2 text-emerald-400">
                      {c[PerformanceStatus.ON_TARGET]}
                    </td>
                    <td className="px-4 py-2 text-amber-400">
                      {c[PerformanceStatus.AT_RISK]}
                    </td>
                    <td className="px-4 py-2 text-red-400">
                      {c[PerformanceStatus.CRITICAL]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
