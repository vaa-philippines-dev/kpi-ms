import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { KpiLibraryTable, type KpiRow } from "@/components/kpi-library-table";

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

  const rows: KpiRow[] = kpis.map((k) => ({
    id: k.id,
    name: k.name,
    cluster: k.cluster,
    departmentId: k.departmentId,
    departmentName: k.department.name,
    direction: k.direction,
    period: k.period,
    targetValue: k.targetValue,
    deviationThresholdPct: k.deviationThresholdPct,
    criticalThresholdPct: k.criticalThresholdPct,
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
        <KpiLibraryTable kpis={rows} departments={departments} isAdmin={isAdmin} />
      )}
    </>
  );
}
