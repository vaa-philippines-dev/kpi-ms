import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
          <Table>
            <TableHead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Direction</Th>
                <Th>Period</Th>
                <Th>Target</Th>
                <Th>Deviation %</Th>
                {isAdmin && <Th />}
              </tr>
            </TableHead>
            <tbody>
              {kpis.length === 0 && (
                <Tr>
                  <Td
                    colSpan={isAdmin ? 7 : 6}
                    className="py-6 text-center text-muted"
                  >
                    No KPIs defined yet.
                  </Td>
                </Tr>
              )}
              {kpis.map((kpi) =>
                isAdmin ? (
                  <Tr key={kpi.id}>
                    <Td colSpan={7} className="!py-2">
                      <form
                        action={updateKpiDefinition}
                        className="grid grid-cols-7 items-center gap-2"
                      >
                        <input type="hidden" name="id" value={kpi.id} />
                        <Input name="name" defaultValue={kpi.name} className="py-1" />
                        <Select
                          name="departmentId"
                          defaultValue={kpi.departmentId}
                          className="py-1"
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          name="direction"
                          defaultValue={kpi.direction}
                          className="py-1"
                        >
                          <option value={KpiDirection.HIGHER_IS_BETTER}>
                            Higher is better
                          </option>
                          <option value={KpiDirection.LOWER_IS_BETTER}>
                            Lower is better
                          </option>
                        </Select>
                        <Select name="period" defaultValue={kpi.period} className="py-1">
                          <option value={KpiPeriod.WEEKLY}>Weekly</option>
                          <option value={KpiPeriod.MONTHLY}>Monthly</option>
                        </Select>
                        <Input
                          name="targetValue"
                          type="number"
                          step="any"
                          defaultValue={kpi.targetValue}
                          className="py-1"
                        />
                        <Input
                          name="deviationThresholdPct"
                          type="number"
                          step="any"
                          defaultValue={kpi.deviationThresholdPct}
                          className="py-1"
                        />
                        <TextAction type="submit">Save</TextAction>
                      </form>
                    </Td>
                  </Tr>
                ) : (
                  <Tr key={kpi.id}>
                    <Td>{kpi.name}</Td>
                    <Td className="text-muted">{kpi.department.name}</Td>
                    <Td className="text-muted">
                      {kpi.direction === KpiDirection.HIGHER_IS_BETTER
                        ? "Higher is better"
                        : "Lower is better"}
                    </Td>
                    <Td className="text-muted">{kpi.period}</Td>
                    <Td className="text-muted">{kpi.targetValue}</Td>
                    <Td className="text-muted">{kpi.deviationThresholdPct}%</Td>
                  </Tr>
                ),
              )}
            </tbody>
          </Table>

          {isAdmin && (
            <div className="space-y-4">
              {kpis.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {kpis.map((kpi) => (
                    <form key={kpi.id} action={deleteKpiDefinition}>
                      <input type="hidden" name="id" value={kpi.id} />
                      <TextAction type="submit" tone="danger">
                        Delete &quot;{kpi.name}&quot;
                      </TextAction>
                    </form>
                  ))}
                </div>
              )}

              <form
                action={createKpiDefinition}
                className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
              >
                <Input
                  name="name"
                  placeholder="KPI name"
                  required
                  className="sm:col-span-2"
                />
                <Select name="departmentId" required defaultValue="">
                  <option value="" disabled>
                    Department
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Select
                  name="direction"
                  defaultValue={KpiDirection.HIGHER_IS_BETTER}
                >
                  <option value={KpiDirection.HIGHER_IS_BETTER}>
                    Higher is better
                  </option>
                  <option value={KpiDirection.LOWER_IS_BETTER}>
                    Lower is better
                  </option>
                </Select>
                <Select name="period" defaultValue={KpiPeriod.MONTHLY}>
                  <option value={KpiPeriod.WEEKLY}>Weekly</option>
                  <option value={KpiPeriod.MONTHLY}>Monthly</option>
                </Select>
                <Input
                  name="targetValue"
                  type="number"
                  step="any"
                  placeholder="Target value"
                  required
                />
                <Input
                  name="deviationThresholdPct"
                  type="number"
                  step="any"
                  placeholder="Deviation % (default 99)"
                />
                <Button type="submit">Add KPI</Button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
