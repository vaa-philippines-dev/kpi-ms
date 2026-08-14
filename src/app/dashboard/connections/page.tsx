import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
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
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Connection ID</th>
                  <th className="px-4 py-2 font-medium">VA</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {connections.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdmin ? 5 : 4}
                      className="px-4 py-6 text-center text-muted"
                    >
                      No connections yet.
                    </td>
                  </tr>
                )}
                {connections.map((conn) => (
                  <tr key={conn.id} className="border-t border-surface-border">
                    <td className="px-4 py-2 font-mono text-xs text-muted">
                      {conn.id}
                    </td>
                    <td className="px-4 py-2">
                      {conn.vaName}
                      <div className="text-xs text-muted">{conn.vaEmail}</div>
                    </td>
                    <td className="px-4 py-2">{conn.clientName}</td>
                    <td className="px-4 py-2 text-muted">
                      {conn.department.name}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <form action={deleteConnection}>
                          <input type="hidden" name="id" value={conn.id} />
                          <button
                            type="submit"
                            className="text-xs text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <form
              action={createConnection}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
            >
              <input
                name="vaName"
                placeholder="VA name"
                required
                className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
              />
              <input
                name="vaEmail"
                type="email"
                placeholder="VA work email"
                required
                className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
              />
              <input
                name="clientName"
                placeholder="Client name"
                required
                className="rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
              />
              <select
                name="departmentId"
                required
                defaultValue=""
                className="rounded border border-surface-border bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Department
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="col-span-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 sm:col-span-4"
              >
                Add Connection
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
