import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createConnection, deleteConnection } from "./actions";

export default async function ConnectionsPage() {
  const [session, connections, departments] = await Promise.all([
    auth(),
    prisma.connection.findMany({
      orderBy: { createdAt: "desc" },
      include: { department: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first before creating connections." />
      ) : (
        <div className="max-w-3xl space-y-8">
          <Table>
            <TableHead>
              <tr>
                <Th>Connection ID</Th>
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Department</Th>
                {isAdmin && <Th />}
              </tr>
            </TableHead>
            <tbody>
              {connections.length === 0 && (
                <Tr>
                  <Td colSpan={isAdmin ? 5 : 4} className="py-6 text-center text-muted">
                    No connections yet.
                  </Td>
                </Tr>
              )}
              {connections.map((conn) => (
                <Tr key={conn.id}>
                  <Td className="font-mono text-xs text-muted">{conn.id}</Td>
                  <Td>
                    {conn.vaName}
                    <div className="text-xs text-muted">{conn.vaEmail}</div>
                  </Td>
                  <Td>{conn.clientName}</Td>
                  <Td className="text-muted">{conn.department.name}</Td>
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
              ))}
            </tbody>
          </Table>

          {isAdmin && (
            <form
              action={createConnection}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
            >
              <Input name="vaName" placeholder="VA name" required />
              <Input
                name="vaEmail"
                type="email"
                placeholder="VA work email"
                required
              />
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
        </div>
      )}
    </>
  );
}
