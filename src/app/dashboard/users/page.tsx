import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEffectiveSession } from "@/lib/view-as";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UsersTable, type UserRow } from "@/components/users-table";
import { UserRole } from "@/generated/prisma/enums";
import { createUser, bulkCreateUsers } from "./actions";
import { UserActions } from "./user-actions";
import { UsersFilters } from "./users-filters";

const UNASSIGNED = "Unassigned";

// Mirrors legacy's Manager create-form role list (AppUsers.html:
// openCreateUser — 'Team Leader','Virtual Assistant' only). Ops Manager is
// DM-equivalent, so it gets the same manageable-role list.
const DM_ROLES: UserRole[] = [UserRole.OM, UserRole.VA];

// Mirrors legacy's getUsers() ACL (Users.js) — only Admin/Manager could even
// fetch the user list; every other role has no Users nav item at all (see
// nav.ts). A DM (or the DM-equivalent Ops Manager) is further scoped to
// their own department, same as legacy's client-side filter in
// renderUsers() ("Managers see only their department's users").
export default async function UsersPage(props: PageProps<"/dashboard/users">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const requestedDepartmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";

  const session = await getEffectiveSession();
  if (!session) {
    redirect("/sign-in");
  }
  if (session.role !== "ADMIN" && session.role !== "DM" && session.role !== "OPS_MANAGER") {
    redirect("/dashboard");
  }
  const isAdmin = session.role === "ADMIN";
  const isDM = session.role === "DM" || session.role === "OPS_MANAGER";

  // A DM/Ops Manager has exactly one department to browse, so skip the
  // picker entirely and always scope straight to it (never trusting the
  // query param).
  const departmentId = isDM ? (session.departmentId ?? "none") : requestedDepartmentId;
  const browsing = isDM || Boolean(departmentId || q);

  if (isDM && !session.departmentId) {
    return (
      <>
        <PageHeader title="Users" description="Users in your department." />
        <ComingSoon note="No department is assigned to your account yet — contact an admin." />
      </>
    );
  }

  const [departments, servicesAll, teamsAll] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);
  // A DM manages within their own department only, so their Add-user/Bulk
  // import/Edit dropdowns only ever offer that one department, and the
  // service/team lists narrow to match.
  const scopedDepartments = isDM
    ? departments.filter((d) => d.id === session.departmentId)
    : departments;
  const services = isDM ? servicesAll.filter((s) => s.departmentId === session.departmentId) : servicesAll;
  const teams = isDM ? teamsAll.filter((t) => t.departmentId === session.departmentId) : teamsAll;
  const canManage = isAdmin || isDM;
  const manageableRoles = isAdmin ? Object.values(UserRole) : DM_ROLES;

  // Landing state: a department directory (with counts), not a giant list —
  // picking one (or searching) is what actually loads the table below.
  // (DM skips this — see above.)
  if (!browsing) {
    const counts = await prisma.user.groupBy({ by: ["departmentId"], _count: true });
    const countByDept = new Map(counts.map((c) => [c.departmentId, c._count]));
    const unassignedCount = countByDept.get(null) ?? 0;
    const total = counts.reduce((sum, c) => sum + c._count, 0);

    return (
      <>
        <PageHeader
          title="Users"
          description="Dashboard users and roles (Admin, DM, Ops Manager, OM, Service Manager, VA)."
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
            {canManage && (
              <UserActions
                departments={scopedDepartments}
                services={services}
                teams={teams}
                roles={manageableRoles}
                isAdmin={isAdmin}
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
        ? { OR: [{ departmentId }, { additionalDepartments: { some: { departmentId } } }] }
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
    include: {
      department: true,
      service: true,
      team: true,
      additionalDepartments: { include: { department: true } },
    },
  });

  const rows: UserRow[] = users.map((u) => {
    const extraNames = u.additionalDepartments.map((d) => d.department.name);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      departmentName: [u.department?.name, ...extraNames].filter(Boolean).join(", ") || UNASSIGNED,
      serviceName: u.service?.name ?? null,
      teamName: u.team?.name ?? null,
      departmentId: u.departmentId,
      serviceId: u.serviceId,
      teamId: u.teamId,
      additionalDepartmentIds: u.additionalDepartments.map((d) => d.departmentId),
    };
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Dashboard users and roles (Admin, DM, Ops Manager, OM, Service Manager, VA)."
      />

      <UsersFilters
        isDM={isDM}
        departments={departments}
        actions={
          <>
            {!isDM && (
              <Link href="/dashboard/users" className="text-xs text-muted hover:underline">
                ← Back to departments
              </Link>
            )}
            {canManage && (
              <UserActions
                departments={scopedDepartments}
                services={services}
                teams={teams}
                roles={manageableRoles}
                isAdmin={isAdmin}
                createUser={createUser}
                bulkCreateUsers={bulkCreateUsers}
              />
            )}
          </>
        }
      >
        <UsersTable
          users={rows}
          departments={scopedDepartments}
          services={services}
          teams={teams}
          roles={manageableRoles}
          canManage={canManage}
          isAdmin={isAdmin}
          viewerDepartmentId={isDM ? session.departmentId : null}
        />
      </UsersFilters>
    </>
  );
}
