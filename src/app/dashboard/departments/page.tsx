import { prisma } from "@/lib/prisma";
import { getEffectiveSession } from "@/lib/view-as";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  DepartmentsTable,
  ServicesTable,
  type DepartmentRow,
  type ServiceRow,
} from "@/components/departments-table";
import { createDepartment, createService } from "./actions";

export default async function DepartmentsPage() {
  const [session, departments, services] = await Promise.all([
    getEffectiveSession(),
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
  const isAdmin = session?.role === "ADMIN";

  const departmentRows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    kpiCount: d._count.kpiDefinitions,
    connectionCount: d._count.connections,
    submissionWindowStart: d.submissionWindowStart,
    submissionWindowEnd: d.submissionWindowEnd,
  }));

  const serviceRows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    departmentName: s.department.name,
    isActive: s.isActive,
  }));

  return (
    <>
      <PageHeader
        title="Departments"
        description="Department list used to cluster KPIs and connections."
      />

      <div className="space-y-8">
        <div className="space-y-4">
          <DepartmentsTable departments={departmentRows} isAdmin={isAdmin} />

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
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase">Services</h2>
          <ServicesTable services={serviceRows} isAdmin={isAdmin} />

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
