import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
} from "./actions";

export default async function DepartmentsPage() {
  const [session, departments] = await Promise.all([
    auth(),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { kpiDefinitions: true, connections: true } } },
    }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Departments"
        description="Department list used to cluster KPIs and connections."
      />

      <div className="max-w-2xl">
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">KPIs</th>
                <th className="px-4 py-2 font-medium">Connections</th>
                {isAdmin && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 4 : 3}
                    className="px-4 py-6 text-center text-muted"
                  >
                    No departments yet.
                  </td>
                </tr>
              )}
              {departments.map((dept) => (
                <tr key={dept.id} className="border-t border-surface-border">
                  {isAdmin ? (
                    <td className="px-4 py-2">
                      <form action={renameDepartment} className="flex gap-2">
                        <input type="hidden" name="id" value={dept.id} />
                        <input
                          name="name"
                          defaultValue={dept.name}
                          className="w-full rounded border border-surface-border bg-transparent px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="shrink-0 text-xs text-accent hover:underline"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  ) : (
                    <td className="px-4 py-2">{dept.name}</td>
                  )}
                  <td className="px-4 py-2 text-muted">
                    {dept._count.kpiDefinitions}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {dept._count.connections}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-right">
                      <form action={deleteDepartment}>
                        <input type="hidden" name="id" value={dept.id} />
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
            action={createDepartment}
            className="mt-4 flex gap-2 rounded-lg border border-dashed border-surface-border p-4"
          >
            <input
              name="name"
              placeholder="New department name"
              required
              className="w-full rounded border border-surface-border bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add
            </button>
          </form>
        )}
      </div>
    </>
  );
}
