import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ConnectionsTable, type ConnectionRow } from "@/components/connections-table";
import { TeamRoster } from "@/components/team-roster";
import { ConnectionCardGrid } from "@/components/connection-card-grid";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { createConnection, bulkCreateConnections } from "./actions";

export default async function ConnectionsPage(
  props: PageProps<"/dashboard/connections">,
) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";

  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const [departments, vaUsers] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "VA" }, orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session.role === "ADMIN";

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
        {session.role !== "VA" && (
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
        )}

        {session.role === "OM" ? (
          <TeamRoster connections={rows} />
        ) : session.role === "VA" ? (
          <ConnectionCardGrid connections={rows} />
        ) : (
          <ConnectionsTable connections={rows} isAdmin={isAdmin} />
        )}

        {isAdmin && <AddConnectionForms departments={departments} vaUsers={vaUsers} />}
      </div>
    </>
  );
}

function AddConnectionForms({
  departments,
  vaUsers,
}: {
  departments: { id: string; name: string }[];
  vaUsers: { id: string; name: string | null; email: string }[];
}) {
  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-dashed border-surface-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Add connection</summary>
        <form
          action={createConnection}
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Select name="vaUserId" required defaultValue="">
            <option value="" disabled>
              VA
            </option>
            {vaUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </Select>
          <Input name="clientName" placeholder="Client name" required />
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
          <Button type="submit" className="col-span-2 sm:col-span-4">
            Add Connection
          </Button>
        </form>
      </details>

      <details className="rounded-lg border border-dashed border-surface-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Bulk import connections
        </summary>
        <form action={bulkCreateConnections} className="mt-4 space-y-3">
          <p className="text-xs text-muted">
            One per line: <code>vaEmail,clientName</code> (the VA must already
            exist as a user)
          </p>
          <Textarea
            name="rows"
            placeholder={"testva@vaaphilippines.com,Acme Corp\nva2@vaaphilippines.com,Globex Inc"}
            rows={4}
            required
            className="w-full font-mono"
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
          <Button type="submit">Bulk Import</Button>
        </form>
      </details>
    </div>
  );
}
