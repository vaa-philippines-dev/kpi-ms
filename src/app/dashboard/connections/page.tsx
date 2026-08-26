import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { ConnectionsTable, type ConnectionRow } from "@/components/connections-table";
import { ConnectionCardGrid } from "@/components/connection-card-grid";
import { NewConnectionModal } from "@/components/new-connection-modal";
import { ImportConnectionsModal } from "@/components/import-connections-modal";
import { SyncButton } from "@/components/sync-button";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";

export default async function ConnectionsPage(
  props: PageProps<"/dashboard/connections">,
) {
  const searchParams = await props.searchParams;
  const openId = typeof searchParams.open === "string" ? searchParams.open : null;

  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const [departments, services, vaUsers] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "VA" },
      orderBy: { name: "asc" },
      include: { additionalDepartments: true },
    }),
  ]);
  const isAdmin = session.role === "ADMIN";
  const isDeptScopedManager = session.role === "DM" || session.role === "OPS_MANAGER";
  // Mirrors requireKpiConfigEditor() in kpi-config/actions.ts — ADMIN, DM,
  // and OM can edit KPI config from the embedded tab too; distinct from
  // `isAdmin` above, which still gates connection-management actions that
  // remain admin-only.
  const canEditKpiConfig = isAdmin || session.role === "DM" || session.role === "OM";
  // Mirrors requireConnectionEditor() in ./actions.ts — ADMIN, DM, and OM
  // can edit a connection's status, type, account info, and notes, each
  // locked to the connections connectionScopeWhere already lets them see;
  // flagging and deleting a connection stay admin-only (isAdmin above).
  const canEditConnection = isAdmin || session.role === "DM" || session.role === "OM";
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
  // A VA can belong to more than one department (User.additionalDepartments)
  // — a DM/Ops Manager should see them in this dropdown if their own
  // department is EITHER the VA's primary or one of their additional ones,
  // not just the primary.
  const newConnectionVaUsers = isDeptScopedManager
    ? vaUsers.filter(
        (u) =>
          u.departmentId === session.departmentId ||
          u.additionalDepartments.some((d) => d.departmentId === session.departmentId),
      )
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

  // No server-side search/department/status filtering — DataTable does all
  // of that client-side (search box, Dept/Service column filter, Status
  // column filter, which starts on Active), so every connection in `scope`
  // loads once and every filter change is instant, with no page reload and
  // no separate "Filter" button. `scope` alone already limits this to
  // what the signed-in role can see (VA: own, OM: own team, DM/OPS_MANAGER:
  // own department, ADMIN/SERVICE_MANAGER: everything).
  const connections = await prisma.connection.findMany({
    where: scope,
    // Newest-started first, per the user's request — 36 connections have
    // no startDate at all (mostly older legacy-sourced rows predating that
    // field), pushed to the end via `nulls: "last"` rather than sorting
    // first under Postgres's default DESC null ordering, and ordered
    // amongst themselves by createdAt as the next-best "recency" proxy.
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
        {/* Department/status/search filtering now lives inside
            ConnectionsTable itself (client-side, instant, right next to
            "Search all columns…") — no separate filter bar or Filter
            button here anymore. */}
        {canCreateConnection && (
          <div className="flex justify-end gap-2">
            {isAdmin && (
              <ImportConnectionsModal departments={departments} services={services} />
            )}
            <NewConnectionModal
              departments={newConnectionDepartments}
              services={newConnectionServices}
              vaUsers={newConnectionVaUsers}
              lockedDepartmentId={isDeptScopedManager ? (session.departmentId ?? undefined) : undefined}
            />
          </div>
        )}

        {canCreateConnection && (
          <SyncButton label="Sync Connection IDs (from CMS)" endpoint="/api/cms-sync/connections" />
        )}

        {session.role === "VA" ? (
          <ConnectionCardGrid connections={rows} />
        ) : (
          <ConnectionsTable
            connections={rows}
            isAdmin={isAdmin}
            canEditKpi={canEditKpiConfig}
            canEditConnection={canEditConnection}
            initialOpenId={openId}
          />
        )}
      </div>
    </>
  );
}
