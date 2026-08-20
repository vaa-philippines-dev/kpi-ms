import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { KpiConfigTable, type ConnectionConfigRow } from "@/components/kpi-config-table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

// System-wide connection list with KPI-config status — mirrors legacy
// AppKPIConfig.html / KPIConfig.js (getVAConnections + getKPIConfigForConn).
export default async function KpiConfigPage(
  props: PageProps<"/dashboard/connections/kpi-config">,
) {
  const searchParams = await props.searchParams;
  const initialConnectionId =
    typeof searchParams.connectionId === "string" ? searchParams.connectionId : undefined;

  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const scope = connectionScopeWhere(session);

  const connections = await prisma.connection.findMany({
    where: scope,
    include: {
      vaUser: true,
      department: true,
      service: true,
      _count: { select: { kpiConfigs: true } },
    },
    orderBy: { clientName: "asc" },
  });

  if (connections.length === 0) {
    return (
      <>
        <PageHeader
          title="KPI Configuration (0 connections)"
          description="Per-connection overrides of KPI targets and thresholds."
        />
        <ComingSoon note="No connections visible to your account yet." />
      </>
    );
  }

  const rows: ConnectionConfigRow[] = connections.map((c) => ({
    id: c.id,
    clientName: c.clientName,
    vaName: c.vaUser.name ?? c.vaUser.email,
    departmentName: c.department.name,
    serviceName: c.service?.name ?? null,
    hasConfig: c._count.kpiConfigs > 0,
  }));

  return (
    <>
      <PageHeader
        title={`KPI Configuration (${connections.length} connection${connections.length === 1 ? "" : "s"})`}
        description="Per-connection overrides of KPI targets and thresholds."
      />
      <KpiConfigTable
        connections={rows}
        isAdmin={isAdmin}
        initialConnectionId={initialConnectionId}
      />
    </>
  );
}
