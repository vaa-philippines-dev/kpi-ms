import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveSession } from "@/lib/view-as";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input, Select } from "@/components/ui/input";
import { TeamRosterTable, type TeamMemberRow } from "@/components/team-roster-table";
import { roleLabel } from "@/lib/roles";
import {
  createTeam,
  updateTeam,
  deactivateTeam,
  addTeamMember,
} from "./actions";

export default async function TeamsPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  const role = session?.role;
  const isDeptScopedManager = role === "DM" || role === "OPS_MANAGER";
  const isManager = role === "ADMIN" || isDeptScopedManager;
  const departmentFilter =
    isDeptScopedManager && session?.departmentId
      ? { departmentId: session.departmentId }
      : {};
  // Users get a wider filter than Teams — a VA can belong to more than one
  // department (User.additionalDepartments), so they're eligible here if
  // the DM's department is either their primary or an additional one. A
  // Team itself is always single-department, so `departmentFilter` above
  // stays scalar-only for that query.
  const userDepartmentFilter =
    isDeptScopedManager && session?.departmentId
      ? {
          OR: [
            { departmentId: session.departmentId },
            { additionalDepartments: { some: { departmentId: session.departmentId } } },
          ],
        }
      : {};

  const [teams, departments, users] = await Promise.all([
    prisma.team.findMany({
      where: { isActive: true, ...departmentFilter },
      orderBy: { name: "asc" },
      include: {
        department: true,
        teamLeader: true,
        tempLeader1: true,
        tempLeader2: true,
        members: true,
      },
    }),
    prisma.department.findMany({
      where: isDeptScopedManager && session?.departmentId ? { id: session.departmentId } : {},
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: userDepartmentFilter, orderBy: { email: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Teams"
        description="Team rosters, leaders, and temp-leader coverage."
      />

      {departments.length === 0 ? (
        <ComingSoon note="Add at least one department first before creating teams." />
      ) : (
        <div className="max-w-5xl space-y-8">
          {teams.length === 0 && (
            <p className="text-sm text-muted">No teams yet.</p>
          )}
          {teams.map((team) => {
            const availableUsers = users.filter(
              (u) => u.teamId !== team.id && u.role !== "VA",
            );
            const availableVas = users.filter(
              (u) => u.role === "VA" && u.teamId !== team.id,
            );
            return (
              <div
                key={team.id}
                className="space-y-4 rounded-xl border border-surface-border p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{team.name}</h2>
                    <p className="text-xs text-muted">{team.department.name}</p>
                  </div>
                  {isManager && (
                    <ConfirmSubmitButton
                      action={deactivateTeam}
                      fields={{ id: team.id }}
                      label="Deactivate"
                      successMessage={`${team.name} deactivated.`}
                    />
                  )}
                </div>

                {isManager ? (
                  <form
                    action={updateTeam}
                    className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  >
                    <input type="hidden" name="id" value={team.id} />
                    <Input name="name" defaultValue={team.name} />
                    <Select
                      name="teamLeaderId"
                      defaultValue={team.teamLeaderId ?? ""}
                    >
                      <option value="">Team leader —</option>
                      {[team.teamLeader, ...availableUsers]
                        .filter(Boolean)
                        .map((u) => (
                          <option key={u!.id} value={u!.id}>
                            {u!.name ?? u!.email}
                          </option>
                        ))}
                    </Select>
                    <Select
                      name="tempLeader1Id"
                      defaultValue={team.tempLeader1Id ?? ""}
                    >
                      <option value="">Temp leader 1 —</option>
                      {[team.tempLeader1, ...availableUsers]
                        .filter(Boolean)
                        .map((u) => (
                          <option key={u!.id} value={u!.id}>
                            {u!.name ?? u!.email}
                          </option>
                        ))}
                    </Select>
                    <Select
                      name="tempLeader2Id"
                      defaultValue={team.tempLeader2Id ?? ""}
                    >
                      <option value="">Temp leader 2 —</option>
                      {[team.tempLeader2, ...availableUsers]
                        .filter(Boolean)
                        .map((u) => (
                          <option key={u!.id} value={u!.id}>
                            {u!.name ?? u!.email}
                          </option>
                        ))}
                    </Select>
                    <Button type="submit" className="col-span-2 sm:col-span-4">
                      Save
                    </Button>
                  </form>
                ) : (
                  <div className="text-sm text-muted">
                    Leader: {team.teamLeader?.name ?? team.teamLeader?.email ?? "—"}
                  </div>
                )}

                <TeamRosterTable
                  members={team.members.map(
                    (m): TeamMemberRow => ({
                      id: m.id,
                      name: m.name ?? m.email,
                      role: roleLabel(m.role),
                    }),
                  )}
                  isManager={isManager}
                  otherTeams={teams
                    .filter((t) => t.id !== team.id && t.departmentId === team.departmentId)
                    .map((t) => ({ id: t.id, name: t.name }))}
                />

                {isManager && availableVas.length > 0 && (
                  <form
                    action={addTeamMember}
                    className="flex gap-2"
                  >
                    <input type="hidden" name="teamId" value={team.id} />
                    <Select name="userId" defaultValue="" required className="w-full">
                      <option value="" disabled>
                        Add VA to team
                      </option>
                      {availableVas.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.email}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" className="shrink-0">
                      Add
                    </Button>
                  </form>
                )}
              </div>
            );
          })}

          {isManager && (
            <form
              action={createTeam}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
            >
              <Input name="name" placeholder="Team name" required />
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
              <Select name="teamLeaderId" defaultValue="">
                <option value="">Team leader (optional)</option>
                {users
                  .filter((u) => u.role !== "VA")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
              </Select>
              <Button type="submit">Add Team</Button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
