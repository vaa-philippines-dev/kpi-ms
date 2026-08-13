import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import {
  createKpiDefinition,
  deleteKpiDefinition,
  updateKpiDefinition,
} from "./actions";

export default async function KpiLibraryPage() {
  const [session, kpis, departments] = await Promise.all([
    auth(),
    prisma.kpiDefinition.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="KPI Library"
        description="KPI definitions, targets, deviation thresholds, and department clusters."
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first (Departments page) before defining KPIs." />
      ) : (
        <div className="max-w-4xl space-y-8">
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Direction</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium">At Risk %</th>
                  <th className="px-4 py-2 font-medium">Critical %</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {kpis.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdmin ? 8 : 7}
                      className="px-4 py-6 text-center text-muted"
                    >
                      No KPIs defined yet.
                    </td>
                  </tr>
                )}
                {kpis.map((kpi) =>
                  isAdmin ? (
                    <tr key={kpi.id} className="border-t border-surface-border">
                      <td colSpan={8} className="px-2 py-2">
                        <form
                          action={updateKpiDefinition}
                          className="grid grid-cols-8 items-center gap-2"
                        >
                          <input type="hidden" name="id" value={kpi.id} />
                          <input
                            name="name"
                            defaultValue={kpi.name}
                            className="rounded border border-surface-border bg-transparent px-2 py-1"
                          />
                          <select
                            name="departmentId"
                            defaultValue={kpi.departmentId}
                            className="rounded border border-surface-border bg-surface px-2 py-1"
                          >
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <select
                            name="direction"
                            defaultValue={kpi.direction}
                            className="rounded border border-surface-border bg-surface px-2 py-1"
                          >
                            <option value={KpiDirection.HIGHER_IS_BETTER}>
                              Higher is better
                            </option>
                            <option value={KpiDirection.LOWER_IS_BETTER}>
                              Lower is better
                            </option>
                          </select>
                          <select
                            name="period"
                            defaultValue={kpi.period}
                            className="rounded border border-surface-border bg-surface px-2 py-1"
                          >
                            <option value={KpiPeriod.WEEKLY}>Weekly</option>
                            <option value={KpiPeriod.MONTHLY}>Monthly</option>
                          </select>
                          <input
                            name="targetValue"
                            type="number"
                            step="any"
                            defaultValue={kpi.targetValue}
                            className="rounded border border-surface-border bg-transparent px-2 py-1"
                          />
                          <input
                            name="atRiskThresholdPct"
                            type="number"
                            step="any"
                            defaultValue={kpi.atRiskThresholdPct}
                            className="rounded border border-surface-border bg-transparent px-2 py-1"
                          />
                          <input
                            name="criticalThresholdPct"
                            type="number"
                            step="any"
                            defaultValue={kpi.criticalThresholdPct}
                            className="rounded border border-surface-border bg-transparent px-2 py-1"
                          />
                          <div className="flex gap-3 text-xs">
                            <button
                              type="submit"
                              className="text-accent hover:underline"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={kpi.id} className="border-t border-surface-border">
                      <td className="px-4 py-2">{kpi.name}</td>
                      <td className="px-4 py-2 text-muted">
                        {kpi.department.name}
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {kpi.direction === KpiDirection.HIGHER_IS_BETTER
                          ? "Higher is better"
                          : "Lower is better"}
                      </td>
                      <td className="px-4 py-2 text-muted">{kpi.period}</td>
                      <td className="px-4 py-2 text-muted">{kpi.targetValue}</td>
                      <td className="px-4 py-2 text-muted">
                        {kpi.atRiskThresholdPct}%
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {kpi.criticalThresholdPct}%
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div>
              {kpis.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {kpis.map((kpi) => (
                    <form key={kpi.id} action={deleteKpiDefinition}>
                      <input type="hidden" name="id" value={kpi.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-400 hover:underline"
                      >
                        Delete &quot;{kpi.name}&quot;
                      </button>
                    </form>
                  ))}
                </div>
              )}

              <form
                action={createKpiDefinition}
                className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
              >
                <input
                  name="name"
                  placeholder="KPI name"
                  required
                  className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm sm:col-span-2"
                />
                <select
                  name="departmentId"
                  required
                  defaultValue=""
                  className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Department
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  name="direction"
                  defaultValue={KpiDirection.HIGHER_IS_BETTER}
                  className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
                >
                  <option value={KpiDirection.HIGHER_IS_BETTER}>
                    Higher is better
                  </option>
                  <option value={KpiDirection.LOWER_IS_BETTER}>
                    Lower is better
                  </option>
                </select>
                <select
                  name="period"
                  defaultValue={KpiPeriod.MONTHLY}
                  className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
                >
                  <option value={KpiPeriod.WEEKLY}>Weekly</option>
                  <option value={KpiPeriod.MONTHLY}>Monthly</option>
                </select>
                <input
                  name="targetValue"
                  type="number"
                  step="any"
                  placeholder="Target value"
                  required
                  className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="atRiskThresholdPct"
                  type="number"
                  step="any"
                  placeholder="At Risk % (default 99)"
                  className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
                />
                <input
                  name="criticalThresholdPct"
                  type="number"
                  step="any"
                  placeholder="Critical % (default 99)"
                  className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Add KPI
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
