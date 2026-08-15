import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
  createService,
  renameService,
  toggleServiceActive,
} from "./actions";

export default async function DepartmentsPage() {
  const [session, departments, services] = await Promise.all([
    auth(),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { kpiDefinitions: true, connections: true } },
      },
    }),
    prisma.service.findMany({
      orderBy: { name: "asc" },
      include: { department: true },
    }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Departments"
        description="Department list used to cluster KPIs and connections."
      />

      <div className="max-w-2xl space-y-4">
        <Table>
          <TableHead>
            <tr>
              <Th>Name</Th>
              <Th>KPIs</Th>
              <Th>Connections</Th>
              {isAdmin && <Th />}
            </tr>
          </TableHead>
          <tbody>
            {departments.length === 0 && (
              <Tr>
                <Td colSpan={isAdmin ? 4 : 3} className="py-6 text-center text-muted">
                  No departments yet.
                </Td>
              </Tr>
            )}
            {departments.map((dept) => (
              <Tr key={dept.id}>
                {isAdmin ? (
                  <Td>
                    <form action={renameDepartment} className="flex gap-2">
                      <input type="hidden" name="id" value={dept.id} />
                      <Input
                        name="name"
                        defaultValue={dept.name}
                        className="w-full py-1"
                      />
                      <TextAction type="submit" className="shrink-0">
                        Save
                      </TextAction>
                    </form>
                  </Td>
                ) : (
                  <Td>{dept.name}</Td>
                )}
                <Td className="text-muted">{dept._count.kpiDefinitions}</Td>
                <Td className="text-muted">{dept._count.connections}</Td>
                {isAdmin && (
                  <Td className="text-right">
                    <form action={deleteDepartment}>
                      <input type="hidden" name="id" value={dept.id} />
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
            action={createDepartment}
            className="flex gap-2 rounded-lg border border-dashed border-surface-border p-4"
          >
            <Input
              name="name"
              placeholder="New department name"
              required
              className="w-full"
            />
            <Button type="submit" className="shrink-0">
              Add
            </Button>
          </form>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
            Services
          </h2>
          <Table>
            <TableHead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Status</Th>
                {isAdmin && <Th />}
              </tr>
            </TableHead>
            <tbody>
              {services.length === 0 && (
                <Tr>
                  <Td colSpan={isAdmin ? 4 : 3} className="py-6 text-center text-muted">
                    No services yet.
                  </Td>
                </Tr>
              )}
              {services.map((svc) => (
                <Tr key={svc.id} className={svc.isActive ? "" : "opacity-50"}>
                  {isAdmin ? (
                    <Td>
                      <form action={renameService} className="flex gap-2">
                        <input type="hidden" name="id" value={svc.id} />
                        <Input
                          name="name"
                          defaultValue={svc.name}
                          className="w-full py-1"
                        />
                        <TextAction type="submit" className="shrink-0">
                          Save
                        </TextAction>
                      </form>
                    </Td>
                  ) : (
                    <Td>{svc.name}</Td>
                  )}
                  <Td className="text-muted">{svc.department.name}</Td>
                  <Td className="text-muted">
                    {svc.isActive ? "Active" : "Inactive"}
                  </Td>
                  {isAdmin && (
                    <Td className="text-right">
                      <form action={toggleServiceActive}>
                        <input type="hidden" name="id" value={svc.id} />
                        <TextAction
                          type="submit"
                          tone={svc.isActive ? "danger" : undefined}
                        >
                          {svc.isActive ? "Deactivate" : "Reactivate"}
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
              action={createService}
              className="mt-4 flex gap-2 rounded-lg border border-dashed border-surface-border p-4"
            >
              <Input name="name" placeholder="New service name" required />
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
              <Button type="submit" className="shrink-0">
                Add
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
