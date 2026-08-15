import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { UserRole } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { createUser, updateUser, toggleUserActive, bulkCreateUsers } from "./actions";

export default async function UsersPage() {
  const [session, users, departments, services, teams] = await Promise.all([
    auth(),
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { email: "asc" }],
      include: { department: true, service: true, team: true },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <>
      <PageHeader
        title="Users"
        description="Dashboard users and roles (Admin, DM, OM, Service Manager, VA)."
      />

      <div className="max-w-6xl space-y-8">
        <Table>
          <TableHead>
            <tr>
              <Th>Email</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Service</Th>
              <Th>Team</Th>
              <Th>Status</Th>
              {isAdmin && <Th />}
            </tr>
          </TableHead>
          <tbody>
            {users.length === 0 && (
              <Tr>
                <Td colSpan={isAdmin ? 8 : 7} className="py-6 text-center text-muted">
                  No users yet.
                </Td>
              </Tr>
            )}
            {users.map((u) =>
              isAdmin ? (
                <Tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                  <Td colSpan={8} className="!py-2">
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
                      <Select
                        name="departmentId"
                        defaultValue={u.departmentId ?? ""}
                        className="py-1"
                      >
                        <option value="">—</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
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
                      <div className="flex gap-2">
                        <TextAction type="submit">Save</TextAction>
                      </div>
                    </form>
                  </Td>
                </Tr>
              ) : (
                <Tr key={u.id}>
                  <Td>{u.email}</Td>
                  <Td>{u.name ?? "—"}</Td>
                  <Td className="text-muted">{roleLabel(u.role)}</Td>
                  <Td className="text-muted">{u.department?.name ?? "—"}</Td>
                  <Td className="text-muted">{u.service?.name ?? "—"}</Td>
                  <Td className="text-muted">{u.team?.name ?? "—"}</Td>
                  <Td className="text-muted">{u.isActive ? "Active" : "Deactivated"}</Td>
                </Tr>
              ),
            )}
          </tbody>
        </Table>

        {isAdmin && (
          <div className="space-y-4">
            {users.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {users.map((u) => (
                  <form key={u.id} action={toggleUserActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <TextAction type="submit" tone={u.isActive ? "danger" : undefined}>
                      {u.isActive ? "Deactivate" : "Reactivate"} {u.email}
                    </TextAction>
                  </form>
                ))}
              </div>
            )}

            <form
              action={createUser}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
            >
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

            <form
              action={bulkCreateUsers}
              className="space-y-3 rounded-lg border border-dashed border-surface-border p-4"
            >
              <p className="text-xs text-muted">
                Bulk import — one per line: <code>email,name,role</code> (name
                and role optional, role defaults to VA)
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
          </div>
        )}
      </div>
    </>
  );
}
