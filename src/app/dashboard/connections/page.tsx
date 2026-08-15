import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { ConnectionStatus, ConnectionType } from "@/generated/prisma/enums";
import {
  createConnection,
  deleteConnection,
  updateConnectionStatus,
  updateConnectionType,
  bulkCreateConnections,
} from "./actions";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  END_OF_CONTRACT: "End of Contract",
  END_OF_PROJECT: "End of Project",
  PENDING: "Pending",
};

const TERMINAL_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
]);

const PAGE_SIZE = 100;

export default async function ConnectionsPage(
  props: PageProps<"/dashboard/connections">,
) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const connectionType =
    typeof searchParams.connectionType === "string" ? searchParams.connectionType : "";
  const browsing = Boolean(departmentId || q || status || connectionType);

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
    ...(status ? { status: status as ConnectionStatus } : {}),
    ...(connectionType ? { connectionType: connectionType as ConnectionType } : {}),
  };

  const [totalCount, connections] = await Promise.all([
    prisma.connection.count({ where }),
    prisma.connection.findMany({
      where,
      take: PAGE_SIZE,
      orderBy: [{ department: { name: "asc" } }, { clientName: "asc" }],
      include: {
        department: true,
        vaUser: true,
        statusEvents: { orderBy: { changedAt: "desc" }, take: 3, include: { changedBy: true } },
      },
    }),
  ]);

  const grouped = new Map<string, typeof connections>();
  for (const c of connections) {
    const key = c.department.name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }
  const groupEntries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />

      <div className="max-w-5xl space-y-8">
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
            <Select name="status" defaultValue={status} className="w-36">
              <option value="">Any status</option>
              {Object.values(ConnectionStatus).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select name="connectionType" defaultValue={connectionType} className="w-36">
              <option value="">Any type</option>
              <option value={ConnectionType.REGULAR}>Regular</option>
              <option value={ConnectionType.PROJECT_BASED}>Project-based</option>
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

        <p className="text-xs text-muted">
          Showing {connections.length} of {totalCount}
          {totalCount > PAGE_SIZE && " — refine your search to see more"}
        </p>

        {groupEntries.map(([deptName, groupConns]) => (
          <div key={deptName}>
            <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
              {deptName}
              <span className="ml-2 font-normal normal-case text-muted/70">
                ({groupConns.length})
              </span>
            </h2>
            <Table>
              <TableHead>
                <tr>
                  <Th>VA</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th>Type</Th>
                  <Th />
                  {isAdmin && <Th />}
                </tr>
              </TableHead>
              <tbody>
                {groupConns.map((conn) => {
                  const isTerminal = TERMINAL_STATUSES.has(conn.status);
                  return (
                    <Tr key={conn.id}>
                      <Td>
                        {conn.vaUser.name ?? conn.vaUser.email}
                        <div className="text-xs text-muted">{conn.vaUser.email}</div>
                      </Td>
                      <Td>{conn.clientName}</Td>
                      <Td>
                        {isAdmin && !isTerminal ? (
                          <form action={updateConnectionStatus} className="flex gap-1">
                            <input type="hidden" name="id" value={conn.id} />
                            <Select name="status" defaultValue={conn.status} className="py-1">
                              {Object.values(ConnectionStatus).map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </Select>
                            <TextAction type="submit">Save</TextAction>
                          </form>
                        ) : (
                          <span className="text-muted">{STATUS_LABELS[conn.status]}</span>
                        )}
                      </Td>
                      <Td>
                        {isAdmin ? (
                          <form action={updateConnectionType} className="flex gap-1">
                            <input type="hidden" name="id" value={conn.id} />
                            <Select
                              name="connectionType"
                              defaultValue={conn.connectionType}
                              className="py-1"
                            >
                              <option value={ConnectionType.REGULAR}>Regular</option>
                              <option value={ConnectionType.PROJECT_BASED}>
                                Project-based
                              </option>
                            </Select>
                            <TextAction type="submit">Save</TextAction>
                          </form>
                        ) : (
                          <span className="text-muted">
                            {conn.connectionType === ConnectionType.REGULAR
                              ? "Regular"
                              : "Project-based"}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Link
                          href={`/dashboard/connections/kpi-config?connectionId=${conn.id}`}
                          className="text-xs text-accent hover:underline"
                        >
                          KPI Config →
                        </Link>
                      </Td>
                      {isAdmin && (
                        <Td className="text-right">
                          <form action={deleteConnection}>
                            <input type="hidden" name="id" value={conn.id} />
                            <TextAction type="submit" tone="danger">
                              Delete
                            </TextAction>
                          </form>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ))}

        {connections.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No connections found.</p>
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
