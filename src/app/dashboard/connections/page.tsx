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

export default async function ConnectionsPage() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const [connections, departments, vaUsers] = await Promise.all([
    prisma.connection.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      include: {
        department: true,
        vaUser: true,
        statusEvents: { orderBy: { changedAt: "desc" }, take: 3, include: { changedBy: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "VA" }, orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first before creating connections." />
      ) : (
        <div className="max-w-5xl space-y-8">
          <Table>
            <TableHead>
              <tr>
                <Th>Connection ID</Th>
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Department</Th>
                <Th>Status</Th>
                <Th>Type</Th>
                <Th>Recent status changes</Th>
                <Th />
                {isAdmin && <Th />}
              </tr>
            </TableHead>
            <tbody>
              {connections.length === 0 && (
                <Tr>
                  <Td colSpan={isAdmin ? 9 : 8} className="py-6 text-center text-muted">
                    No connections yet.
                  </Td>
                </Tr>
              )}
              {connections.map((conn) => {
                const isTerminal = TERMINAL_STATUSES.has(conn.status);
                return (
                  <Tr key={conn.id}>
                    <Td className="font-mono text-xs text-muted">{conn.id}</Td>
                    <Td>
                      {conn.vaUser.name ?? conn.vaUser.email}
                      <div className="text-xs text-muted">{conn.vaUser.email}</div>
                    </Td>
                    <Td>{conn.clientName}</Td>
                    <Td className="text-muted">{conn.department.name}</Td>
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
                            <option value={ConnectionType.PROJECT_BASED}>Project-based</option>
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
                    <Td className="text-xs text-muted">
                      {conn.statusEvents.length === 0
                        ? "—"
                        : conn.statusEvents
                            .map(
                              (e) =>
                                `${STATUS_LABELS[e.status]} (${e.changedAt.toLocaleDateString()} by ${e.changedBy.name ?? e.changedBy.email})`,
                            )
                            .join(", ")}
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

          {isAdmin && (
            <form
              action={createConnection}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
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
          )}

          {isAdmin && (
            <form
              action={bulkCreateConnections}
              className="space-y-3 rounded-lg border border-dashed border-surface-border p-4"
            >
              <p className="text-xs text-muted">
                Bulk import — one per line: <code>vaEmail,clientName</code>{" "}
                (the VA must already exist as a user)
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
          )}
        </div>
      )}
    </>
  );
}
