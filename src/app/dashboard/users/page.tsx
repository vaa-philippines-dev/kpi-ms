import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { UserRole } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { createUser, updateUser, toggleUserActive, bulkCreateUsers } from "./actions";

const PAGE_SIZE = 100;
const UNASSIGNED = "Unassigned";

export default async function UsersPage(props: PageProps<"/dashboard/users">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";
  const role = typeof searchParams.role === "string" ? searchParams.role : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const browsing = Boolean(departmentId || q || role || status);

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
          <form method="GET" className="flex gap-2">
            <Input
              name="q"
              placeholder="Search by email or name…"
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

          {isAdmin && (
            <AddUserForms departments={departments} services={services} teams={teams} />
          )}
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
    ...(role ? { role: role as UserRole } : {}),
    ...(status ? { isActive: status === "active" } : {}),
  };

  const [totalCount, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      take: PAGE_SIZE,
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }, { email: "asc" }],
      include: { department: true, service: true, team: true },
    }),
  ]);

  const grouped = new Map<string, typeof users>();
  for (const u of users) {
    const key = u.department?.name ?? UNASSIGNED;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(u);
  }
  const groupEntries = [...grouped.entries()].sort(([a], [b]) => {
    if (a === UNASSIGNED) return 1;
    if (b === UNASSIGNED) return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Dashboard users and roles (Admin, DM, OM, Service Manager, VA)."
      />

      <div className="max-w-6xl space-y-6">
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
            <Select name="role" defaultValue={role} className="w-36">
              <option value="">All roles</option>
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={status} className="w-32">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </Select>
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by email or name…"
              className="w-full max-w-xs"
            />
            <Button type="submit">Filter</Button>
          </form>
          <Link href="/dashboard/users" className="text-xs text-muted hover:underline">
            ← Back to departments
          </Link>
        </div>

        <p className="text-xs text-muted">
          Showing {users.length} of {totalCount}
          {totalCount > PAGE_SIZE && " — refine your search to see more"}
        </p>

        {groupEntries.map(([deptName, groupUsers]) => (
          <div key={deptName}>
            <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
              {deptName}
              <span className="ml-2 font-normal normal-case text-muted/70">
                ({groupUsers.length})
              </span>
            </h2>
            <Table>
              <TableHead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Service</Th>
                  <Th>Team</Th>
                  <Th>Status</Th>
                  {isAdmin && <Th />}
                </tr>
              </TableHead>
              <tbody>
                {groupUsers.map((u) =>
                  isAdmin ? (
                    <Tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                      <Td colSpan={6} className="!py-2">
                        <form
                          action={updateUser}
                          className="grid grid-cols-8 items-center gap-2"
                        >
                          <input type="hidden" name="id" value={u.id} />
                          <span className="truncate text-xs text-muted">{u.email}</span>
                          <Input name="name" defaultValue={u.name ?? ""} className="py-1" />
                          <Select name="role" defaultValue={u.role} className="py-1">
                            {Object.values(UserRole).map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </Select>
                          <input type="hidden" name="departmentId" value={u.departmentId ?? ""} />
                          <Select
                            name="serviceId"
                            defaultValue={u.serviceId ?? ""}
                            className="py-1"
                          >
                            <option value="">—</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </Select>
                          <Select name="teamId" defaultValue={u.teamId ?? ""} className="py-1">
                            <option value="">—</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                          <span className="text-xs text-muted">
                            {u.isActive ? "Active" : "Deactivated"}
                          </span>
                          <TextAction type="submit">Save</TextAction>
                        </form>
                      </Td>
                      <Td className="!py-2 text-right">
                        <form action={toggleUserActive}>
                          <input type="hidden" name="id" value={u.id} />
                          <TextAction type="submit" tone={u.isActive ? "danger" : undefined}>
                            {u.isActive ? "Deactivate" : "Reactivate"}
                          </TextAction>
                        </form>
                      </Td>
                    </Tr>
                  ) : (
                    <Tr key={u.id}>
                      <Td>{u.email}</Td>
                      <Td>{u.name ?? "—"}</Td>
                      <Td className="text-muted">{roleLabel(u.role)}</Td>
                      <Td className="text-muted">{u.service?.name ?? "—"}</Td>
                      <Td className="text-muted">{u.team?.name ?? "—"}</Td>
                      <Td className="text-muted">{u.isActive ? "Active" : "Deactivated"}</Td>
                    </Tr>
                  ),
                )}
              </tbody>
            </Table>
          </div>
        ))}

        {users.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No users found.</p>
        )}

        {isAdmin && (
          <AddUserForms departments={departments} services={services} teams={teams} />
        )}
      </div>
    </>
  );
}

function AddUserForms({
  departments,
  services,
  teams,
}: {
  departments: { id: string; name: string }[];
  services: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-dashed border-surface-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Add user</summary>
        <form action={createUser} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            name="email"
            type="email"
            placeholder="Work email"
            required
            className="sm:col-span-2"
          />
          <Input name="name" placeholder="Name (optional)" />
          <Select name="role" defaultValue={UserRole.VA} required>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <Select name="departmentId" defaultValue="">
            <option value="">Department (optional)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="serviceId" defaultValue="">
            <option value="">Service (optional)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="teamId" defaultValue="">
            <option value="">Team (optional)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button type="submit" className="col-span-2 sm:col-span-4">
            Add User
          </Button>
        </form>
      </details>

      <details className="rounded-lg border border-dashed border-surface-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Bulk import users</summary>
        <form action={bulkCreateUsers} className="mt-4 space-y-3">
          <p className="text-xs text-muted">
            One per line: <code>email,name,role</code> (name and role optional,
            role defaults to VA)
          </p>
          <Textarea
            name="rows"
            placeholder={"va1@vaaphilippines.com,VA One,VA\nva2@vaaphilippines.com"}
            rows={4}
            required
            className="w-full font-mono"
          />
          <div className="grid grid-cols-3 gap-3">
            <Select name="departmentId" defaultValue="">
              <option value="">Department (optional)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select name="serviceId" defaultValue="">
              <option value="">Service (optional)</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="teamId" defaultValue="">
              <option value="">Team (optional)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Bulk Import</Button>
        </form>
      </details>
    </div>
  );
}
