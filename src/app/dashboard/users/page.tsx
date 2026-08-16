import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { UsersTable, type UserRow } from "@/components/users-table";
import { createUser, bulkCreateUsers } from "./actions";
import { UserActions } from "./user-actions";

const UNASSIGNED = "Unassigned";

export default async function UsersPage(props: PageProps<"/dashboard/users">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";
  const browsing = Boolean(departmentId || q);

  const [session, departments, services, teams] = await Promise.all([
    auth(),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  // Landing state: a department directory (with counts), not a giant list —
  // picking one (or searching) is what actually loads the table below.
  if (!browsing) {
    const counts = await prisma.user.groupBy({ by: ["departmentId"], _count: true });
    const countByDept = new Map(counts.map((c) => [c.departmentId, c._count]));
    const unassignedCount = countByDept.get(null) ?? 0;
    const total = counts.reduce((sum, c) => sum + c._count, 0);

    return (
      <>
        <PageHeader
          title="Users"
          description="Dashboard users and roles (Admin, DM, OM, Service Manager, VA)."
        />
        <div className="max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-2">
            <form method="GET" className="flex gap-2">
              <Input
                name="q"
                placeholder="Search by email or name…"
                className="w-full max-w-xs"
              />
              <Button type="submit">Search</Button>
            </form>
            {isAdmin && (
              <UserActions
                departments={departments}
                services={services}
                teams={teams}
                createUser={createUser}
                bulkCreateUsers={bulkCreateUsers}
              />
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
              Browse by department ({total} total)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {departments.map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/users?departmentId=${d.id}`}
                  className="rounded-lg border border-surface-border p-4 transition hover:border-accent hover:bg-surface-hover"
                >
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted">
                    {countByDept.get(d.id) ?? 0} users
                  </div>
                </Link>
              ))}
              {unassignedCount > 0 && (
                <Link
                  href="/dashboard/users?departmentId=none"
                  className="rounded-lg border border-surface-border p-4 transition hover:border-accent hover:bg-surface-hover"
                >
                  <div className="font-medium">{UNASSIGNED}</div>
                  <div className="text-xs text-muted">{unassignedCount} users</div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  const searchFilter = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const where = {
    ...searchFilter,
    ...(departmentId === "none"
      ? { departmentId: null }
      : departmentId
        ? { departmentId }
        : {}),
  };

  // No server-side cap or grouping here anymore — the DataTable below does
  // its own client-side search/sort/filter/pagination (same as legacy's
  // renderUserPanel(), which loaded a role's full user list once and let
  // renderDataTable() slice it), so `departmentId` is the only thing worth
  // re-querying the server for.
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    include: { department: true, service: true, team: true },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    departmentName: u.department?.name ?? UNASSIGNED,
    serviceName: u.service?.name ?? null,
    teamName: u.team?.name ?? null,
    departmentId: u.departmentId,
    serviceId: u.serviceId,
    teamId: u.teamId,
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Dashboard users and roles (Admin, DM, OM, Service Manager, VA)."
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
              placeholder="Search by email or name…"
              className="w-full max-w-xs"
            />
            <Button type="submit">Filter</Button>
          </form>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/dashboard/users" className="text-xs text-muted hover:underline">
              ← Back to departments
            </Link>
            {isAdmin && (
              <UserActions
                departments={departments}
                services={services}
                teams={teams}
                createUser={createUser}
                bulkCreateUsers={bulkCreateUsers}
              />
            )}
          </div>
        </div>

        <UsersTable
          users={rows}
          departments={departments}
          services={services}
          teams={teams}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
