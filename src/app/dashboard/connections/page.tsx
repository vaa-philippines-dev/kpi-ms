import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ConnectionsTable, type ConnectionRow } from "@/components/connections-table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { createConnection, bulkCreateConnections } from "./actions";

export default async function ConnectionsPage(
  props: PageProps<"/dashboard/connections">,
) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";
  const browsing = Boolean(departmentId || q);

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

  // Landing state: a department directory (with counts), not a giant list —
  // picking one (or searching) is what actually loads the table below.
  if (!browsing) {
    const counts = await prisma.connection.groupBy({
      by: ["departmentId"],
      where: scope,
      _count: true,
    });
    const countByDept = new Map(counts.map((c) => [c.departmentId, c._count]));
    const total = counts.reduce((sum, c) => sum + c._count, 0);

    return (
      <>
        <PageHeader
          title="Connections"
          description="VA ↔ client connections, sourced from the Workforce Management system."
        />
        <div className="max-w-3xl space-y-6">
          <form method="GET" className="flex gap-2">
            <Input
              name="q"
              placeholder="Search by client or VA…"
              className="w-full max-w-xs"
            />
            <Button type="submit">Search</Button>
          </form>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
              Browse by department ({total} total)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {departments.map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/connections?departmentId=${d.id}`}
                  className="rounded-lg border border-surface-border p-4 transition hover:border-accent hover:bg-surface-hover"
                >
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted">
                    {countByDept.get(d.id) ?? 0} connections
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {isAdmin && <AddConnectionForms departments={departments} vaUsers={vaUsers} />}
        </div>
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
      vaUser: true,
      statusEvents: { orderBy: { changedAt: "desc" }, take: 5, include: { changedBy: true } },
    },
  });

  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    clientName: c.clientName,
    vaName: c.vaUser.name ?? c.vaUser.email,
    vaEmail: c.vaUser.email,
    departmentName: c.department.name,
    status: c.status,
    connectionType: c.connectionType,
    isFlagged: c.isFlagged,
    notes: c.notes,
    statusEvents: c.statusEvents.map((e) => ({
      status: e.status,
      changedAt: e.changedAt.toISOString(),
      changedByName: e.changedBy.name ?? e.changedBy.email,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <form method="GET" className="flex flex-wrap gap-2">
            <Select name="departmentId" defaultValue={departmentId} className="w-40">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by client or VA…"
              className="w-full max-w-xs"
            />
            <Button type="submit">Filter</Button>
          </form>
          <Link href="/dashboard/connections" className="text-xs text-muted hover:underline">
            ← Back to departments
          </Link>
        </div>

        <ConnectionsTable connections={rows} isAdmin={isAdmin} />

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
