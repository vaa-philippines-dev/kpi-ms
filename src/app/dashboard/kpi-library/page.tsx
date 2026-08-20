import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { KpiLibraryTable, type KpiRow } from "@/components/kpi-library-table";
import { getEffectiveSession } from "@/lib/view-as";

export default async function KpiLibraryPage() {
  const [session, kpis, departments, services] = await Promise.all([
    getEffectiveSession(),
    prisma.kpiDefinition.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true, service: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true },
    }),
  ]);
  const isAdmin = session?.role === "ADMIN";

  const rows: KpiRow[] = kpis.map((k) => ({
    id: k.id,
    name: k.name,
    cluster: k.cluster,
    departmentId: k.departmentId,
    departmentName: k.department.name,
    serviceId: k.serviceId,
    serviceName: k.service?.name ?? null,
    direction: k.direction,
    period: k.period,
    targetValue: k.targetValue,
    deviationThresholdPct: k.deviationThresholdPct,
    criticalThresholdPct: k.criticalThresholdPct,
  }));

  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    departmentName: s.department.name,
  }));

  return (
    <>
      <PageHeader
        title="KPI Library"
        description="KPI definitions, targets, deviation thresholds, and department clusters."
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first (Departments page) before defining KPIs." />
      ) : (
        <KpiLibraryTable
          kpis={rows}
          departments={departments}
          services={serviceOptions}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}
