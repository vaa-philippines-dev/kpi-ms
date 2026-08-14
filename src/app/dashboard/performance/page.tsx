import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { currentPeriodStart } from "@/lib/period";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const STATUS_STYLES: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "bg-emerald-500/15 text-emerald-400",
  [PerformanceStatus.AT_RISK]: "bg-amber-500/15 text-amber-400",
  [PerformanceStatus.CRITICAL]: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
};

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
        <div className="max-w-5xl overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">VA / Client</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">KPI</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Actual</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.id} className="border-t border-surface-border">
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[s.status]}`}
                    >
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {s.connection.vaName}
                    <div className="text-xs text-muted">
                      {s.connection.clientName}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {s.connection.department.name}
                  </td>
                  <td className="px-4 py-2">{s.kpiDefinition.name}</td>
                  <td className="px-4 py-2 text-muted">{s.period}</td>
                  <td className="px-4 py-2 text-muted">{s.actualValue}</td>
                  <td className="px-4 py-2 text-muted">{s.targetValue}</td>
                  <td className="px-4 py-2 text-muted">
                    {s.pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
