import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveSession } from "@/lib/view-as";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getUserTeamIds, teamMembershipWhere } from "@/lib/user-teams";

/**
 * "My Team(s)" — new nav entry for VAs (not in legacy), reachable at
 * /dashboard/my-team. Shows a VA who their team leader(s) and teammates are
 * — one card per team, since a hybrid VA (User.additionalDepartments) can
 * now hold one team per department (see User.additionalTeams). Deliberately
 * bare: just names, no status/active/client info — per user request, this
 * is an org-chart lookup, not another performance view.
 */
export default async function MyTeamPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  if (session.role !== "VA") redirect("/dashboard");

  const self = await prisma.user.findUnique({
    where: { id: session.id },
    select: { teamId: true, additionalTeams: { select: { teamId: true } } },
  });
  const teamIds = self ? getUserTeamIds(self) : [];

  if (teamIds.length === 0) {
    return (
      <>
        <PageHeader title="My Team" description="Your team leader and teammates." />
        <ComingSoon note="You're not assigned to a team yet." />
      </>
    );
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    include: { teamLeader: true },
    orderBy: { name: "asc" },
  });

  if (teams.length === 0) {
    return (
      <>
        <PageHeader title="My Team" description="Your team leader and teammates." />
        <ComingSoon note="Your team couldn't be found." />
      </>
    );
  }

  const rosters = await Promise.all(
    teams.map((team) =>
      prisma.user.findMany({
        where: teamMembershipWhere(team.id),
        select: { id: true, name: true, email: true },
      }),
    ),
  );

  return (
    <>
      <PageHeader
        title={teams.length > 1 ? "My Teams" : "My Team"}
        description={teams.map((t) => t.name).join(", ")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {teams.map((team, i) => {
          const members = rosters[i]
            .filter((m) => m.id !== team.teamLeaderId)
            .map((m) => ({ id: m.id, name: m.name ?? m.email }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <Card key={team.id} className="max-w-md p-5">
              <p className="text-xs font-semibold text-muted uppercase">{team.name}</p>
              <p className="mt-3 text-xs font-semibold text-muted uppercase">Team Leader</p>
              <p className="mt-1.5 text-sm font-medium">
                {team.teamLeader?.name ?? team.teamLeader?.email ?? "—"}
              </p>

              <p className="mt-5 text-xs font-semibold text-muted uppercase">Members</p>
              {members.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted">No other members yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {members.map((m) => (
                    <li key={m.id} className="text-sm">
                      {m.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
