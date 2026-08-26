import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConnectionsTable, type ConnectionRow } from "@/components/connections-table";
import { TeamRoster } from "@/components/team-roster";
import { ConnectionCardGrid } from "@/components/connection-card-grid";
import { NewConnectionModal } from "@/components/new-connection-modal";
import { ImportConnectionsModal } from "@/components/import-connections-modal";
import { SyncButton } from "@/components/sync-button";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

export default async function ConnectionsPage(
  props: PageProps<"/dashboard/connections">,
) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";
  const openId = typeof searchParams.open === "string" ? searchParams.open : null;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const [departments, services, vaUsers] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "VA" }, orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session.role === "ADMIN";
  const isDeptScopedManager = session.role === "DM" || session.role === "OPS_MANAGER";
  // Mirrors requireKpiConfigEditor() in kpi-config/actions.ts — ADMIN, DM,
  // and OM can edit KPI config from the embedded tab too; distinct from
  // `isAdmin` above, which still gates connection-management actions that
  // remain admin-only.
  const canEditKpiConfig = isAdmin || session.role === "DM" || session.role === "OM";
  // DM/Ops Manager can add connections too, but only within their own
  // department — the modal gets a department-locked, pre-filtered slice
  // instead of the full org-wide lists Admin sees.
  const canCreateConnection = isAdmin || isDeptScopedManager;
  const newConnectionDepartments = isDeptScopedManager
    ? departments.filter((d) => d.id === session.departmentId)
    : departments;
  const newConnectionServices = isDeptScopedManager
    ? services.filter((s) => s.departmentId === session.departmentId)
    : services;
  const newConnectionVaUsers = isDeptScopedManager
    ? vaUsers.filter((u) => u.departmentId === session.departmentId)
    : vaUsers;

  if (departments.length === 0) {
    return (
      <>
        <PageHeader
          title="Connections"
          description="VA ↔ client connections, sourced from the Workforce Management system."
        />
        <ComingSoon note="Add at least one department first before creating connections." />
      </>
    );
  }

  const searchFilter = q
    ? {
        OR: [
          { clientName: { contains: q, mode: "insensitive" as const } },
          { vaUser: { name: { contains: q, mode: "insensitive" as const } } },
          { vaUser: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const where = {
    ...scope,
    ...searchFilter,
    ...(departmentId ? { departmentId } : {}),
  };

  // No server-side cap or grouping here anymore — DataTable does its own
  // client-side search/sort/filter/pagination, same as legacy's
  // connFilter()/renderDataTable(), so `departmentId` is the only thing
  // worth re-querying the server for.
  const connections = await prisma.connection.findMany({
    where,
    orderBy: [{ department: { name: "asc" } }, { clientName: "asc" }],
    include: {
      department: true,
      service: true,
      vaUser: true,
      team: { include: { teamLeader: true } },
      statusEvents: { orderBy: { changedAt: "desc" }, take: 5, include: { changedBy: true } },
      interventions: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { kpiConfigs: true, interventions: true } },
    },
  });

  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    shortCode: c.shortCode,
    clientName: c.clientName,
    secondaryName: c.secondaryName,
    vaName: c.vaUser.name ?? c.vaUser.email,
    vaEmail: c.vaUser.email,
    departmentName: c.department.name,
    serviceName: c.service?.name ?? null,
    teamLeaderName: c.team?.teamLeader
      ? c.team.teamLeader.name ?? c.team.teamLeader.email
      : null,
    status: c.status,
    connectionType: c.connectionType,
    isFlagged: c.isFlagged,
    notes: c.notes,
    hasKpiConfig: c._count.kpiConfigs > 0,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    sinceDate: (c.startDate ?? c.createdAt).toISOString(),
    statusEvents: c.statusEvents.map((e) => ({
      status: e.status,
      changedAt: e.changedAt.toISOString(),
      changedByName: e.changedBy.name ?? e.changedBy.email,
    })),
    interventions: c.interventions.map((iv) => ({
      id: iv.id,
      createdAtLabel: iv.createdAt.toLocaleDateString(),
      type: iv.type,
      description: iv.description,
      actionTaken: iv.actionTaken,
      outcome: iv.outcome,
    })),
    interventionCount: c._count.interventions,
  }));

  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />

      <div className="space-y-6">
        {/* Legacy's VA card grid (renderVAConnections()) has no filter bar at
            all — a VA's own connection count is always small. OM's roster
            (renderMyTeam()) is already scoped to one team, so the
            department picker is pointless there too. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {session.role !== "VA" ? (
            <form method="GET" className="flex flex-wrap gap-2">
              {session.role !== "OM" && (
                <Select name="departmentId" defaultValue={departmentId} className="w-40">
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search by client or VA…"
                className="w-full max-w-xs"
              />
              <Button type="submit">Filter</Button>
            </form>
          ) : (
            <div />
          )}

          {canCreateConnection && (
            <div className="flex gap-2">
              {isAdmin && (
                <ImportConnectionsModal departments={departments} services={services} />
              )}
              {canCreateConnection && (
                <NewConnectionModal
                  departments={newConnectionDepartments}
                  services={newConnectionServices}
                  vaUsers={newConnectionVaUsers}
                  lockedDepartmentId={isDeptScopedManager ? (session.departmentId ?? undefined) : undefined}
                />
              )}
            </div>
          )}
        </div>

        {canCreateConnection && (
          <SyncButton label="Sync Connection IDs (from CMS)" endpoint="/api/cms-sync/connections" />
        )}

        {session.role === "OM" ? (
          <TeamRoster connections={rows} />
        ) : session.role === "VA" ? (
          <ConnectionCardGrid connections={rows} />
        ) : (
          <ConnectionsTable
            connections={rows}
            isAdmin={isAdmin}
            canEditKpi={canEditKpiConfig}
            initialOpenId={openId}
          />
        )}
      </div>
    </>
  );
}
