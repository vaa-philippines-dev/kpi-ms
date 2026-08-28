import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { KpiLibraryTable, type KpiRow } from "@/components/kpi-library-table";
import { getEffectiveSession } from "@/lib/view-as";
import { departmentScopeWhere } from "@/lib/connection-scope";
import { KpiPeriod } from "@/generated/prisma/enums";

const MANAGER_ROLES = new Set(["ADMIN", "DM", "OPS_MANAGER", "OM"]);

export default async function KpiLibraryPage(props: PageProps<"/dashboard/kpi-library">) {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");

  const searchParams = await props.searchParams;
  // Global topbar Weekly/Monthly toggle (see components/period-nav.tsx) — the
  // library previously ignored it and always listed every KPI regardless of
  // period, so weekly and monthly definitions were interleaved everywhere.
  const selectedPeriod: KpiPeriod =
    searchParams.period === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;

  // DM/OPS_MANAGER/OM only ever see their own department's KPIs — a manager
  // browsing the library previously saw (and could edit/delete) every other
  // department's definitions too, since only ADMIN/SERVICE_MANAGER are
  // meant to be unscoped here (see connection-scope.ts's role table).
  const scope = departmentScopeWhere(session);
  const isUnrestricted =
    session.role === "ADMIN" || session.role === "EXECUTIVE" || session.role === "SERVICE_MANAGER";

  const [kpis, departments, services] = await Promise.all([
    prisma.kpiDefinition.findMany({
      where: { period: selectedPeriod, ...scope },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: { select: { name: true } }, service: { select: { name: true } } },
    }),
    prisma.department.findMany({
      where: isUnrestricted ? {} : { id: session.departmentId ?? "__none__" },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: isUnrestricted ? {} : { departmentId: session.departmentId ?? "__none__" },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: { select: { name: true } } },
    }),
  ]);
  const canManage = MANAGER_ROLES.has(session.role);

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
    unit: k.unit,
    targetValue: k.targetValue,
    deviationThresholdPct: k.deviationThresholdPct,
    criticalThresholdPct: k.criticalThresholdPct,
  }));

  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    departmentName: s.department.name,
  }));

  const clusters = Array.from(new Set(rows.map((r) => r.cluster.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );

  return (
    <>
      <PageHeader
        title="KPI Library"
        description={`${selectedPeriod === "MONTHLY" ? "Monthly" : "Weekly"} KPI definitions, targets, deviation thresholds, and department clusters. Use the Weekly / Monthly toggle above to switch.`}
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first (Departments page) before defining KPIs." />
      ) : (
        <KpiLibraryTable
          kpis={rows}
          departments={departments}
          services={serviceOptions}
          clusters={clusters}
          canManage={canManage}
          defaultPeriod={selectedPeriod}
        />
      )}
    </>
  );
}
