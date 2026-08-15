import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { initKpiConfig, updateKpiConfig, deleteKpiConfig } from "./actions";

// Per-connection KPI target/threshold override editor — mirrors legacy
// AppKPIConfig.html / KPIConfig.js (getKPIConfigForConn, updateKPIConfig).
export default async function KpiConfigPage(
  props: PageProps<"/dashboard/connections/kpi-config">,
) {
  const searchParams = await props.searchParams;
  const connectionId =
    typeof searchParams.connectionId === "string"
      ? searchParams.connectionId
      : undefined;

  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const scope = connectionScopeWhere(session);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: { vaUser: true },
    orderBy: { clientName: "asc" },
  });

  const connection = connectionId
    ? await prisma.connection.findFirst({
        where: { id: connectionId, ...scope },
        include: { vaUser: true, department: true },
      })
    : null;

  const [configs, applicableKpis] = connection
    ? await Promise.all([
        prisma.kpiConfig.findMany({
          where: { connectionId: connection.id },
          include: { kpiDefinition: true },
          orderBy: { kpiDefinition: { name: "asc" } },
        }),
        prisma.kpiDefinition.findMany({
          where: {
            departmentId: connection.departmentId,
            OR: [{ serviceId: null }, { serviceId: connection.serviceId }],
          },
        }),
      ])
    : [[], []];

  const missingCount = applicableKpis.length - configs.length;

  return (
    <>
      <PageHeader
        title="KPI Config"
        description="Per-connection overrides of KPI targets and thresholds."
      />

      <div className="max-w-4xl space-y-6">
        <form method="GET" className="flex gap-2">
          <Select name="connectionId" defaultValue={connectionId ?? ""} className="w-full">
            <option value="" disabled>
              Choose a connection
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.vaUser.name ?? c.vaUser.email)} · {c.clientName}
              </option>
            ))}
          </Select>
          <Button type="submit" className="shrink-0">
            View
          </Button>
        </form>

        {!connection ? (
          <ComingSoon note="Choose a connection above to configure its KPIs." />
        ) : (
          <>
            <div className="rounded-xl border border-surface-border p-5">
              <h2 className="text-lg font-semibold">
                {connection.vaUser.name ?? connection.vaUser.email} · {connection.clientName}
              </h2>
              <p className="text-xs text-muted">{connection.department.name}</p>
            </div>

            {missingCount > 0 && isAdmin && (
              <form action={initKpiConfig} className="flex items-center gap-3">
                <input type="hidden" name="connectionId" value={connection.id} />
                <p className="text-sm text-warning">
                  {missingCount} KPI{missingCount === 1 ? "" : "s"} not yet
                  configured for this connection.
                </p>
                <Button type="submit" className="shrink-0">
                  Generate from KPI Library defaults
                </Button>
              </form>
            )}

            <Table>
              <TableHead>
                <tr>
                  <Th>KPI</Th>
                  <Th>Target</Th>
                  <Th>At Risk %</Th>
                  <Th>Critical %</Th>
                  <Th>Applicable</Th>
                  {isAdmin && <Th />}
                </tr>
              </TableHead>
              <tbody>
                {configs.length === 0 && (
                  <Tr>
                    <Td colSpan={isAdmin ? 6 : 5} className="py-6 text-center text-muted">
                      No KPI config yet — generate defaults above.
                    </Td>
                  </Tr>
                )}
                {configs.map((cfg) =>
                  isAdmin ? (
                    <Tr key={cfg.id}>
                      <Td colSpan={6} className="!py-2">
                        <form
                          action={updateKpiConfig}
                          className="grid grid-cols-6 items-center gap-2"
                        >
                          <input type="hidden" name="id" value={cfg.id} />
                          <span className="text-sm">{cfg.kpiDefinition.name}</span>
                          <Input
                            name="targetValue"
                            type="number"
                            step="any"
                            defaultValue={cfg.targetValue ?? cfg.kpiDefinition.targetValue}
                            className="py-1"
                          />
                          <Input
                            name="deviationThresholdPct"
                            type="number"
                            step="any"
                            defaultValue={
                              cfg.deviationThresholdPct ??
                              cfg.kpiDefinition.deviationThresholdPct
                            }
                            className="py-1"
                          />
                          <Input
                            name="criticalThresholdPct"
                            type="number"
                            step="any"
                            defaultValue={
                              cfg.criticalThresholdPct ??
                              cfg.kpiDefinition.criticalThresholdPct
                            }
                            className="py-1"
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              name="isApplicable"
                              defaultChecked={cfg.isApplicable}
                            />
                            Applicable
                          </label>
                          <TextAction type="submit">Save</TextAction>
                        </form>
                      </Td>
                    </Tr>
                  ) : (
                    <Tr key={cfg.id}>
                      <Td>{cfg.kpiDefinition.name}</Td>
                      <Td className="text-muted">
                        {cfg.targetValue ?? cfg.kpiDefinition.targetValue}
                      </Td>
                      <Td className="text-muted">
                        {cfg.deviationThresholdPct ?? cfg.kpiDefinition.deviationThresholdPct}%
                      </Td>
                      <Td className="text-muted">
                        {cfg.criticalThresholdPct ?? cfg.kpiDefinition.criticalThresholdPct}%
                      </Td>
                      <Td className="text-muted">{cfg.isApplicable ? "Yes" : "No"}</Td>
                    </Tr>
                  ),
                )}
              </tbody>
            </Table>

            {isAdmin && configs.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {configs.map((cfg) => (
                  <form key={cfg.id} action={deleteKpiConfig}>
                    <input type="hidden" name="id" value={cfg.id} />
                    <TextAction type="submit" tone="danger">
                      Remove {cfg.kpiDefinition.name} override
                    </TextAction>
                  </form>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
