import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import type { Prisma } from "@/generated/prisma/client";

// Flags connections that don't yet have a KpiConfig row for every KPI
// applicable to their department/service — mirrors legacy
// getManagerNotifications()'s "N connections missing KPI config".
async function getManagerNotifications(scope: Prisma.ConnectionWhereInput) {
  const connections = await prisma.connection.findMany({
    where: scope,
    include: { vaUser: true, kpiConfigs: true },
  });
  const kpiDefs = await prisma.kpiDefinition.findMany();

  const missingConfig = connections.filter((conn) => {
    const applicable = kpiDefs.filter(
      (k) =>
        k.departmentId === conn.departmentId &&
        (k.serviceId === null || k.serviceId === conn.serviceId),
    );
    const configuredIds = new Set(conn.kpiConfigs.map((c) => c.kpiDefinitionId));
    return applicable.some((k) => !configuredIds.has(k.id));
  });

  return { missingConfig };
}

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
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, undefined, weekStartDay);
  const monthlyStart = currentPeriodStart(KpiPeriod.MONTHLY);
  const isManager = ["ADMIN", "DM", "OM"].includes(session.role);

  const [summaries, notifications] = await Promise.all([
    prisma.performanceSummary.findMany({
      where: {
        connection: scope,
        OR: [
          { period: KpiPeriod.WEEKLY, periodStart: weeklyStart },
          { period: KpiPeriod.MONTHLY, periodStart: monthlyStart },
        ],
      },
      include: { connection: { include: { department: true } } },
    }),
    isManager ? getManagerNotifications(scope) : Promise.resolve(null),
  ]);

  const emptyCounts = () => ({
    [PerformanceStatus.ON_TARGET]: 0,
    [PerformanceStatus.AT_RISK]: 0,
    [PerformanceStatus.CRITICAL]: 0,
    [PerformanceStatus.NO_DATA]: 0,
  });
  const counts = emptyCounts();
  const byDepartment = new Map<string, typeof counts>();

  for (const s of summaries) {
    counts[s.status]++;
    const deptName = s.connection.department.name;
    if (!byDepartment.has(deptName)) {
      byDepartment.set(deptName, emptyCounts());
    }
    byDepartment.get(deptName)![s.status]++;
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Weekly / monthly performance across all departments."
      />

      {notifications && notifications.missingConfig.length > 0 && (
        <div className="mb-6 max-w-4xl rounded-lg border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <Bell className="size-4" />
            {notifications.missingConfig.length} connection
            {notifications.missingConfig.length === 1 ? "" : "s"} missing KPI
            config
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {notifications.missingConfig.map((c) => (
              <li key={c.id}>
                {c.vaUser.name ?? c.vaUser.email} · {c.clientName}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/connections"
            className="mt-2 inline-block text-xs text-accent hover:underline"
          >
            Go to Connections →
          </Link>
        </div>
      )}

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
